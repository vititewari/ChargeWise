import { Button, NumberInput } from '@mantine/core'
import { useState, useEffect } from 'react'
import type { ConnectorType } from '../types'
import type { VehicleProfile } from '../hooks/useVehicleProfile'
import { Modal } from './Modal'

export function VehicleProfileModal({
  onClose,
  profile,
  onSave,
}: {
  onClose: () => void
  profile: VehicleProfile | null
  onSave: (profile: VehicleProfile) => void
}) {
  const [connectorType, setConnectorType] = useState<string>(profile?.connectorType ?? '')
  const [batteryCapacity, setBatteryCapacity] = useState<number | undefined>(profile?.batteryCapacityKwh)

  useEffect(() => {
    setConnectorType(profile?.connectorType ?? '')
    setBatteryCapacity(profile?.batteryCapacityKwh)
  }, [profile])

  const handleSave = () => {
    const newProfile: VehicleProfile = {}
    if (connectorType && ['CCS2', 'Type 2', 'CHAdeMO'].includes(connectorType)) {
      newProfile.connectorType = connectorType as ConnectorType
    }
    if (batteryCapacity && batteryCapacity > 0) newProfile.batteryCapacityKwh = batteryCapacity

    onSave(newProfile)
    onClose()
  }

  const handleReset = () => {
    onSave({})
    onClose()
  }

  const hasChanges =
    connectorType !== (profile?.connectorType ?? '') || batteryCapacity !== profile?.batteryCapacityKwh

  return (
    <Modal title="My Vehicle" subtitle="Store your vehicle settings locally" onClose={onClose}>
      <div className="vehicle-profile-form">
        <div className="vehicle-form-field">
          <label htmlFor="connector-select">Connector type (optional)</label>
          <select
            id="connector-select"
            value={connectorType}
            onChange={(e) => setConnectorType(e.target.value)}
            className="vehicle-select"
          >
            <option value="">Select a connector type</option>
            <option value="CCS2">CCS2</option>
            <option value="Type 2">Type 2</option>
            <option value="CHAdeMO">CHAdeMO</option>
          </select>
        </div>

        <NumberInput
          label="Battery capacity (kWh)"
          placeholder="e.g., 60"
          description="Leave empty for 60 kWh default"
          value={batteryCapacity}
          onChange={(val) => setBatteryCapacity(typeof val === 'number' ? val : undefined)}
          min={1}
          step={1}
        />

        <div className="vehicle-profile-actions">
          <Button variant="default" onClick={handleReset} fullWidth>
            Clear Profile
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges} fullWidth>
            Save
          </Button>
          <Button variant="subtle" onClick={onClose} fullWidth>
            Cancel
          </Button>
        </div>

        <small className="vehicle-profile-note">
          Your vehicle settings are stored only in your browser and never sent to any server.
        </small>
      </div>
    </Modal>
  )
}
