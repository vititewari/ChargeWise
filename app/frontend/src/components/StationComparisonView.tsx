import { Button } from '@mantine/core'
import { ChevronLeft } from 'lucide-react'
import type { RankedStation } from '../types'
import { estimateChargingTime, formatChargingTime } from '../utils/chargingTime'
import { useVehicleProfile } from '../hooks/useVehicleProfile'

export function StationComparisonView({
  stations,
  onBack,
}: {
  stations: RankedStation[]
  onBack: () => void
}) {
  const { profile } = useVehicleProfile()

  return (
    <div className="station-comparison-view">
      <div className="comparison-header">
        <Button
          variant="subtle"
          leftSection={<ChevronLeft size={18} />}
          onClick={onBack}
          aria-label="Back to results"
        >
          Back to results
        </Button>
        <h2>Comparing {stations.length} stations</h2>
      </div>

      <div className="comparison-table">
        <div className="comparison-columns">
          {stations.map((station) => (
            <div key={station.id} className="comparison-column">
              <div className="station-header">
                <div className="station-info">
                  <h3>{station.name}</h3>
                  <p className="station-address">{station.address}</p>
                  <small className="station-postal">Singapore {station.postalCode}</small>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="comparison-rows">
          {/* Distance */}
          <div className="comparison-row">
            <div className="row-label">Distance</div>
            {stations.map((station) => (
              <div key={station.id} className="row-value">
                <b>{station.distanceKm.toFixed(1)} km</b>
              </div>
            ))}
          </div>

          {/* Travel Time */}
          <div className="comparison-row">
            <div className="row-label">Travel time</div>
            {stations.map((station) => (
              <div key={station.id} className="row-value">
                {station.travelMinutes === null ? (
                  <span className="unavailable">—</span>
                ) : (
                  <>
                    <b>{station.travelMinutes} min</b>
                    <small>{station.travelSource}</small>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Connector Type & Availability */}
          <div className="comparison-row">
            <div className="row-label">Selected connector</div>
            {stations.map((station) => {
              const connector = station.connectors.find((c) => c.type === station.selectedConnector)
              const isAvailable = connector?.status === 'available' && (connector?.available ?? 0) > 0
              return (
                <div key={station.id} className="row-value">
                  <b>{station.selectedConnector}</b>
                  <small className={isAvailable ? 'available' : 'unavailable'}>
                    {connector?.available === null
                      ? 'Unknown availability'
                      : `${connector?.available ?? 0} of ${connector?.total ?? 0} available`}
                  </small>
                </div>
              )
            })}
          </div>

          {/* Power */}
          <div className="comparison-row">
            <div className="row-label">Charging power</div>
            {stations.map((station) => {
              const connector = station.connectors.find((c) => c.type === station.selectedConnector)
              return (
                <div key={station.id} className="row-value">
                  {connector?.powerKw && connector.powerKw > 0 ? (
                    <b>{connector.powerKw} kW</b>
                  ) : (
                    <span className="unavailable">Unknown</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Price per kWh */}
          <div className="comparison-row">
            <div className="row-label">Price per kWh</div>
            {stations.map((station) => (
              <div key={station.id} className="row-value">
                {station.pricePerKwh === null ? (
                  <span className="unavailable">Unknown</span>
                ) : (
                  <b>${station.pricePerKwh.toFixed(2)}/kWh</b>
                )}
              </div>
            ))}
          </div>

          {/* Hourly Cost */}
          <div className="comparison-row">
            <div className="row-label">Estimated hourly cost</div>
            {stations.map((station) => (
              <div key={station.id} className="row-value">
                {station.estimatedHourlyCost === null ? (
                  <span className="unavailable">Unknown</span>
                ) : (
                  <>
                    <b>${station.estimatedHourlyCost.toFixed(2)}/hr</b>
                    <small>
                      {station.hourlyCostIncludesParking ? 'Incl. 1h parking' : 'Charging only'}
                    </small>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Charging Time 20-80% */}
          <div className="comparison-row">
            <div className="row-label">Charging time (20–80%)</div>
            {stations.map((station) => {
              const connector = station.connectors.find((c) => c.type === station.selectedConnector)
              const chargingTime = estimateChargingTime(connector?.powerKw, profile?.batteryCapacityKwh)
              return (
                <div key={station.id} className="row-value">
                  {chargingTime === null ? (
                    <span className="unavailable">Unknown</span>
                  ) : (
                    <>
                      <b>{formatChargingTime(chargingTime)}</b>
                      <small>
                        {profile?.batteryCapacityKwh
                          ? `${profile.batteryCapacityKwh} kWh`
                          : '60 kWh est.'}
                      </small>
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {/* Operator */}
          <div className="comparison-row">
            <div className="row-label">Operator</div>
            {stations.map((station) => (
              <div key={station.id} className="row-value">
                <b>{station.operator}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
