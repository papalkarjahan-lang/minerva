import Map, { NavigationControl, ScaleControl, Source, Layer } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

// Real Mapbox GL map for the public site — same stack as the actual
// product (DispatcherView/TrackingView): mapbox://styles/mapbox/dark-v11,
// terrain exaggeration, a sky layer, and real 3D building extrusions via
// fill-extrusion, not an illustration of one. VITE_MAPBOX_TOKEN now holds
// a real, verified token (confirmed live against Mapbox's API 2026-10-30
// — the earlier "still a placeholder" state this file's callers used to
// assume is out of date), so the public demo pages can finally show the
// same real map the authenticated app does, gated the same way
// production gates it: isMapboxTokenConfigured() decides whether <Map3D>
// or a caller's own fallback renders at all.
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

function handleLoad(e) {
  // Same dark-console fog/light treatment as DispatcherView's
  // handleDispatcherMapLoad — kept in sync deliberately so the public
  // demo and the real product look like the same map, not two different
  // ones.
  e.target.setFog({
    range: [0.5, 10],
    color: '#0b1220',
    'high-color': '#1b2a4a',
    'space-color': '#020308',
    'star-intensity': 0.15,
  })
  e.target.setLight({ anchor: 'viewport', color: '#8fb8ff', intensity: 0.5 })
}

export default function Map3D({ viewState, onMove, interactive = false, showControls = false, children, onLoad, onError }) {
  return (
    <Map
      {...viewState}
      onMove={interactive ? onMove : undefined}
      dragPan={interactive}
      dragRotate={interactive}
      scrollZoom={interactive}
      doubleClickZoom={interactive}
      touchZoomRotate={interactive}
      keyboard={false}
      onLoad={(e) => { handleLoad(e); onLoad?.(e) }}
      onError={onError}
      antialias
      style={{ width: '100%', height: '100%' }}
      mapStyle="mapbox://styles/mapbox/dark-v11"
      mapboxAccessToken={MAPBOX_TOKEN}
      terrain={{ source: 'mapbox-dem', exaggeration: 1.4 }}
      reuseMaps
    >
      {showControls && <NavigationControl position="top-right" visualizePitch showCompass />}
      {showControls && <ScaleControl position="bottom-left" unit="metric" />}

      <Source id="mapbox-dem" type="raster-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={512} maxzoom={14} />
      <Layer id="sky" type="sky" paint={{ 'sky-type': 'atmosphere', 'sky-atmosphere-sun-intensity': 15 }} />

      {/* Real 3D building extrusions — identical paint to DispatcherView's
          #1e3a5f fill, so a visitor who later signs up sees the same map
          they were shown here, not a bait-and-switch. */}
      <Layer
        id="3d-buildings"
        source="composite"
        source-layer="building"
        filter={['==', 'extrude', 'true']}
        type="fill-extrusion"
        minzoom={13}
        paint={{
          'fill-extrusion-color': '#1e3a5f',
          'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-base': ['get', 'min_height'],
          'fill-extrusion-opacity': 0.8,
        }}
      />

      {children}
    </Map>
  )
}

// A real route, rendered as an actual GeoJSON LineString layer — the same
// Source/Layer shape DispatcherView uses for a technician's GPS trail.
export function RouteLine({ id, coordinates, color = '#1D9E75', width = 4 }) {
  return (
    <Source id={id} type="geojson" data={{ type: 'Feature', geometry: { type: 'LineString', coordinates } }}>
      <Layer
        id={`${id}-glow`}
        type="line"
        paint={{ 'line-color': color, 'line-width': width + 5, 'line-opacity': 0.18, 'line-blur': 3 }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
      <Layer
        id={`${id}-line`}
        type="line"
        paint={{ 'line-color': color, 'line-width': width, 'line-opacity': 0.95 }}
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
      />
    </Source>
  )
}
