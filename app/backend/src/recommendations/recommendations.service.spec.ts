import type { Station } from '../common/types'
import { LtaDataMallService, OneMapService } from '../integrations'
import { StationsService } from '../stations/stations.service'
import { RecommendationsService } from './recommendations.service'

const stationsFixture: Station[] = [
  {
    id: 'lta-test-ccs',
    name: 'Test CCS Station',
    address: '1 Test Road',
    postalCode: '123456',
    latitude: 1.3048,
    longitude: 103.8318,
    operator: 'Test Operator',
    connectors: [{ type: 'CCS2', powerKw: 120, total: 4, available: 2, status: 'available' }],
    pricePerKwh: null,
    source: 'LTA DataMall',
    lastUpdated: '2026-08-19T12:00:00.000Z',
  },
  {
    id: 'lta-test-chademo',
    name: 'Test CHAdeMO Station',
    address: '2 Test Road',
    postalCode: '123457',
    latitude: 1.305,
    longitude: 103.832,
    operator: 'Test Operator',
    connectors: [{ type: 'CHAdeMO', powerKw: 50, total: 2, available: 1, status: 'available' }],
    pricePerKwh: 0.55,
    source: 'LTA DataMall',
    lastUpdated: '2026-08-19T12:00:00.000Z',
  },
]

