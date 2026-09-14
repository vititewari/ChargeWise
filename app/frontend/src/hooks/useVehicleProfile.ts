import { useState, useEffect } from 'react'
import type { ConnectorType } from '../types'

export interface VehicleProfile {
  connectorType?: ConnectorType
  batteryCapacityKwh?: number
}

const STORAGE_KEY = 'chargewise:vehicleProfile'

export function useVehicleProfile() {
  const [profile, setProfileState] = useState<VehicleProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as unknown
        if (isValidProfile(parsed)) {
          setProfileState(parsed)
        }
      }
    } catch {
      // Silently fail on corrupted data
    } finally {
      setIsLoading(false)
    }
  }, [])

  const saveProfile = (newProfile: VehicleProfile) => {
    const cleanProfile = {
      ...(newProfile.connectorType && { connectorType: newProfile.connectorType }),
      ...(newProfile.batteryCapacityKwh && newProfile.batteryCapacityKwh > 0 && { batteryCapacityKwh: newProfile.batteryCapacityKwh }),
    }

    if (Object.keys(cleanProfile).length === 0) {
      localStorage.removeItem(STORAGE_KEY)
      setProfileState(null)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanProfile))
      setProfileState(cleanProfile)
    }
  }

  const resetProfile = () => {
    localStorage.removeItem(STORAGE_KEY)
    setProfileState(null)
  }

  return { profile, saveProfile, resetProfile, isLoading }
}

function isValidProfile(data: unknown): data is VehicleProfile {
  if (typeof data !== 'object' || data === null) return false

  const obj = data as Record<string, unknown>

  if (obj.connectorType !== undefined) {
    if (!['CCS2', 'Type 2', 'CHAdeMO'].includes(String(obj.connectorType))) {
      return false
    }
  }

  if (obj.batteryCapacityKwh !== undefined) {
    const capacity = Number(obj.batteryCapacityKwh)
    if (!Number.isFinite(capacity) || capacity <= 0) return false
  }

  return true
}
