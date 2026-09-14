import { memo, useEffect, useMemo, useState } from 'react'
import { ActionIcon } from '@mantine/core'
import { LatLngBounds, divIcon, point, type Map as LeafletMap } from 'leaflet'
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet'
import { LocateFixed, Minus, Navigation, Plus } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import type { DrivingRoute, RankedStation } from '../types'

interface MapLocation {
  latitude: number
  longitude: number
  label?: string
}

interface MapPanelProps {
  stations: RankedStation[]
  selectedId?: string
  onSelect: (station: RankedStation) => void
  location: MapLocation
  routeOrigin?: MapLocation
  routeDestination?: MapLocation
  destinationRoute?: DrivingRoute | null
  currentLocation?: Pick<MapLocation, 'latitude' | 'longitude'> & { accuracy: number }
  route?: DrivingRoute | null
  routeStation?: RankedStation | null
  routeLoading?: boolean
  routeError?: string
}

function MapViewport({
  stations,
  location,
  route,
  routeOrigin,
  routeDestination,
  destinationRoute,
  routeStation,
  routeLoading,
  routeError,
}: {
  stations: RankedStation[]
  location: MapLocation
  route?: DrivingRoute | null
  routeOrigin?: MapLocation
  routeDestination?: MapLocation
  destinationRoute?: DrivingRoute | null
  routeStation?: RankedStation | null
  routeLoading?: boolean
  routeError?: string
}) {
  const map = useMap()

  const routePoints =
    routeStation && routeOrigin
      ? [
          [routeOrigin.latitude, routeOrigin.longitude] as [number, number],
          ...((route?.coordinates ?? []) as [number, number][]),
          [routeStation.latitude, routeStation.longitude] as [number, number],
        ]
      : []
  const destinationPoints =
    routeOrigin && routeDestination && destinationRoute
      ? [
          [routeOrigin.latitude, routeOrigin.longitude] as [number, number],
          ...((destinationRoute.coordinates ?? []) as [number, number][]),
          [routeDestination.latitude, routeDestination.longitude] as [number, number],
        ]
      : []
  const points: [number, number][] =
    routeStation && routeOrigin && (routeLoading || route || routeError)
      ? [...routePoints, ...destinationPoints]
      : routeOrigin && routeDestination && destinationRoute
        ? destinationPoints
        : [
            [location.latitude, location.longitude],
            ...stations.map((station) => [station.latitude, station.longitude] as [number, number]),
          ]
  // Parent state changes frequently while a route loads. Depend on the effective
  // viewport instead of object identities/status flags so identical bounds are
  // not fitted repeatedly, which otherwise makes Leaflet reload the same tiles.
  const viewportKey = points.map(([latitude, longitude]) => `${latitude},${longitude}`).join('|')

  useEffect(() => {
    if (points.length === 1) {
      map.setView(points[0], 15)
      return
    }

    map.fitBounds(new LatLngBounds(points), {
      animate: false,
      maxZoom: 15,
      padding: [46, 46],
    })
    // `viewportKey` fully represents `points`; using it prevents refits when
    // React recreates station or route objects without changing coordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, viewportKey])

  return null
}

function stationIcon(rank: number, available: boolean, selected: boolean) {
  return divIcon({
    className: 'station-marker-shell',
    html: `<span class="station-marker ${available ? 'available' : 'busy'} ${selected ? 'selected' : ''}">${rank}</span>`,
    iconAnchor: [18, 42],
    iconSize: [36, 42],
    tooltipAnchor: [0, -36],
  })
}

export const MapPanel = memo(function MapPanel({
  stations,
  selectedId,
  onSelect,
  location,
  routeOrigin,
  routeDestination,
  destinationRoute,
  currentLocation,
  route,
  routeStation,
  routeLoading,
  routeError,
}: MapPanelProps) {
  const [map, setMap] = useState<LeafletMap | null>(null)
  const [zoom, setZoom] = useState(13)

  useEffect(() => {
    if (!map) return
    const syncZoom = () => setZoom(map.getZoom())
    syncZoom()
    map.on('zoomend', syncZoom)
    return () => {
      map.off('zoomend', syncZoom)
    }
  }, [map])

  const icons = useMemo(
    () =>
      stations.map((station, index) => {
        const available =
          (station.connectors.find((item) => item.type === station.selectedConnector)?.available ?? 0) > 0
        return stationIcon(index + 1, available, selectedId === station.id)
      }),
    [selectedId, stations],
  )

  const zoomIn = () => map?.zoomIn()
  const zoomOut = () => map?.zoomOut()
  const recenter = () =>
    currentLocation &&
    map?.flyTo([currentLocation.latitude, currentLocation.longitude], Math.max(map.getZoom(), 15), {
      duration: 0.65,
    })

  return (
    <div
      className="map-panel"
      role="region"
      aria-label={`Interactive charger map near ${location.label ?? 'your search location'}`}
    >
      <MapContainer
        center={[location.latitude, location.longitude]}
        zoom={13}
        zoomControl={false}
        scrollWheelZoom
        ref={(nextMap) => setMap(nextMap)}
        className="interactive-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapViewport
          stations={stations}
          location={location}
          routeOrigin={routeOrigin}
          routeDestination={routeDestination}
          destinationRoute={destinationRoute}
          route={route}
          routeStation={routeStation}
          routeLoading={routeLoading}
          routeError={routeError}
        />

        {currentLocation && (
          <>
            <CircleMarker
              center={[currentLocation.latitude, currentLocation.longitude]}
              radius={9}
              pathOptions={{ color: '#ffffff', fillColor: '#3784cf', fillOpacity: 1, weight: 3 }}
              interactive={false}
              className="current-location-marker"
            />
            <Circle
              center={[currentLocation.latitude, currentLocation.longitude]}
              radius={Math.max(10, currentLocation.accuracy)}
              pathOptions={{ color: '#3784cf', fillColor: '#3784cf', fillOpacity: 0.09, weight: 1 }}
              interactive={false}
            />
          </>
        )}

        {stations.map((station, index) => {
          const stationConnector = station.connectors.find((item) => item.type === station.selectedConnector)
          const selected = selectedId === station.id
          return (
            <Marker
              key={station.id}
              position={[station.latitude, station.longitude]}
              icon={icons[index]}
              zIndexOffset={selected ? 1000 : 0}
              title={`View ${station.name}`}
              alt={`${station.name} charger`}
              eventHandlers={{ click: () => onSelect(station) }}
            >
              <Tooltip
                direction="top"
                offset={point(0, -2)}
                opacity={1}
                permanent={selected}
                className="station-map-tooltip"
              >
                <b>{station.name}</b>
                <span>
                  {stationConnector?.available ?? 'Unknown'} available ·{' '}
                  {stationConnector?.powerKw || 'Unknown'} kW
                </span>
              </Tooltip>
            </Marker>
          )
        })}
        {destinationRoute && destinationRoute.coordinates.length > 1 && (
          <Polyline
            positions={destinationRoute.coordinates}
            pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.7, dashArray: '8,4' }}
          />
        )}
        {route && route.coordinates.length > 1 && (
          <Polyline
            positions={route.coordinates}
            pathOptions={{ color: '#dc2626', weight: 5, opacity: 0.88 }}
          />
        )}
      </MapContainer>

      <div className="map-controls" aria-label="Map controls">
        <ActionIcon
          type="button"
          variant="default"
          onClick={zoomIn}
          disabled={!map || zoom >= map.getMaxZoom()}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus size={17} />
        </ActionIcon>
        <ActionIcon
          type="button"
          variant="default"
          onClick={zoomOut}
          disabled={!map || zoom <= map.getMinZoom()}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus size={17} />
        </ActionIcon>
        <ActionIcon
          type="button"
          variant="default"
          onClick={recenter}
          disabled={!map || !currentLocation}
          aria-label="Recenter on my location"
          title={currentLocation ? 'Recenter on my location' : 'Current location unavailable'}
        >
          <LocateFixed size={17} />
        </ActionIcon>
      </div>

      <div className="map-search-label" title={location.label}>
        <LocateFixed size={13} />
        <span>Search center</span>
        <b>{location.label ?? 'Selected location'}</b>
      </div>
      {(routeLoading || routeError || route) && (
        <div
          className={`map-route-status ${routeError ? 'error' : routeLoading ? 'loading' : ''}`}
          role={routeError ? 'alert' : 'status'}
        >
          {routeLoading && <span className="route-status-spinner" aria-hidden="true" />}
          {!routeLoading && !routeError && <Navigation size={13} />}
          <span>
            {routeLoading
              ? 'Loading OneMap road route…'
              : routeError
                ? routeStation?.travelSource === 'OneMap'
                  ? 'Road geometry unavailable — OneMap travel time retained'
                  : 'Road route unavailable — straight-line estimate only'
                : route
                  ? `OneMap road route · ${route.distanceKm.toFixed(2)} km · ${route.travelMinutes} min`
                  : ''}
          </span>
        </div>
      )}
      <div className="map-legend">
        <span>
          <i className="legend-available" /> Available
        </span>
        <span>
          <i className="legend-busy" /> Busy
        </span>
        {currentLocation && (
          <span>
            <i className="legend-you" /> Your location
          </span>
        )}
        {destinationRoute && (
          <span>
            <i className="legend-destination-route" /> Route to destination
          </span>
        )}
        {route && routeStation && (
          <span>
            <i className="legend-selected-route" /> Route to selected charger
          </span>
        )}
      </div>
    </div>
  )
})
