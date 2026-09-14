import { isStationWithinCorridor, filterStationsByCorridor } from './corridor-filter'
import type { Station } from '../common/types'
import type { RouteCoordinate } from '../integrations/onemap/onemap.service'

describe('Corridor Filter', () => {
  const mockStation = (latitude: number, longitude: number, id: string = 'test'): Station => ({
    id,
    name: 'Test Station',
    address: 'Test Address',
    postalCode: '123456',
    latitude,
    longitude,
    source: 'LTA DataMall',
    operator: 'TestOp',
    lastUpdated: new Date().toISOString(),
    pricePerKwh: 0.5,
    connectors: [
      {
        type: 'CCS2',
        powerKw: 50,
        status: 'available',
        available: 2,
        total: 4,
      },
    ],
  })

  describe('isStationWithinCorridor', () => {
    it('should return true for station close to route', () => {
      // Route from Singapore CBD (1.28, 103.85) to Marina Bay (1.2823, 103.8581) - ~1km away
      const routeCoordinates: RouteCoordinate[] = [
        [1.28, 103.85],
        [1.2823, 103.8581],
      ]
      // Station ~0.5km from route
      const station = mockStation(1.2812, 103.8541, 'near-station')

      expect(isStationWithinCorridor(station, routeCoordinates)).toBe(true)
    })

    it('should return false for station outside corridor (> 2km)', () => {
      const routeCoordinates: RouteCoordinate[] = [
        [1.28, 103.85],
        [1.2823, 103.8581],
      ]
      // Station ~3km from route
      const station = mockStation(1.31, 103.85, 'far-station')

      expect(isStationWithinCorridor(station, routeCoordinates)).toBe(false)
    })

    it('should return true for station within 2km boundary', () => {
      // Create a simple east-west route along a latitude
      const routeCoordinates: RouteCoordinate[] = [
        [1.28, 103.85],
        [1.28, 103.95],
      ]
      // Station approximately 1.5km from route (east)
      const station = mockStation(1.28, 103.862, 'boundary-station')

      expect(isStationWithinCorridor(station, routeCoordinates)).toBe(true)
    })

    it('should return false for empty route coordinates', () => {
      const station = mockStation(1.28, 103.85)

      expect(isStationWithinCorridor(station, [])).toBe(false)
    })

    it('should return false for single-point route', () => {
      const routeCoordinates: RouteCoordinate[] = [[1.28, 103.85]]
      const station = mockStation(1.29, 103.85)

      expect(isStationWithinCorridor(station, routeCoordinates)).toBe(false)
    })
  })

  describe('filterStationsByCorridor', () => {
    it('should filter stations by corridor distance', () => {
      const routeCoordinates: RouteCoordinate[] = [
        [1.28, 103.85],
        [1.2823, 103.8581],
      ]

      const stations: Station[] = [
        mockStation(1.2812, 103.8541, 'within-station'),
        mockStation(1.31, 103.85, 'outside-station'),
        mockStation(1.2815, 103.8555, 'within-station-2'),
      ]

      const filtered = filterStationsByCorridor(stations, routeCoordinates)

      expect(filtered.length).toBe(2)
      expect(filtered.every((s) => ['within-station', 'within-station-2'].includes(s.id))).toBe(true)
    })

    it('should return empty array if no stations are within corridor', () => {
      const routeCoordinates: RouteCoordinate[] = [
        [1.28, 103.85],
        [1.2823, 103.8581],
      ]

      const stations: Station[] = [
        mockStation(1.31, 103.85, 'far-1'),
        mockStation(1.32, 103.86, 'far-2'),
      ]

      const filtered = filterStationsByCorridor(stations, routeCoordinates)

      expect(filtered).toEqual([])
    })

    it('should return all stations if all are within corridor', () => {
      const routeCoordinates: RouteCoordinate[] = [
        [1.28, 103.85],
        [1.2823, 103.8581],
      ]

      const stations: Station[] = [
        mockStation(1.2812, 103.8541, 'station-1'),
        mockStation(1.2815, 103.8555, 'station-2'),
      ]

      const filtered = filterStationsByCorridor(stations, routeCoordinates)

      expect(filtered.length).toBe(2)
      expect(filtered.map((s) => s.id)).toEqual(['station-1', 'station-2'])
    })
  })
})
