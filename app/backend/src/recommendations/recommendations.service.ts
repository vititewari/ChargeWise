import { BadRequestException, Injectable, Optional } from '@nestjs/common'
import { ConnectorPreference, RankedStation, Station } from '../common/types'
import { OneMapService, ParkingService, RouteResult } from '../integrations'
import { StationsService } from '../stations/stations.service'
import { RecommendationDto } from './dto/recommendation.dto'
import { DISTANCE_SCALE_KM, resolveRankingWeights } from './ranking-weights'
import type { RankingFactor, RankingWeightResolution, RankingWeights } from './ranking-weights'

const ROUTE_CONCURRENCY = 4

interface ComponentScores {
  distance: number | null
  availability: number | null
  speed: number | null
  savings: number | null
}

interface ConnectorMetrics {
  pricePerKwh: number | null
  powerKw: number | null
  estimatedHourlyCost: number | null
  hourlyCostIncludesParking: boolean
  components: ComponentScores
}

interface ChargingTimeEstimate {
  estimatedMinutes: number | null
  isApproximate: boolean
}

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly stationsService: StationsService,
    private readonly oneMap: OneMapService,
    @Optional() private readonly parking?: ParkingService,
  ) {}

  async recommend(dto: RecommendationDto) {
    const rankingResolution = resolveRankingWeights(dto.rankingPreferences, dto.rankingPriority)
    if (rankingResolution.requiresClarification) {
      throw new BadRequestException(rankingResolution.clarificationQuestion)
    }

    const connectorPreference = isConnectorPreference(dto.connector) ? dto.connector : 'Any'
    const search = await this.stationsService.search({
      query: dto.query,
      latitude: dto.latitude,
      longitude: dto.longitude,
      radiusKm: dto.radiusKm ?? 8,
      connector: connectorPreference === 'Any' ? undefined : connectorPreference,
      minPowerKw: dto.minPowerKw,
      maxPrice: dto.maxPrice,
      availableOnly: dto.availableOnly,
      operator: dto.operator,
      includeUnknown: true,
    })
    const routeOrigin =
      dto.routeOriginLatitude !== undefined && dto.routeOriginLongitude !== undefined
        ? { latitude: dto.routeOriginLatitude, longitude: dto.routeOriginLongitude }
        : dto.routeFromCurrentLocation
          ? null
          : dto.latitude !== undefined && dto.longitude !== undefined
            ? { latitude: dto.latitude, longitude: dto.longitude }
            : { latitude: search.location.latitude, longitude: search.location.longitude }
    const routes = new Map<string, RouteResult | null>()
    if (!routeOrigin) {
      search.stations.forEach((station) => routes.set(station.id, null))
    } else {
      const workerCount = Math.min(ROUTE_CONCURRENCY, search.stations.length)
      await Promise.all(
        Array.from({ length: workerCount }, async (_, workerIndex) => {
          for (let index = workerIndex; index < search.stations.length; index += workerCount) {
            const station = search.stations[index]
            try {
              routes.set(station.id, await this.oneMap.drivingRoute(routeOrigin, station))
            } catch {
              routes.set(station.id, null)
            }
          }
        }),
      )
    }

    const ranked = search.stations
      .map((station) =>
        this.rankStation(
          station,
          { ...dto, connector: connectorPreference },
          routes.get(station.id) ?? null,
          rankingResolution,
        ),
      )
      .sort((a, b) => {
        // Preset ordering continues to use the legacy displayed score. Custom
        // ranking uses the unrounded score so close candidates are not tied by
        // presentation rounding.
        const scoreDifference =
          rankingResolution.source === 'preset' ? b.score - a.score : b.scoreExact - a.scoreExact
        return scoreDifference || a.distanceKm - b.distanceKm || a.id.localeCompare(b.id)
      })

    return {
      recommended: ranked[0] ?? null,
      ranked,
      ranking: {
        weights: rankingResolution.weights,
        source: rankingResolution.source,
      },
      search: {
        totalMatches: search.totalMatches,
        location: search.location,
        dataStatus: search.dataStatus,
      },
    }
  }

  rankStation(
    station: Station & { distanceKm?: number },
    dto: RecommendationDto,
    route: RouteResult | null = null,
    resolvedRanking?: RankingWeightResolution,
  ): RankedStation {
    const ranking = resolvedRanking ?? resolveRankingWeights(dto.rankingPreferences, dto.rankingPriority)
    if (ranking.requiresClarification) {
      throw new BadRequestException(ranking.clarificationQuestion)
    }

    const connectorPreference = isConnectorPreference(dto.connector) ? dto.connector : 'Any'
    const distanceKm =
      route?.distanceKm ??
      station.distanceKm ??
      this.stationsService.distanceKm(
        { latitude: dto.latitude ?? 1.2903, longitude: dto.longitude ?? 103.8519 },
        station,
      )
    const safeDistanceKm = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0
    const distanceScore = distanceComponent(safeDistanceKm)
    const travelMinutes = route?.travelMinutes ?? Math.max(2, Math.round((safeDistanceKm / 25) * 60))
    const arrivalTime = addMinutes(dto.evaluationAt ?? new Date().toISOString(), travelMinutes)
    const parkingEstimate = this.parking?.estimate(station, arrivalTime, 60)
    const parkingHourlyCost = parkingEstimate?.estimatedParkingCost ?? null
    const connector = this.selectConnector(
      station,
      connectorPreference,
      dto,
      ranking.weights,
      distanceScore,
      parkingHourlyCost,
    )
    if (!connector) throw new BadRequestException('Incompatible station was sent for ranking')

    const metrics = this.connectorMetrics(connector, station, distanceScore, parkingHourlyCost)
    const weightedContributions = weightedContributionsFor(metrics.components, ranking.weights)
    const scoreExact = sumWeightedContributions(weightedContributions)

    const dataQualityNotices: string[] = []
    if (metrics.estimatedHourlyCost === null)
      dataQualityNotices.push('Estimated charging cost per hour is unknown')
    if (metrics.components.availability === null) dataQualityNotices.push('Availability is unknown')
    if (metrics.components.speed === null) dataQualityNotices.push('Charging speed is unknown')

    const reasons = rankingReasons(metrics.components, ranking.weights)
    if (connectorPreference === 'Any')
      reasons.unshift(`${connector.type} selected as the best eligible connector`)

    const chargingTime = this.estimateChargingTime(connector)

    return {
      ...structuredClone(station),
      selectedConnector: connector.type,
      pricePerKwh: metrics.pricePerKwh,
      score: Math.round(scoreExact),
      scoreExact,
      distanceKm: safeDistanceKm,
      travelMinutes,
      travelSource: route ? 'OneMap' : 'Straight-line estimate',
      estimatedHourlyCost: metrics.estimatedHourlyCost,
      hourlyCostIncludesParking: metrics.hourlyCostIncludesParking,
      estimatedChargingTimeMinutes: chargingTime.estimatedMinutes,
      chargingTimeIsApproximate: chargingTime.isApproximate,
      scoreComponents: metrics.components,
      weightedContributions,
      reasons: reasons.slice(0, 3),
      dataQualityNotices,
    }
  }

  private selectConnector(
    station: Station,
    preference: ConnectorPreference,
    dto: RecommendationDto,
    weights: RankingWeights,
    distanceScore: number,
    parkingHourlyCost: number | null,
  ) {
    const candidates = station.connectors.filter(
      (connector) =>
        (preference === 'Any' || connector.type === preference) &&
        this.connectorSatisfiesMandatoryFilters(connector, dto),
    )
    if (!candidates.length) return undefined

    return [...candidates].sort((a, b) => {
      const scoreA = sumWeightedContributions(
        weightedContributionsFor(
          this.connectorMetrics(a, station, distanceScore, parkingHourlyCost).components,
          weights,
        ),
      )
      const scoreB = sumWeightedContributions(
        weightedContributionsFor(
          this.connectorMetrics(b, station, distanceScore, parkingHourlyCost).components,
          weights,
        ),
      )
      return scoreB - scoreA || a.type.localeCompare(b.type)
    })[0]
  }

  private connectorSatisfiesMandatoryFilters(
    connector: Station['connectors'][number],
    dto: RecommendationDto,
  ) {
    return (
      (dto.minPowerKw === undefined ||
        (Number.isFinite(dto.minPowerKw) && connector.powerKw >= dto.minPowerKw)) &&
      (!dto.availableOnly || (connector.status === 'available' && (connector.available ?? 0) > 0))
    )
  }

  private connectorMetrics(
    connector: Station['connectors'][number],
    station: Station,
    distanceScore: number,
    parkingHourlyCost: number | null,
  ): ConnectorMetrics {
    const availability =
      connector.status === 'unknown' || connector.available === null
        ? null
        : clampScore((connector.available / Math.max(connector.total, 1)) * 100)
    const powerKw = connector.powerKw > 0 ? connector.powerKw : null
    const pricePerKwh = station.pricePerKwh !== null && station.pricePerKwh > 0 ? station.pricePerKwh : null
    const chargingHourlyCost =
      pricePerKwh === null || powerKw === null ? null : Number((pricePerKwh * powerKw).toFixed(2))
    const hourlyCostIncludesParking = chargingHourlyCost !== null && parkingHourlyCost !== null
    const estimatedHourlyCost =
      chargingHourlyCost === null
        ? null
        : hourlyCostIncludesParking
          ? Number((chargingHourlyCost + parkingHourlyCost).toFixed(2))
          : chargingHourlyCost
    // Savings remains the existing estimated hourly-cost-based component. It
    // is not a total charging-session cost.
    const savings = estimatedHourlyCost === null ? null : clampScore(100 - estimatedHourlyCost)
    const speed = powerKw === null ? null : clampScore((powerKw / 200) * 100)

    return {
      pricePerKwh,
      powerKw,
      estimatedHourlyCost,
      hourlyCostIncludesParking,
      components: { distance: distanceScore, availability, speed, savings },
    }
  }

  private estimateChargingTime(
    connector: Station['connectors'][number],
    currentBatteryPercent?: number,
    targetBatteryPercent?: number,
    batteryCapacityKwh?: number,
  ): ChargingTimeEstimate {
    if (
      currentBatteryPercent === undefined ||
      targetBatteryPercent === undefined ||
      currentBatteryPercent < 0 ||
      currentBatteryPercent > 100 ||
      targetBatteryPercent < 0 ||
      targetBatteryPercent > 100
    ) {
      return { estimatedMinutes: null, isApproximate: false }
    }

    if (targetBatteryPercent <= currentBatteryPercent) {
      return { estimatedMinutes: null, isApproximate: false }
    }

    const powerKw = connector.powerKw > 0 ? connector.powerKw : null
    if (powerKw === null) {
      return { estimatedMinutes: null, isApproximate: false }
    }

    const DEFAULT_BATTERY_KWH = 60
    const capacity = batteryCapacityKwh && batteryCapacityKwh > 0 ? batteryCapacityKwh : DEFAULT_BATTERY_KWH
    const isApproximate = !batteryCapacityKwh || batteryCapacityKwh <= 0

    const energyNeededKwh = (capacity * (targetBatteryPercent - currentBatteryPercent)) / 100
    const estimatedMinutes = Math.round((energyNeededKwh / powerKw) * 60)

    return { estimatedMinutes, isApproximate }
  }
}

