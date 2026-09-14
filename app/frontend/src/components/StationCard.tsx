import { memo } from 'react'
import { Badge, Button, Card } from '@mantine/core'
import {
  BatteryCharging,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Gauge,
  MapPin,
  Sparkles,
  Zap,
} from 'lucide-react'
import { timeAgo } from '../lib'
import type { RankedStation } from '../types'
import { useVehicleProfile } from '../hooks/useVehicleProfile'
import { estimateChargingTime, formatChargingTime } from '../utils/chargingTime'

interface Props {
  station: RankedStation
  rank: number
  best?: boolean
  onDetails: (station: RankedStation) => void
  onHover: (id: string) => void
  onCompareToggle?: (stationId: string, selected: boolean) => void
  isSelectedForComparison?: boolean
  canCompare?: boolean
}

export function getCardRoadTravel(
  station: Pick<RankedStation, 'distanceKm' | 'travelMinutes' | 'travelSource'>,
) {
  const hasOneMapRoute = station.travelSource === 'OneMap' && station.travelMinutes !== null
  return {
    distanceLabel: hasOneMapRoute ? `${station.distanceKm.toFixed(1)} km road` : '',
    minutesLabel: hasOneMapRoute ? `${station.travelMinutes} min` : '—',
    sourceLabel: hasOneMapRoute ? 'OneMap road route' : 'Road route unavailable',
  }
}

export const StationCard = memo(function StationCard({
  station,
  rank,
  best,
  onDetails,
  onHover,
  onCompareToggle,
  isSelectedForComparison,
  canCompare,
}: Props) {
  const { profile } = useVehicleProfile()
  const plug = station.connectors.find((item) => item.type === station.selectedConnector)
  if (!plug) return null
  const isAvailable = plug.status === 'available' && (plug.available ?? 0) > 0
  const roadTravel = getCardRoadTravel(station)
  const chargingTime = estimateChargingTime(plug.powerKw, profile?.batteryCapacityKwh)
  return (
    <Card
      component="article"
      className={`station-card ${best ? 'best-station' : ''}`}
      onMouseEnter={() => onHover(station.id)}
      padding={0}
    >
      {best && (
        <Badge className="best-ribbon" unstyled leftSection={<Sparkles size={14} />}>
          Best match
        </Badge>
      )}
      <div className="station-main-row">
        <Badge className="rank-badge" unstyled>
          {rank}
        </Badge>
        <div className="station-title">
          <h3>{station.name}</h3>
          <p>
            <MapPin size={14} /> {station.address}
            {roadTravel.distanceLabel ? ` · ${roadTravel.distanceLabel}` : ''}
          </p>
        </div>
        <div className="score-ring">
          <b>{station.score}</b>
          <span>score</span>
        </div>
      </div>
      <div className="station-metrics">
        <div>
          <Badge className={`availability-pill ${isAvailable ? '' : 'busy'}`} unstyled>
            <i /> {plug.available ?? 'Unknown'} available
          </Badge>
          <small>
            of {plug.total} · {timeAgo(station.lastUpdated)}
          </small>
        </div>
        <div>
          <Gauge size={17} />
          <b>{plug.powerKw > 0 ? `${plug.powerKw} kW` : 'Unknown'}</b>
          <small>Charging power</small>
        </div>
        <div>
          <Clock3 size={17} />
          <b>{roadTravel.minutesLabel}</b>
          <small>{roadTravel.sourceLabel}</small>
        </div>
        <div>
          <BatteryCharging size={17} />
          <b>
            {station.estimatedHourlyCost === null
              ? 'Unknown'
              : `$${station.estimatedHourlyCost.toFixed(2)}/hr`}
          </b>
          <small>
            {station.hourlyCostIncludesParking
              ? 'Charging + parking per hour'
              : station.parking
                ? 'Charging per hour · parking unknown'
                : 'Charging per hour'}
          </small>
        </div>
        <div>
          <Zap size={17} />
          <b>
            {chargingTime === null ? 'Unknown' : formatChargingTime(chargingTime)}
          </b>
          <small>
            {chargingTime === null
              ? 'Power unknown'
              : profile?.batteryCapacityKwh
                ? '20–80% (your battery)'
                : '20–80% (60 kWh est.)'}
          </small>
        </div>
      </div>
      <div className="reason-row">
        <div>
          {station.reasons.slice(0, 2).map((reason) => (
            <span key={reason}>
              <Check size={13} />
              {reason}
            </span>
          ))}
        </div>
        <Badge className="operator-tag" unstyled>
          {station.operator}
        </Badge>
      </div>
      {(station.dataQualityNotices ?? []).length > 0 && (
        <div className="data-quality-row">
          <CircleAlert size={13} />
          {(station.dataQualityNotices ?? [])[0]}
        </div>
      )}
      <div className="station-actions">
        {onCompareToggle && (
          <label className="compare-checkbox">
            <input
              type="checkbox"
              checked={isSelectedForComparison ?? false}
              onChange={(e) => onCompareToggle(station.id, e.currentTarget.checked)}
              disabled={!canCompare && !isSelectedForComparison}
              aria-label={`Compare ${station.name}`}
            />
            <span>Compare</span>
          </label>
        )}
        <Button
          variant="default"
          size="xs"
          rightSection={<ChevronRight size={15} />}
          onClick={() => onDetails(station)}
        >
          Details
        </Button>
      </div>
    </Card>
  )
})
