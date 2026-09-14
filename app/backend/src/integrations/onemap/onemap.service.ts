import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LocationInput } from '../../common/types'

interface OneMapSearchResponse {
  found?: number
  error?: string
  results?: Array<Record<string, string>>
}
interface OneMapRouteResponse {
  status?: number
  status_message?: string
  route_geometry?: string
  route_summary?: { total_time?: number; total_distance?: number }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 20_000
const ADDRESS_SEARCH_TIMEOUT_MS = 60_000

@Injectable()
export class OneMapService {
  private readonly baseUrl: string
  private generatedToken: { value: string; expiresAt: number } | null = null
  private readonly geocodeCache = new Map<string, { value: LocationInput; expiresAt: number }>()
  private readonly routeCache = new Map<string, { value: RouteResult; expiresAt: number }>()
  private lastSuccessfulRequest: string | null = null
  private lastError: string | null = null

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get('ONEMAP_BASE_URL') ?? 'https://www.onemap.gov.sg'
  }

  isConfigured() {
    return Boolean(
      this.config.get('ONEMAP_TOKEN') ||
      (this.config.get('ONEMAP_EMAIL') && this.config.get('ONEMAP_PASSWORD')),
    )
  }

  status() {
    return {
      configured: this.isConfigured(),
      state: this.lastError
        ? 'error'
        : this.lastSuccessfulRequest
          ? 'available'
          : this.isConfigured()
            ? 'not_checked'
            : 'not_configured',
      lastSuccessfulRequest: this.lastSuccessfulRequest,
      lastError: this.lastError,
      tokenMode: this.config.get('ONEMAP_TOKEN')
        ? 'provided_token'
        : this.config.get('ONEMAP_EMAIL')
          ? 'managed_token'
          : 'none',
    }
  }