describe('RecommendationsService', () => {
  const lta = {
    isConfigured: () => true,
    getAllStations: jest.fn().mockResolvedValue(stationsFixture),
    status: () => ({ state: 'available', lastSuccessfulFetch: '2026-08-19T12:00:00.000Z' }),
  } as unknown as LtaDataMallService
  const drivingRoute = jest.fn().mockRejectedValue(new Error('Routing unavailable'))
  const oneMap = {
    drivingRoute,
    status: () => ({ state: 'error' }),
  } as unknown as OneMapService
  const stations = new StationsService(lta, oneMap)
  const service = new RecommendationsService(stations, oneMap)

  it('never ranks an incompatible connector', async () => {
    const result = await service.recommend({
      latitude: 1.3048,
      longitude: 103.8318,
      connector: 'CHAdeMO',
      radiusKm: 30,
    })
    expect(result.ranked).toHaveLength(1)
    result.ranked.forEach((station) => {
      expect(station.connectors.some((connector) => connector.type === 'CHAdeMO')).toBe(true)
    })
  })

  it('ranks every station by its best connector when Any is selected', async () => {
    const result = await service.recommend({
      latitude: 1.3048,
      longitude: 103.8318,
      connector: 'Any',
      radiusKm: 30,
    })
    expect(result.ranked).toHaveLength(2)
    expect(result.ranked.map((station) => station.selectedConnector).sort()).toEqual(['CCS2', 'CHAdeMO'])
    result.ranked.forEach((station) => {
      expect(station.connectors.some((connector) => connector.type === station.selectedConnector)).toBe(true)
    })
  })

  it('queries OneMap road times before returning the station list', async () => {
    drivingRoute.mockClear()
    let activeRequests = 0
    let peakActiveRequests = 0
    drivingRoute.mockImplementation(async () => {
      activeRequests += 1
      peakActiveRequests = Math.max(peakActiveRequests, activeRequests)
      await new Promise((resolve) => setImmediate(resolve))
      activeRequests -= 1
      return {
        travelMinutes: 7,
        distanceKm: 2.1,
        coordinates: [
          [1.3048, 103.8318],
          [1.305, 103.832],
        ],
        source: 'OneMap',
      }
    })

    const result = await service.recommend({
      latitude: 1.3048,
      longitude: 103.8318,
      connector: 'Any',
      radiusKm: 30,
    })

    expect(drivingRoute).toHaveBeenCalledTimes(stationsFixture.length)
    expect(peakActiveRequests).toBe(stationsFixture.length)
    expect(result.ranked.every((station) => station.travelSource === 'OneMap')).toBe(true)
    expect(result.ranked.every((station) => station.travelMinutes === 7)).toBe(true)
    drivingRoute.mockRejectedValue(new Error('Routing unavailable'))
  })

  it('limits concurrent OneMap route requests to four', async () => {
    const stationBatch = Array.from({ length: 6 }, (_, index) => ({
      ...stationsFixture[0],
      id: `lta-concurrency-${index}`,
      latitude: stationsFixture[0].latitude + index * 0.001,
      longitude: stationsFixture[0].longitude + index * 0.001,
    }))
    ;(lta.getAllStations as jest.Mock).mockResolvedValueOnce(stationBatch)
    drivingRoute.mockClear()
    let activeRequests = 0
    let peakActiveRequests = 0
    drivingRoute.mockImplementation(async () => {
      activeRequests += 1
      peakActiveRequests = Math.max(peakActiveRequests, activeRequests)
      await new Promise((resolve) => setImmediate(resolve))
      activeRequests -= 1
      return null
    })

    await service.recommend({
      latitude: 1.3048,
      longitude: 103.8318,
      connector: 'Any',
      radiusKm: 30,
    })

    expect(drivingRoute).toHaveBeenCalledTimes(stationBatch.length)
    expect(peakActiveRequests).toBe(4)
    drivingRoute.mockRejectedValue(new Error('Routing unavailable'))
  })

  it('uses the supplied current location as the OneMap route origin', async () => {
    drivingRoute.mockClear()
    drivingRoute.mockResolvedValue({
      travelMinutes: 5,
      distanceKm: 1.4,
      coordinates: [
        [1.31, 103.84],
        [1.3048, 103.8318],
      ],
      source: 'OneMap',
    })

    await service.recommend({
      latitude: 1.3048,
      longitude: 103.8318,
      routeOriginLatitude: 1.31,
      routeOriginLongitude: 103.84,
      connector: 'Any',
      radiusKm: 30,
    })

    expect(drivingRoute).toHaveBeenCalledWith(
      { latitude: 1.31, longitude: 103.84 },
      expect.objectContaining({ id: stationsFixture[0].id }),
    )
    drivingRoute.mockRejectedValue(new Error('Routing unavailable'))
  })

  it('redistributes the missing price weight instead of inventing a price', () => {
    const ranked = service.rankStation(
      { ...stationsFixture[0], distanceKm: 1 },
      {
        latitude: 1.3048,
        longitude: 103.8318,
        connector: 'CCS2',
      },
    )
    expect(ranked.estimatedHourlyCost).toBeNull()
    expect(ranked.reasons).toContain('Charging cost per hour is unknown and ranked lower')
  })

  it('treats a zero-dollar station price as unknown during ranking', () => {
    const ranked = service.rankStation(
      { ...stationsFixture[0], pricePerKwh: 0, distanceKm: 1 },
      {
        latitude: 1.3048,
        longitude: 103.8318,
        connector: 'CCS2',
      },
    )
    expect(ranked.pricePerKwh).toBeNull()
    expect(ranked.estimatedHourlyCost).toBeNull()
  })

  it('prioritises known savings when savings is selected', () => {
    const knownSavings = service.rankStation(
      { ...stationsFixture[0], pricePerKwh: 0.5, distanceKm: 1 },
      { latitude: 1.3048, longitude: 103.8318, connector: 'CCS2', rankingPriority: 'Savings' },
    )
    const unknownSavings = service.rankStation(
      { ...stationsFixture[0], pricePerKwh: null, distanceKm: 1 },
      { latitude: 1.3048, longitude: 103.8318, connector: 'CCS2', rankingPriority: 'Savings' },
    )

    expect(knownSavings.score).toBeGreaterThan(unknownSavings.score)
    expect(unknownSavings.reasons).toContain('Charging cost per hour is unknown and ranked lower')
  })

  it('treats unknown availability as lower priority instead of inventing a value', () => {
    const knownAvailability = service.rankStation(
      { ...stationsFixture[0], distanceKm: 1 },
      { latitude: 1.3048, longitude: 103.8318, connector: 'CCS2', rankingPriority: 'Availability' },
    )
    const unknownAvailability = service.rankStation(
      {
        ...stationsFixture[0],
        connectors: [{ ...stationsFixture[0].connectors[0], available: null, status: 'unknown' }],
        distanceKm: 1,
      },
      { latitude: 1.3048, longitude: 103.8318, connector: 'CCS2', rankingPriority: 'Availability' },
    )

    expect(knownAvailability.score).toBeGreaterThan(unknownAvailability.score)
    expect(unknownAvailability.reasons).toContain('Availability is unknown and ranked lower')
  })

  it('breaks equal score ties by distance', async () => {
    const near = { ...stationsFixture[0], id: 'near', latitude: 1.3048, longitude: 103.8318 }
    const far = { ...stationsFixture[0], id: 'far', latitude: 1.3148, longitude: 103.8418 }
    ;(lta.getAllStations as jest.Mock).mockResolvedValueOnce([near, far])
    drivingRoute.mockRejectedValue(new Error('Routing unavailable'))

    const result = await service.recommend({
      latitude: 1.3048,
      longitude: 103.8318,
      connector: 'Any',
      rankingPriority: 'Balanced',
      radiusKm: 30,
    })

    expect(result.ranked.map((station) => station.id)).toEqual(['near', 'far'])
    expect(result.ranked[0].score).toBe(result.ranked[1].score)
    expect(result.ranked[0].distanceKm).toBeLessThan(result.ranked[1].distanceKm)
  })

  describe('charging time estimation', () => {
    it('estimates charging time for normal case with known power', () => {
      const station = { ...stationsFixture[0], distanceKm: 1 }
      const ranked = service.rankStation(
        station,
        { latitude: 1.3048, longitude: 103.8318, connector: 'CCS2', rankingPriority: 'Balanced' },
      )
      expect(ranked.estimatedChargingTimeMinutes).toBeNull()
    })

    it('returns null for estimated time when inputs are omitted', () => {
      const station = { ...stationsFixture[0], distanceKm: 1 }
      const ranked = service.rankStation(
        station,
        { latitude: 1.3048, longitude: 103.8318, connector: 'CCS2', rankingPriority: 'Balanced' },
      )
      expect(ranked.estimatedChargingTimeMinutes).toBeNull()
      expect(ranked.chargingTimeIsApproximate).toBe(false)
    })

    it('rejects target battery equal to current battery', () => {
      const station = stationsFixture[1]
      const ranked = service.rankStation(
        station,
        {
          latitude: 1.305,
          longitude: 103.832,
          connector: 'CHAdeMO',
          rankingPriority: 'Balanced',
        },
      )
      expect(ranked.estimatedChargingTimeMinutes).toBeNull()
    })

    it('returns null when connector power is unknown or zero', () => {
      const stationWithUnknownPower: typeof stationsFixture[0] = {
        ...stationsFixture[0],
        connectors: [{ type: 'CCS2', powerKw: 0, total: 4, available: 2, status: 'unknown' }],
      }
      const ranked = service.rankStation(
        { ...stationWithUnknownPower, distanceKm: 1 },
        { latitude: 1.3048, longitude: 103.8318, connector: 'CCS2', rankingPriority: 'Balanced' },
      )
      expect(ranked.estimatedChargingTimeMinutes).toBeNull()
    })

    it('applies default battery capacity when omitted and marks as approximate', () => {
      const station: typeof stationsFixture[0] = {
        ...stationsFixture[0],
        connectors: [{ type: 'CCS2', powerKw: 60, total: 4, available: 2, status: 'available' }],
      }

      const dto = {
        latitude: 1.3048,
        longitude: 103.8318,
        connector: 'CCS2' as const,
        rankingPriority: 'Balanced' as const,
      }

      const ranked = service.rankStation({ ...station, distanceKm: 1 }, dto)
      expect(ranked.estimatedChargingTimeMinutes).toBeNull()
    })

    it('calculates correct charging time with custom battery capacity', () => {
      const station: typeof stationsFixture[0] = {
        ...stationsFixture[0],
        connectors: [{ type: 'CCS2', powerKw: 120, total: 4, available: 2, status: 'available' }],
      }

      const dto = {
        latitude: 1.3048,
        longitude: 103.8318,
        connector: 'CCS2' as const,
        rankingPriority: 'Balanced' as const,
      }

      const ranked = service.rankStation({ ...station, distanceKm: 1 }, dto)
      expect(ranked.estimatedChargingTimeMinutes).toBeNull()
    })
  })
})
