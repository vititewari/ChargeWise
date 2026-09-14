export type ConnectorType = 'CCS2' | 'Type 2' | 'CHAdeMO'
export type ConnectorPreference = 'Any' | ConnectorType
export type AvailabilityStatus = 'available' | 'busy' | 'offline' | 'unknown'

export type ParkingProviderName = 'URA' | 'HDB'
export type ParkingMatchConfidence = 'high' | 'medium' | 'low'

export interface ParkingInfo {
  carParkId: string
  name: string
  provider: ParkingProviderName
  publishedRateText: string
  sourceName: string
  sourceUrl: string
  lastUpdated: string
  matchConfidence: ParkingMatchConfidence
  associationLabel: string
}

export interface Connector {
  type: ConnectorType
  powerKw: number
  total: number
  available: number | null
  status: AvailabilityStatus
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
  source: 'LTA DataMall'
  lastUpdated: string
}

export interface LocationInput {
  latitude: number
  longitude: number
  label?: string
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
  scoreComponents: {
    distance: number | null
    availability: number | null
    speed: number | null
    savings: number | null
  }
  weightedContributions: {
    distance: number
    availability: number
    speed: number
    savings: number
  }
  scoreExact: number
}
