import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common'
import { LocationInput, Station } from '../common/types'
import { SearchStationsDto } from './dto/search-stations.dto'
import { LtaDataMallService, OneMapService, ParkingService } from '../integrations'

export interface StationSearchResult {
  stations: Array<Station & { distanceKm: number }>
  totalMatches: number
  location: LocationInput
  dataStatus: {
    source: string
    isCached: boolean
    lastUpdated: string
    ltaDataMall: ReturnType<LtaDataMallService['status']>
    oneMap: ReturnType<OneMapService['status']>
    fallbackReason: string | null
  }
  operators: string[]
  suggestions: string[]
}

@Injectable()
export class StationsService {
  private stations: Station[] = []
  private fallbackReason: string | null = null

  constructor(
    private readonly lta: LtaDataMallService,
    private readonly oneMap: OneMapService,
    @Optional() private readonly parking?: ParkingService,
  ) {}

  findById(id: string): Station {
    const station = this.stations.find((item) => item.id === id)
    if (!station) throw new NotFoundException(`Station ${id} was not found`)
    return structuredClone(station)
  }

  async searchLocations(query?: string): Promise<LocationInput[]> {
    if (!query?.trim()) return []
    if (!this.oneMap.isConfigured()) return []
    try {
      return await this.oneMap.searchAddresses(query)
    } catch (error) {
      return []
    }
  }

  async resolveLocation(query?: string, latitude?: number, longitude?: number): Promise<LocationInput> {
    if (latitude !== undefined && longitude !== undefined) {
      return { latitude, longitude, label: query || 'Selected location' }
    }

    if (query?.trim()) {
      let providerError: unknown = null
      if (this.oneMap.isConfigured()) {
        try {
          const result = await this.oneMap.searchAddress(query)
          if (result) return result
        } catch (error) {
          providerError = error
        }
      }

      const liveMatch = this.resolveFromLiveStations(query)
      if (liveMatch) return liveMatch

      if (providerError) {
        throw new ServiceUnavailableException(
          providerError instanceof Error ? providerError.message : 'OneMap address search is unavailable.',
        )
      }
      if (!this.oneMap.isConfigured()) {
        throw new ServiceUnavailableException(
          'Address search is unavailable. Configure OneMap or use your current location.',
        )
      }
      throw new BadRequestException(`No Singapore location found for "${query.trim()}"`)
    }

    return { latitude: 1.2903, longitude: 103.8519, label: 'Singapore' }
  }

  async search(dto: SearchStationsDto): Promise<StationSearchResult> {
    await this.refreshFromProvider()
    if (!this.stations.length) {
      throw new ServiceUnavailableException(
        this.fallbackReason ?? 'Live charging-station data is currently unavailable.',
      )
    }
    const location = await this.resolveLocation(dto.query, dto.latitude, dto.longitude)
    const radius = dto.radiusKm ?? 8
    let stations = this.stations
      .map((station) => ({ ...structuredClone(station), distanceKm: this.distanceKm(location, station) }))
      .filter((station) => station.distanceKm <= radius)
    const connectorMatches = (connector: Station['connectors'][number]) =>
      (!dto.connector || dto.connector === 'Any' || connector.type === dto.connector) &&
      (dto.minPowerKw === undefined || connector.powerKw >= dto.minPowerKw) &&
      (!dto.availableOnly || ((connector.available ?? 0) > 0 && connector.status === 'available')) &&
      (dto.includeUnknown || connector.status !== 'unknown')
    // All connector-specific mandatory requirements must hold on the same
    // connector. This prevents one connector from satisfying the type filter
    // while another satisfies power or availability.
    if (
      (dto.connector && dto.connector !== 'Any') ||
      dto.minPowerKw !== undefined ||
      dto.availableOnly ||
      !dto.includeUnknown
    ) {
      stations = stations.filter((station) => station.connectors.some(connectorMatches))
    }
    if (dto.maxPrice !== undefined) {
      stations = stations.filter(
        (station) =>
          station.pricePerKwh !== null && station.pricePerKwh > 0 && station.pricePerKwh <= dto.maxPrice!,
      )
    }
    const operators = [...new Set(stations.map((station) => station.operator).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    )
    if (dto.operator) {
      const requestedOperator = this.operatorKey(dto.operator)
      stations = stations.filter((station) => this.operatorKey(station.operator) === requestedOperator)
    }

    stations = [...new Map(stations.map((station) => [station.id, station])).values()]
    stations.sort((a, b) => a.distanceKm - b.distanceKm)
    const totalMatches = stations.length
    stations = stations.slice(0, dto.limit ?? 50)
    const lastUpdated = (stations.length ? stations : this.stations).reduce(
      (latest, station) => (station.lastUpdated > latest ? station.lastUpdated : latest),
      new Date(0).toISOString(),
    )
    return {
      stations,
      totalMatches,
      location,
      dataStatus: {
        source: this.stations[0].source,
        isCached: this.lta.status().state === 'error' || Boolean(this.fallbackReason),
        lastUpdated,
        ltaDataMall: this.lta.status(),
        oneMap: this.oneMap.status(),
        fallbackReason: this.fallbackReason,
      },
      operators,
      suggestions: stations.length
        ? []
        : ['Increase the search radius', 'Try another connector', 'Allow stations with unknown status'],
    }
  }

  async refreshFromProvider(force = false) {
    if (!this.lta.isConfigured()) {
      this.fallbackReason = 'Live charging data is not configured.'
      return false
    }
    try {
      const live = await this.lta.getAllStations(force)
      if (live.length) {
        this.stations = this.parking ? await this.parking.enrichStations(live) : live
      }
      this.fallbackReason =
        this.lta.status().state === 'error'
          ? `${this.lta.status().lastError ?? 'LTA DataMall is unavailable'}; showing the most recent live snapshot.`
          : null
      return this.lta.status().state !== 'error'
    } catch (error) {
      this.fallbackReason = error instanceof Error ? error.message : 'LTA DataMall is unavailable.'
      return false
    }
  }

  distanceKm(a: Pick<LocationInput, 'latitude' | 'longitude'>, b: Pick<Station, 'latitude' | 'longitude'>) {
    const earthRadiusKm = 6371
    const toRad = (degrees: number) => (degrees * Math.PI) / 180
    const dLat = toRad(b.latitude - a.latitude)
    const dLon = toRad(b.longitude - a.longitude)
    const lat1 = toRad(a.latitude)
    const lat2 = toRad(b.latitude)
    const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
    return Number((earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))).toFixed(2))
  }

  private operatorKey(value: string) {
    return value
      .toLowerCase()
      .replace(/\b(private|pte|limited|ltd)\b\.?/g, '')
      .replace(/[^a-z0-9+]/g, '')
  }

  private resolveFromLiveStations(query: string): LocationInput | null {
    const normalized = query.trim().toLowerCase()
    if (normalized === 'singapore') {
      return { latitude: 1.2903, longitude: 103.8519, label: 'Singapore' }
    }
    const tokens = normalized.split(/\s+/).filter(Boolean)
    const matches = this.stations.filter((station) => {
      const searchable = `${station.name} ${station.address} ${station.postalCode}`.toLowerCase()
      return tokens.every((token) => searchable.includes(token))
    })
    if (!matches.length) return null
    return {
      latitude: matches.reduce((sum, station) => sum + station.latitude, 0) / matches.length,
      longitude: matches.reduce((sum, station) => sum + station.longitude, 0) / matches.length,
      label: query.trim(),
    }
  }
}
