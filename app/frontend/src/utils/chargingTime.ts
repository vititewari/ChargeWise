export function estimateChargingTime(
  connectorPowerKw: number | null | undefined,
  batteryCapacityKwh: number = 60,
  startPercent: number = 20,
  endPercent: number = 80
): number | null {
  if (!connectorPowerKw || connectorPowerKw <= 0) return null
  if (endPercent <= startPercent) return null

  const energyNeededKwh = (batteryCapacityKwh * (endPercent - startPercent)) / 100
  const estimatedMinutes = Math.round((energyNeededKwh / connectorPowerKw) * 60)

  return estimatedMinutes
}

export function formatChargingTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`
}
