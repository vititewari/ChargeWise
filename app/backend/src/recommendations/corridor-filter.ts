import { pointToLineDistance } from '@turf/point-to-line-distance'
import { point, lineString } from '@turf/helpers'
import type { Station } from '../common/types'
import type { RouteCoordinate } from '../integrations/onemap/onemap.service'

const CORRIDOR_WIDTH_KM = 2

export function isStationWithinCorridor(station: Station, routeCoordinates: RouteCoordinate[]): boolean {
  if (routeCoordinates.length < 2) return false

  const stationPoint = point([station.longitude, station.latitude])
  const routeLine = lineString(
    routeCoordinates.map(([lat, lng]) => [lng, lat]),
  )

  const distanceKm = pointToLineDistance(stationPoint, routeLine, { units: 'kilometers' })
  return distanceKm <= CORRIDOR_WIDTH_KM
}

export function filterStationsByCorridor(
  stations: Station[],
  routeCoordinates: RouteCoordinate[],
): Station[] {
  return stations.filter((station) => isStationWithinCorridor(station, routeCoordinates))
}
