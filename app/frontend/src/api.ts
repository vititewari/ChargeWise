import type {
  AiChatResponse,
  AiRecommendationFilters,
  ChatMessage,
  DrivingRoute,
  IntegrationProviderStatus,
  RecommendationRequest,
  RecommendationResponse,
  RankingPreferences,
} from './types'

const API_URL = import.meta.env.VITE_API_URL ?? '/api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string | string[] } | null
    const message = Array.isArray(error?.message) ? error.message.join(', ') : error?.message
    throw new Error(message || `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export const api = {
  getIntegrationStatus() {
    return request<{
      ltaDataMall: IntegrationProviderStatus
      oneMap: IntegrationProviderStatus
      parking: { ura: IntegrationProviderStatus; hdb: IntegrationProviderStatus }
    }>('/integrations/status')
  },
  searchLocations(query: string) {
    const params = new URLSearchParams({ query })
    return request<{ latitude: number; longitude: number; label?: string }[]>(
      `/stations/search-locations?${params}`,
    )
  },
  resolveLocation(query?: string, latitude?: number, longitude?: number) {
    const params = new URLSearchParams()
    if (query) params.set('query', query)
    if (latitude !== undefined) params.set('latitude', String(latitude))
    if (longitude !== undefined) params.set('longitude', String(longitude))
    return request<{ latitude: number; longitude: number; label: string }>(
      `/stations/resolve-location?${params}`,
    )
  },
  getDrivingRoute(
    origin: Pick<StationLocation, 'latitude' | 'longitude'>,
    destination: Pick<StationLocation, 'latitude' | 'longitude'>,
  ) {
    const query = new URLSearchParams({
      startLat: String(origin.latitude),
      startLng: String(origin.longitude),
      endLat: String(destination.latitude),
      endLng: String(destination.longitude),
    })
    return request<DrivingRoute>(`/routes/driving?${query}`)
  },
  recommend(body: RecommendationRequest) {
    return request<RecommendationResponse>('/recommendations', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
  chat(body: {
    message: string
    conversation: ChatMessage[]
    context: {
      latitude?: number
      longitude?: number
      selectedStationIds: string[]
      previousFilters?: AiRecommendationFilters
      previousRankingPreferences?: RankingPreferences
    }
  }) {
    return request<AiChatResponse>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },
}
interface StationLocation {
  latitude: number
  longitude: number
}