function rankingReasons(components: ComponentScores, weights: RankingWeights) {
  const reasons: string[] = []
  const unknownReasons: Record<RankingFactor, string> = {
    distance: 'Distance is unknown and ranked lower',
    availability: 'Availability is unknown and ranked lower',
    speed: 'Charging speed is unknown and ranked lower',
    savings: 'Charging cost per hour is unknown and ranked lower',
  }
  for (const factor of ['distance', 'availability', 'speed', 'savings'] as const) {
    if (weights[factor] <= 0) continue
    const component = components[factor]
    if (component === null) {
      reasons.push(unknownReasons[factor])
    }
  }
  return reasons
}

function weightedContributionsFor(components: ComponentScores, weights: RankingWeights) {
  return Object.fromEntries(
    (['distance', 'availability', 'speed', 'savings'] as const).map((factor) => [
      factor,
      components[factor] === null ? 0 : (components[factor] * weights[factor]) / 100,
    ]),
  ) as Record<RankingFactor, number>
}

function sumWeightedContributions(contributions: Record<RankingFactor, number>) {
  return (['distance', 'availability', 'speed', 'savings'] as const).reduce(
    (sum, factor) => sum + contributions[factor],
    0,
  )
}

function distanceComponent(distanceKm: number) {
  return clampScore(100 / (1 + distanceKm / DISTANCE_SCALE_KM))
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
}

function isConnectorPreference(value: unknown): value is ConnectorPreference {
  return value === 'Any' || value === 'CCS2' || value === 'Type 2' || value === 'CHAdeMO'
}

function addMinutes(value: Date | string, minutes: number) {
  const date = value instanceof Date ? new Date(value) : new Date(value)
  if (Number.isNaN(date.getTime())) return new Date()
  return new Date(date.getTime() + minutes * 60_000)
}
