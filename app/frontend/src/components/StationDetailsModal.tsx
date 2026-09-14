import { Badge, Button, Card, NumberInput } from '@mantine/core'
import { BatteryCharging, Database, MapPin, Navigation, PlugZap } from 'lucide-react'
import { useState, useEffect } from 'react'
import { timeAgo } from '../lib'
import type { RankedStation } from '../types'
import { useVehicleProfile } from '../hooks/useVehicleProfile'
import { Modal } from './Modal'

export function getRouteButtonLabel(routeVisible: boolean) {
  return routeVisible ? 'Change route' : 'Show route'
}

function formatChargingTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`
}

export function StationDetailsModal({
  station,
  onClose,
  onShowRoute,
  routeVisible = false,
  routeLoading = false,
  routeError = '',
}: {
  station: RankedStation
  onClose: () => void
  onShowRoute: () => void
  routeVisible?: boolean
  routeLoading?: boolean
  routeError?: string
}) {
  const { profile } = useVehicleProfile()
  const [currentBattery, setCurrentBattery] = useState<number | undefined>(20)
  const [targetBattery, setTargetBattery] = useState<number | undefined>(80)
  const [batteryCapacity, setBatteryCapacity] = useState<number | undefined>(undefined)

  useEffect(() => {
    if (profile?.batteryCapacityKwh) {
      setBatteryCapacity(profile.batteryCapacityKwh)
    }
  }, [profile?.batteryCapacityKwh])

  const estimateChargingTime = (): number | null => {
    if (
      currentBattery === undefined ||
      targetBattery === undefined ||
      currentBattery < 0 ||
      currentBattery > 100 ||
      targetBattery < 0 ||
      targetBattery > 100 ||
      targetBattery <= currentBattery
    ) {
      return null
    }

    const selectedConnector = station.connectors.find((c) => c.type === station.selectedConnector)
    if (!selectedConnector || selectedConnector.powerKw <= 0) return null

    const DEFAULT_CAPACITY = 60
    const capacity = batteryCapacity === undefined || batteryCapacity <= 0 ? DEFAULT_CAPACITY : batteryCapacity

    const energyNeededKwh = (capacity * (targetBattery - currentBattery)) / 100
    const estimatedMinutes = Math.round((energyNeededKwh / selectedConnector.powerKw) * 60)

    return estimatedMinutes
  }

  const chargingTimeEstimate = estimateChargingTime()
  const isApproximate =
    batteryCapacity === undefined || batteryCapacity <= 0

  return (
    <Modal
      title={station.name}
      subtitle={`${station.operator} · ${station.postalCode}`}
      onClose={onClose}
      mobileFullScreen
      bodyClassName="station-detail-modal-body"
    >
      <div className="station-detail-content">
        <div className="detail-hero">
          <span>
            <MapPin size={19} />
          </span>
          <div>
            <b>{station.address}</b>
            <small>Singapore {station.postalCode}</small>
          </div>
          <Button
            variant="light"
            size="xs"
            leftSection={<Navigation size={16} />}
            onClick={onShowRoute}
            loading={routeLoading}
            aria-label={`${getRouteButtonLabel(routeVisible)} for ${station.name}`}
          >
            {getRouteButtonLabel(routeVisible)}
          </Button>
        </div>
        <h3 className="section-mini-title">Charging connectors</h3>
        <div className="connector-list">
          {station.connectors.map((item) => (
            <Card
              className={`connector-item ${item.type === station.selectedConnector ? 'selected' : ''}`}
              key={item.type}
              padding={0}
            >
              <PlugZap size={20} />
              <div>
                <b>{item.type}</b>
                <small>{item.powerKw} kW</small>
              </div>
              <Badge className={`availability-pill ${item.status !== 'available' ? 'busy' : ''}`} unstyled>
                <i />
                {item.available === null ? 'Unknown' : `${item.available} of ${item.total} available`}
              </Badge>
            </Card>
          ))}
        </div>
        <div className="charging-time-inputs">
          <h3 className="section-mini-title">Estimate charging time</h3>
          <div className="input-row">
            <NumberInput
              label="Current battery %"
              value={currentBattery}
              onChange={(val) => setCurrentBattery(typeof val === 'number' ? val : undefined)}
              min={0}
              max={100}
              step={1}
              placeholder="0-100"
            />
            <NumberInput
              label="Target battery %"
              value={targetBattery}
              onChange={(val) => setTargetBattery(typeof val === 'number' ? val : undefined)}
              min={0}
              max={100}
              step={1}
              placeholder="0-100"
            />
            <NumberInput
              label="Battery capacity (kWh)"
              value={batteryCapacity}
              onChange={(val) => setBatteryCapacity(typeof val === 'number' ? val : undefined)}
              min={1}
              step={1}
              placeholder="Leave empty for 60 kWh default"
            />
          </div>
          {chargingTimeEstimate !== null && (
            <Card className="charging-time-result" padding={0}>
              <BatteryCharging />
              <div>
                <span>Estimated charging time</span>
                <b>{formatChargingTime(chargingTimeEstimate)}</b>
                {isApproximate && (
                  <small>Approximate (using 60 kWh default, edit in My Vehicle)</small>
                )}
                {!isApproximate && profile?.batteryCapacityKwh && (
                  <small>Using your vehicle profile ({profile.batteryCapacityKwh} kWh)</small>
                )}
              </div>
            </Card>
          )}
          <small className="charging-disclaimer">
            Estimate based on rated power. Real charging slows significantly above 80% battery.
          </small>
        </div>
        <div className="details-grid">
          <Card padding={0}>
            <BatteryCharging />
            <span>Charging price</span>
            <b>
              {station.estimatedHourlyCost === null
                ? 'Unknown'
                : `$${station.estimatedHourlyCost.toFixed(2)}/hour`}
            </b>
            <small>
              {station.hourlyCostIncludesParking ? 'Includes 1 hour of parking' : 'Parking not included'}
            </small>
          </Card>
          <Card padding={0}>
            <Database />
            <span>Data source</span>
            <b>{station.source}</b>
          </Card>
          <Card padding={0}>
            <Navigation />
            <span>Travel time</span>
            <b>
              {routeLoading
                ? 'Loading…'
                : station.travelMinutes === null
                  ? 'Unavailable'
                  : `${station.travelMinutes} min`}
            </b>
            <small className="travel-source-note">
              {station.travelSource === 'OneMap'
                ? 'OneMap road route'
                : 'Straight-line estimate — not road travel time'}
            </small>
          </Card>
        </div>
        {routeError && (
          <div className="data-note route-error-note" role="alert">
            <Navigation size={16} />
            <div>
              <b>Road route unavailable</b>
              <p>
                {routeError}{' '}
                {station.travelSource === 'OneMap'
                  ? 'The OneMap travel time remains available, but the road line could not be drawn.'
                  : 'The displayed fallback is clearly marked as a straight-line estimate.'}
              </p>
            </div>
          </div>
        )}
        <div className="parking-detail">
          <b>Parking</b>
          <p>
            {station.parking?.publishedRateText ?? 'Parking information is unavailable for this station.'}
          </p>
          {station.parking && (
            <small>
              {station.parking.sourceName} · Updated {timeAgo(station.parking.lastUpdated)} ·{' '}
              {station.parking.associationLabel}
            </small>
          )}
        </div>
        <div className="data-note">
          <Database size={16} />
          <div>
            <b>Updated {timeAgo(station.lastUpdated)}</b>
            <p>
              Hourly cost uses the published rate, connector power, and one hour of parking when an official
              tariff is available. Availability may change before you arrive.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  )
}
