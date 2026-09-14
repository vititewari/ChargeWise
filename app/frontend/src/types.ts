export type ConnectorType = 'CCS2' | 'Type 2' | 'CHAdeMO'
export type RankingPriority = 'Balanced' | 'Availability' | 'Speed' | 'Savings'
export type RankingFactor = 'distance' | 'availability' | 'speed' | 'savings'
export type RankingImportance = 0 | 1 | 2 | 4 | 8
export type RankingWeightSource = 'preset' | 'inferred preferences' | 'explicit percentages'

export interface RankingWeights {
  distance: number
  availability: number
  speed: number
  savings: number
}

export interface RankingPreferences {
  importance?: Partial<Record<RankingFactor, RankingImportance | null>>
  percentages?: Partial<Record<RankingFactor, number | null>>
  excluded?: RankingFactor[]
}

export interface RankingPolicy {
  weights: RankingWeights
  source: RankingWeightSource
}

export interface ParkingInfo {
  carParkId: string
  name: string
  provider: 'URA' | 'HDB'
  publishedRateText: string
  sourceName: string
  sourceUrl: string
  lastUpdated: string
  matchConfidence: 'high' | 'medium' | 'low'
  associationLabel: string
}

export interface Connector {
  type: ConnectorType
  powerKw: number
  total: number
  available: number | null
  status: 'available' | 'busy' | 'offline' | 'unknown'
}

export interface Station {
  id: string
  name: string
  address: string
  postalCode: string
  latitude: number
  longitude: number
  operator: string
  connectors: Connector[]
  pricePerKwh: number | null
  parking?: ParkingInfo | null
  source: string
  lastUpdated: string
  distanceKm?: number
  selectedConnector?: ConnectorType
}

export interface RankedStation extends Station {
  selectedConnector: ConnectorType
  score: number
  distanceKm: number
  travelMinutes: number | null
  travelSource: 'OneMap' | 'Straight-line estimate'
  estimatedHourlyCost: number | null
  hourlyCostIncludesParking: boolean
  estimatedChargingTimeMinutes: number | null
  chargingTimeIsApproximate: boolean
  reasons: string[]
  dataQualityNotices: string[]
  scoreComponents: Record<RankingFactor, number | null>
  weightedContributions: RankingWeights
  scoreExact: number
}

export interface SearchMetadata {
  totalMatches: number
  location: { latitude: number; longitude: number; label: string }
  dataStatus: {
    source: string
    isCached: boolean
    lastUpdated: string
    fallbackReason: string | null
    ltaDataMall: IntegrationProviderStatus
    oneMap: IntegrationProviderStatus
  }
}

export interface IntegrationProviderStatus {
  configured: boolean
  state: 'available' | 'error' | 'not_checked' | 'not_configured'
  lastError?: string | null
  lastSuccessfulFetch?: string | null
  lastSuccessfulRequest?: string | null
}

export interface RecommendationResponse {
  recommended: RankedStation | null
  ranked: RankedStation[]
  ranking: RankingPolicy
  search: SearchMetadata
}

export type ChatRole = 'user' | 'assistant'
export type AiChatIntent = 'search' | 'clarification' | 'explanation'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface AiRecommendationFilters {
  query?: string
  connector: 'Any' | ConnectorType
  rankingPriority: RankingPriority
  radiusKm: number
  energyKwh: number
  maxPrice?: number
  minPowerKw?: number
  availableOnly?: boolean
  operator?: string
  evaluationAt?: string
}

export type RecommendationRequest = AiRecommendationFilters & {
  latitude?: number
  longitude?: number
  routeFromCurrentLocation?: boolean
  routeOriginLatitude?: number
  routeOriginLongitude?: number
  rankingPreferences?: RankingPreferences
}

export interface AiChatResponse {
  reply: string
  intent: AiChatIntent
  recommendation: RecommendationResponse | null
  filters: AiRecommendationFilters
  rankingPreferences?: RankingPreferences
  needsClarification: boolean
  clarifyingQuestion?: string
}

export type RouteCoordinate = [latitude: number, longitude: number]

export interface DrivingRoute {
  distanceKm: number
  travelMinutes: number
  coordinates: RouteCoordinate[]
  source: 'OneMap'
}