  async searchAddresses(query: string): Promise<LocationInput[]> {
    if (!this.isConfigured() || !query.trim()) return []
    const cacheKey = `search:${query.trim().toLowerCase()}`
    const cached = this.geocodeCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      // Return array from cached single location
      return cached.value ? [structuredClone(cached.value)] : []
    }
    const url = new URL(`${this.baseUrl}/api/common/elastic/search`)
    url.searchParams.set('searchVal', query)
    url.searchParams.set('returnGeom', 'Y')
    url.searchParams.set('getAddrDetails', 'Y')
    url.searchParams.set('pageNum', '1')
    try {
      const payload = await this.authorizedJson<OneMapSearchResponse>(
        url.toString(),
        ADDRESS_SEARCH_TIMEOUT_MS,
      )
      if (payload.error) throw new Error(`OneMap search error: ${payload.error}`)
      const results = payload.results ?? []
      const locations: LocationInput[] = []
      for (const result of results) {
        const latitude = Number(result.LATITUDE)
        const longitude = Number(result.LONGITUDE ?? result.LONGTITUDE)
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          locations.push({
            latitude,
            longitude,
            label: result.SEARCHVAL || result.ADDRESS || query,
          })
        }
      }
      this.lastSuccessfulRequest = new Date().toISOString()
      this.lastError = null
      return locations
    } catch (error) {
      this.lastError = this.safeError(error)
      throw error
    }
  }

  async searchAddress(query: string): Promise<LocationInput | null> {
    if (!this.isConfigured() || !query.trim()) return null
    const cacheKey = query.trim().toLowerCase()
    const cached = this.geocodeCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.value)
    const url = new URL(`${this.baseUrl}/api/common/elastic/search`)
    url.searchParams.set('searchVal', query)
    url.searchParams.set('returnGeom', 'Y')
    url.searchParams.set('getAddrDetails', 'Y')
    url.searchParams.set('pageNum', '1')
    try {
      const payload = await this.authorizedJson<OneMapSearchResponse>(
        url.toString(),
        ADDRESS_SEARCH_TIMEOUT_MS,
      )
      if (payload.error) throw new Error(`OneMap search error: ${payload.error}`)
      const first = payload.results?.[0]
      if (!first) return null
      const latitude = Number(first.LATITUDE)
      const longitude = Number(first.LONGITUDE ?? first.LONGTITUDE)
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null
      const value = { latitude, longitude, label: first.SEARCHVAL || first.ADDRESS || query }
      this.geocodeCache.set(cacheKey, { value, expiresAt: Date.now() + 24 * 60 * 60_000 })
      return structuredClone(value)
    } catch (error) {
      this.lastError = this.safeError(error)
      throw error
    }
  }

  async drivingRoute(
    start: Pick<LocationInput, 'latitude' | 'longitude'>,
    end: Pick<LocationInput, 'latitude' | 'longitude'>,
  ): Promise<RouteResult | null> {
    if (!this.isConfigured()) return null
    const cacheKey = `${start.latitude.toFixed(4)},${start.longitude.toFixed(4)}:${end.latitude.toFixed(4)},${end.longitude.toFixed(4)}`
    const cached = this.routeCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) return structuredClone(cached.value)
    const url = new URL(`${this.baseUrl}/api/public/routingsvc/route`)
    url.searchParams.set('start', `${start.latitude},${start.longitude}`)
    url.searchParams.set('end', `${end.latitude},${end.longitude}`)
    url.searchParams.set('routeType', 'drive')
    try {
      const payload = await this.authorizedJson<OneMapRouteResponse>(url.toString())
      const seconds = Number(payload.route_summary?.total_time)
      const metres = Number(payload.route_summary?.total_distance)
      if (!Number.isFinite(seconds) || !Number.isFinite(metres)) return null
      const coordinates = payload.route_geometry ? decodeRouteGeometry(payload.route_geometry) : []
      const value = {
        travelMinutes: Math.max(1, Math.round(seconds / 60)),
        distanceKm: Number((metres / 1000).toFixed(2)),
        coordinates,
        source: 'OneMap' as const,
      }
      this.routeCache.set(cacheKey, { value, expiresAt: Date.now() + 2 * 60_000 })
      return structuredClone(value)
    } catch (error) {
      this.lastError = this.safeError(error)
      throw error
    }
  }

  private async authorizedJson<T>(url: string, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<T> {
    let token = await this.token(false, timeoutMs)
    let response = await fetch(url, {
      headers: { Authorization: token, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status === 401 && this.hasCredentials()) {
      this.generatedToken = null
      token = await this.token(true, timeoutMs)
      response = await fetch(url, {
        headers: { Authorization: token, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      })
    }
    if (!response.ok) throw new Error(`OneMap request failed with HTTP ${response.status}`)
    let payload = (await response.json()) as T
    if (this.isUnauthorizedPayload(payload) && this.hasCredentials()) {
      this.generatedToken = null
      token = await this.token(true, timeoutMs)
      response = await fetch(url, {
        headers: { Authorization: token, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) throw new Error(`OneMap request failed with HTTP ${response.status}`)
      payload = (await response.json()) as T
    }
    this.lastSuccessfulRequest = new Date().toISOString()
    this.lastError = null
    return payload
  }

  private isUnauthorizedPayload(payload: unknown) {
    if (!payload || typeof payload !== 'object') return false
    const value = payload as { error?: unknown; status?: unknown }
    if (value.status === 401) return true
    return (
      typeof value.error === 'string' &&
      /401|unauthori[sz]ed|invalid token|token has expired/i.test(value.error)
    )
  }

  private hasCredentials() {
    return Boolean(this.config.get<string>('ONEMAP_EMAIL') && this.config.get<string>('ONEMAP_PASSWORD'))
  }

  private async token(forceManaged = false, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<string> {
    const provided = this.config.get<string>('ONEMAP_TOKEN')
    if (!forceManaged && provided) return provided
    if (this.generatedToken && this.generatedToken.expiresAt > Date.now() + 60_000)
      return this.generatedToken.value
    const email = this.config.get<string>('ONEMAP_EMAIL')
    const password = this.config.get<string>('ONEMAP_PASSWORD')
    if (!email || !password) throw new Error('OneMap credentials are not configured')
    const response = await fetch(`${this.baseUrl}/api/auth/post/getToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) throw new Error(`OneMap authentication failed with HTTP ${response.status}`)
    const payload = (await response.json()) as { access_token?: string; expiry_timestamp?: string }
    if (!payload.access_token) throw new Error('OneMap authentication returned no access token')
    this.generatedToken = {
      value: payload.access_token,
      expiresAt: Number(payload.expiry_timestamp ?? 0) * 1000 || Date.now() + 70 * 60 * 60_000,
    }
    return this.generatedToken.value
  }

  private safeError(error: unknown) {
    return error instanceof Error
      ? error.message.replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]')
      : 'Unknown OneMap error'
  }
}

export interface RouteResult {
  travelMinutes: number
  distanceKm: number
  coordinates: RouteCoordinate[]
  source: 'OneMap'
}

export type RouteCoordinate = [latitude: number, longitude: number]

export function decodeRouteGeometry(encoded: string): RouteCoordinate[] {
  const coordinates: RouteCoordinate[] = []
  let index = 0
  let latitude = 0
  let longitude = 0

  while (index < encoded.length) {
    const latitudeDelta = decodePolylineValue(encoded, () => index++)
    latitude += latitudeDelta
    const longitudeDelta = decodePolylineValue(encoded, () => index++)
    longitude += longitudeDelta
    coordinates.push([latitude / 100_000, longitude / 100_000])
  }

  return coordinates
}

function decodePolylineValue(encoded: string, nextIndex: () => number) {
  let result = 0
  let shift = 0
  let byte: number

  do {
    const index = nextIndex()
    if (index >= encoded.length) throw new Error('Invalid OneMap route geometry')
    byte = encoded.charCodeAt(index) - 63
    if (byte < 0 || byte > 63 || shift > 30) throw new Error('Invalid OneMap route geometry')
    result |= (byte & 0x1f) << shift
    shift += 5
  } while (byte >= 0x20)

  return (result & 1) === 1 ? ~(result >> 1) : result >> 1
}
