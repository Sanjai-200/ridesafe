'use client'

import React, { useState, useEffect, useRef } from 'react'
import { MapPin, Navigation, Sparkles, Plus, Trash2, Check, Route as RouteIcon, Info, Compass } from 'lucide-react'

export interface LatLng {
  lat: number
  lng: number
}

export interface StopDraft {
  name: string
  lat: number
  lng: number
}

interface RoutePathBuilderProps {
  startPointName: string
  startCoords: LatLng | null
  endPointName: string
  endCoords: LatLng | null
  stops: StopDraft[]
  onStartChange: (name: string, coords: LatLng | null) => void
  onEndChange: (name: string, coords: LatLng | null) => void
  onStopsChange: (stops: StopDraft[]) => void
}

// Default Coordinates: Kuala Lumpur metropolitan area
const DEFAULT_START: LatLng = { lat: 3.1390, lng: 101.6869 }
const DEFAULT_END: LatLng = { lat: 3.0890, lng: 101.6980 }

// Presets for quick 1-click route testing
const PRESETS = [
  {
    name: 'Kuala Lumpur Central → South Corridor',
    start: { name: 'KL Central School Hub', coords: { lat: 3.1340, lng: 101.6860 } },
    end: { name: 'Sri Petaling Gateway', coords: { lat: 3.0690, lng: 101.6930 } }
  },
  {
    name: 'Mont Kiara Academy → Damansara Heights',
    start: { name: 'Mont Kiara Academy', coords: { lat: 3.1670, lng: 101.6520 } },
    end: { name: 'Damansara Heights Terminal', coords: { lat: 3.1480, lng: 101.6620 } }
  },
  {
    name: 'Bangsar South → Cheras Campus',
    start: { name: 'Bangsar South Depot', coords: { lat: 3.1110, lng: 101.6650 } },
    end: { name: 'Cheras East Academy', coords: { lat: 3.0850, lng: 101.7380 } }
  }
]

// Haversine distance in KM
function haversineKm(p1: LatLng, p2: LatLng): number {
  const R = 6371
  const dLat = (p2.lat - p1.lat) * (Math.PI / 180)
  const dLng = (p2.lng - p1.lng) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1.lat * (Math.PI / 180)) * Math.cos(p2.lat * (Math.PI / 180)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return parseFloat((R * c).toFixed(2))
}

export default function RoutePathBuilder({
  startPointName,
  startCoords,
  endPointName,
  endCoords,
  stops,
  onStartChange,
  onEndChange,
  onStopsChange,
}: RoutePathBuilderProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const polylineRef = useRef<any>(null)

  const [activeClickMode, setActiveClickMode] = useState<'START' | 'END' | 'STOP'>('START')
  const [mapLoaded, setMapLoaded] = useState(false)
  const [newStopName, setNewStopName] = useState('')

  // Calculate total path distance
  const pathPoints: LatLng[] = []
  if (startCoords) pathPoints.push(startCoords)
  stops.forEach(s => pathPoints.push({ lat: s.lat, lng: s.lng }))
  if (endCoords) pathPoints.push(endCoords)

  let totalDistanceKm = 0
  for (let i = 0; i < pathPoints.length - 1; i++) {
    totalDistanceKm += haversineKm(pathPoints[i], pathPoints[i + 1])
  }
  const estimatedDriveMins = Math.max(5, Math.round((totalDistanceKm / 35) * 60))

  // Initialize Leaflet Map safely (dynamic client-side)
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current || mapInstanceRef.current) return

    import('leaflet').then((L) => {
      // Fix default icon assets
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const centerLat = startCoords?.lat ?? DEFAULT_START.lat
      const centerLng = startCoords?.lng ?? DEFAULT_START.lng

      const map = L.map(mapContainerRef.current!, {
        zoomControl: true,
        scrollWheelZoom: true,
      }).setView([centerLat, centerLng], 13)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)

      // Click on map to place pin based on active mode
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng
        const roundedLat = parseFloat(lat.toFixed(6))
        const roundedLng = parseFloat(lng.toFixed(6))

        setActiveClickMode(currentMode => {
          if (currentMode === 'START') {
            onStartChange(startPointName || 'Start Depot', { lat: roundedLat, lng: roundedLng })
            return 'END' // Auto-advance to End point selection
          } else if (currentMode === 'END') {
            onEndChange(endPointName || 'Destination Point', { lat: roundedLat, lng: roundedLng })
            return 'STOP' // Auto-advance to Stop mode
          } else {
            // Add Stop
            const newIndex = stops.length + 1
            const newStop: StopDraft = {
              name: `Stop ${newIndex} — Waypoint`,
              lat: roundedLat,
              lng: roundedLng
            }
            onStopsChange([...stops, newStop])
            return 'STOP'
          }
        })
      })

      mapInstanceRef.current = map
      setMapLoaded(true)
    })

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // Sync Markers and Path Polyline whenever startCoords, endCoords, or stops change
  useEffect(() => {
    if (!mapInstanceRef.current || typeof window === 'undefined') return

    import('leaflet').then((L) => {
      const map = mapInstanceRef.current

      // Remove existing markers
      markersRef.current.forEach(m => map.removeLayer(m))
      markersRef.current = []

      // Remove existing polyline
      if (polylineRef.current) {
        map.removeLayer(polylineRef.current)
        polylineRef.current = null
      }

      const allCoordsForBounds: [number, number][] = []

      // 1. Start Marker (Green)
      if (startCoords) {
        const startIcon = L.divIcon({
          html: `<div style="background:#22c55e;color:#08080A;font-weight:800;font-size:11px;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid #FFF;box-shadow:0 4px 12px rgba(34,197,94,0.6);">🟢</div>`,
          className: '',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        })
        const m = L.marker([startCoords.lat, startCoords.lng], { icon: startIcon, draggable: true })
          .addTo(map)
          .bindPopup(`<strong>Start:</strong> ${startPointName || 'School / Depot'}`)
        m.on('dragend', (ev: any) => {
          const pt = ev.target.getLatLng()
          onStartChange(startPointName, { lat: parseFloat(pt.lat.toFixed(6)), lng: parseFloat(pt.lng.toFixed(6)) })
        })
        markersRef.current.push(m)
        allCoordsForBounds.push([startCoords.lat, startCoords.lng])
      }

      // 2. Intermediate Stops (Yellow badges)
      stops.forEach((stop, idx) => {
        const stopIcon = L.divIcon({
          html: `<div style="background:#FFD60A;color:#08080A;font-weight:800;font-size:12px;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:2px solid #FFF;box-shadow:0 3px 10px rgba(255,214,10,0.5);">${idx + 1}</div>`,
          className: '',
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        })
        const m = L.marker([stop.lat, stop.lng], { icon: stopIcon, draggable: true })
          .addTo(map)
          .bindPopup(`<strong>Stop ${idx + 1}:</strong> ${stop.name}`)
        m.on('dragend', (ev: any) => {
          const pt = ev.target.getLatLng()
          const updated = [...stops]
          updated[idx] = { ...updated[idx], lat: parseFloat(pt.lat.toFixed(6)), lng: parseFloat(pt.lng.toFixed(6)) }
          onStopsChange(updated)
        })
        markersRef.current.push(m)
        allCoordsForBounds.push([stop.lat, stop.lng])
      })

      // 3. End Marker (Red)
      if (endCoords) {
        const endIcon = L.divIcon({
          html: `<div style="background:#ef4444;color:#FFF;font-weight:800;font-size:11px;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid #FFF;box-shadow:0 4px 12px rgba(239,68,68,0.6);">🏁</div>`,
          className: '',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        })
        const m = L.marker([endCoords.lat, endCoords.lng], { icon: endIcon, draggable: true })
          .addTo(map)
          .bindPopup(`<strong>End:</strong> ${endPointName || 'Destination Terminal'}`)
        m.on('dragend', (ev: any) => {
          const pt = ev.target.getLatLng()
          onEndChange(endPointName, { lat: parseFloat(pt.lat.toFixed(6)), lng: parseFloat(pt.lng.toFixed(6)) })
        })
        markersRef.current.push(m)
        allCoordsForBounds.push([endCoords.lat, endCoords.lng])
      }

      // 4. Draw Route Path Polyline
      if (allCoordsForBounds.length >= 2) {
        const polyline = L.polyline(allCoordsForBounds, {
          color: '#FFD60A',
          weight: 4,
          opacity: 0.85,
          dashArray: '8, 8',
        }).addTo(map)
        polylineRef.current = polyline

        try {
          map.fitBounds(L.latLngBounds(allCoordsForBounds), { padding: [40, 40] })
        } catch {}
      } else if (allCoordsForBounds.length === 1) {
        map.panTo(allCoordsForBounds[0])
      }
    })
  }, [startCoords, endCoords, stops, startPointName, endPointName])

  // ✨ Auto-Generate / Suggest Route Path & Intermediate Stops
  const handleAutoSuggestRoute = () => {
    const start = startCoords || DEFAULT_START
    const end = endCoords || DEFAULT_END

    if (!startCoords) {
      onStartChange(startPointName || 'Main School Campus', start)
    }
    if (!endCoords) {
      onEndChange(endPointName || 'Taman Sentosa Terminal', end)
    }

    const latDiff = end.lat - start.lat
    const lngDiff = end.lng - start.lng

    // Generate 3 intelligent interpolated stops along the path
    const suggestedStops: StopDraft[] = [
      {
        name: `${startPointName || 'Campus'} Transit Stop 1`,
        lat: parseFloat((start.lat + latDiff * 0.28).toFixed(6)),
        lng: parseFloat((start.lng + lngDiff * 0.28).toFixed(6)),
      },
      {
        name: `Midway Interchange Stop 2`,
        lat: parseFloat((start.lat + latDiff * 0.55).toFixed(6)),
        lng: parseFloat((start.lng + lngDiff * 0.55).toFixed(6)),
      },
      {
        name: `${endPointName || 'Destination'} Dropoff Stop 3`,
        lat: parseFloat((start.lat + latDiff * 0.82).toFixed(6)),
        lng: parseFloat((start.lng + lngDiff * 0.82).toFixed(6)),
      },
    ]

    onStopsChange(suggestedStops)
  }

  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    onStartChange(preset.start.name, preset.start.coords)
    onEndChange(preset.end.name, preset.end.coords)

    const latDiff = preset.end.coords.lat - preset.start.coords.lat
    const lngDiff = preset.end.coords.lng - preset.start.coords.lng

    const stops: StopDraft[] = [
      {
        name: `${preset.start.name} Stop A`,
        lat: parseFloat((preset.start.coords.lat + latDiff * 0.33).toFixed(6)),
        lng: parseFloat((preset.start.coords.lng + lngDiff * 0.33).toFixed(6)),
      },
      {
        name: `${preset.end.name} Stop B`,
        lat: parseFloat((preset.start.coords.lat + latDiff * 0.66).toFixed(6)),
        lng: parseFloat((preset.start.coords.lng + lngDiff * 0.66).toFixed(6)),
      },
    ]
    onStopsChange(stops)
  }

  const handleAddManualStop = () => {
    const name = newStopName.trim() || `Stop ${stops.length + 1}`
    const baseLat = endCoords?.lat ?? startCoords?.lat ?? DEFAULT_START.lat
    const baseLng = endCoords?.lng ?? startCoords?.lng ?? DEFAULT_START.lng

    const newStop: StopDraft = {
      name,
      lat: parseFloat((baseLat + (Math.random() - 0.5) * 0.01).toFixed(6)),
      lng: parseFloat((baseLng + (Math.random() - 0.5) * 0.01).toFixed(6)),
    }
    onStopsChange([...stops, newStop])
    setNewStopName('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Route Quick Presets Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', color: '#A6A6B2', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Compass size={14} color="#FFD60A" /> Presets:
        </span>
        {PRESETS.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleApplyPreset(p)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid #26262C',
              color: '#FFF',
              fontSize: '0.72rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* Map Action Mode Bar & Auto-Suggest Action */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
        background: '#1C1C21',
        padding: '10px 14px',
        borderRadius: 12,
        border: '1px solid #26262C'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.76rem', color: '#A6A6B2', fontWeight: 600, marginRight: 4 }}>Click map to place:</span>
          
          <button
            type="button"
            onClick={() => setActiveClickMode('START')}
            style={{
              padding: '5px 12px',
              borderRadius: 9999,
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: activeClickMode === 'START' ? '#22c55e' : '#26262C',
              background: activeClickMode === 'START' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)',
              color: activeClickMode === 'START' ? '#22c55e' : '#A6A6B2',
            }}
          >
            🟢 Start Point {startCoords ? '✓' : ''}
          </button>

          <button
            type="button"
            onClick={() => setActiveClickMode('END')}
            style={{
              padding: '5px 12px',
              borderRadius: 9999,
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: activeClickMode === 'END' ? '#ef4444' : '#26262C',
              background: activeClickMode === 'END' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
              color: activeClickMode === 'END' ? '#ef4444' : '#A6A6B2',
            }}
          >
            🔴 End Point {endCoords ? '✓' : ''}
          </button>

          <button
            type="button"
            onClick={() => setActiveClickMode('STOP')}
            style={{
              padding: '5px 12px',
              borderRadius: 9999,
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: activeClickMode === 'STOP' ? '#FFD60A' : '#26262C',
              background: activeClickMode === 'STOP' ? 'rgba(255,214,10,0.2)' : 'rgba(255,255,255,0.04)',
              color: activeClickMode === 'STOP' ? '#FFD60A' : '#A6A6B2',
            }}
          >
            🟡 Add Stop ({stops.length})
          </button>
        </div>

        {/* ✨ Auto-Route Suggestion Button */}
        <button
          type="button"
          onClick={handleAutoSuggestRoute}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(255,214,10,0.25), rgba(255,214,10,0.1))',
            border: '1px solid #FFD60A',
            color: '#FFD60A',
            fontSize: '0.78rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 2px 10px rgba(255,214,10,0.15)'
          }}
        >
          <Sparkles size={14} /> Auto-Suggest Path & Stops
        </button>
      </div>

      {/* Interactive Leaflet Map View */}
      <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '1px solid #26262C' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: 320, background: '#0E0E11' }} />
        
        {/* Floating Telemetry Badge */}
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          zIndex: 1000,
          background: 'rgba(8,8,10,0.88)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #26262C',
          borderRadius: 8,
          padding: '6px 12px',
          display: 'flex',
          gap: 12,
          fontSize: '0.75rem',
          color: '#FFF'
        }}>
          <div><strong>Distance:</strong> <span style={{ color: '#FFD60A' }}>{totalDistanceKm} km</span></div>
          <div><strong>Est. Time:</strong> <span style={{ color: '#22c55e' }}>~{estimatedDriveMins} mins</span></div>
          <div><strong>Stops:</strong> <span style={{ color: '#38bdf8' }}>{stops.length} intermediate</span></div>
        </div>
      </div>

      {/* Start & End Point Configuration */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: '#141417', border: '1px solid #26262C', borderRadius: 10, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#22c55e' }}>🟢 Start Point</span>
            {startCoords && <span style={{ fontSize: '0.7rem', color: '#6E6E7A', fontFamily: 'monospace' }}>[{startCoords.lat.toFixed(4)}, {startCoords.lng.toFixed(4)}]</span>}
          </div>
          <input
            type="text"
            className="input-field"
            placeholder="e.g. SJK Taman Maju / School Depot"
            value={startPointName}
            onChange={e => onStartChange(e.target.value, startCoords)}
            style={{ width: '100%', padding: '8px 10px', fontSize: '0.85rem', background: '#0E0E11', border: '1px solid #26262C', borderRadius: 8, color: '#FFF' }}
          />
        </div>

        <div style={{ background: '#141417', border: '1px solid #26262C', borderRadius: 10, padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ef4444' }}>🔴 End Point</span>
            {endCoords && <span style={{ fontSize: '0.7rem', color: '#6E6E7A', fontFamily: 'monospace' }}>[{endCoords.lat.toFixed(4)}, {endCoords.lng.toFixed(4)}]</span>}
          </div>
          <input
            type="text"
            className="input-field"
            placeholder="e.g. Taman Sentosa Destination"
            value={endPointName}
            onChange={e => onEndChange(e.target.value, endCoords)}
            style={{ width: '100%', padding: '8px 10px', fontSize: '0.85rem', background: '#0E0E11', border: '1px solid #26262C', borderRadius: 8, color: '#FFF' }}
          />
        </div>
      </div>

      {/* Intermediate Stops List with in-place edit and remove */}
      <div style={{ background: '#141417', border: '1px solid #26262C', borderRadius: 12, padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#FFF' }}>
            🚏 Intermediate Stops Along Corridor ({stops.length})
          </span>
          <span style={{ fontSize: '0.72rem', color: '#A6A6B2' }}>
            {stops.length === 0 ? 'Optional: Path will connect Start & End directly' : 'Drag pins on map or edit below'}
          </span>
        </div>

        {stops.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
            {stops.map((stop, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#1C1C21',
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: '1px solid #26262C'
                }}
              >
                <div style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: '#FFD60A',
                  color: '#08080A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  flexShrink: 0
                }}>
                  {idx + 1}
                </div>
                <input
                  type="text"
                  value={stop.name}
                  onChange={e => {
                    const updated = [...stops]
                    updated[idx] = { ...updated[idx], name: e.target.value }
                    onStopsChange(updated)
                  }}
                  style={{
                    flex: 1,
                    background: '#0E0E11',
                    border: '1px solid #26262C',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontSize: '0.82rem',
                    color: '#FFF'
                  }}
                />
                <span style={{ fontSize: '0.72rem', color: '#6E6E7A', fontFamily: 'monospace' }}>
                  [{stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}]
                </span>
                <button
                  type="button"
                  onClick={() => onStopsChange(stops.filter((_, i) => i !== idx))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#FF453A',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center'
                  }}
                  title="Remove Stop"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: '16px 8px',
            color: '#A6A6B2',
            fontSize: '0.8rem',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 8
          }}>
            No intermediate stops specified. You can create the route directly without stops, or click <strong>Auto-Suggest Path & Stops</strong> above to generate waypoints.
          </div>
        )}

        {/* Quick Add Stop input */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            type="text"
            placeholder="Add custom stop name..."
            value={newStopName}
            onChange={e => setNewStopName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddManualStop() } }}
            style={{
              flex: 1,
              background: '#0E0E11',
              border: '1px solid #26262C',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: '0.82rem',
              color: '#FFF'
            }}
          />
          <button
            type="button"
            onClick={handleAddManualStop}
            style={{
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(255,214,10,0.15)',
              border: '1px solid rgba(255,214,10,0.35)',
              color: '#FFD60A',
              fontWeight: 700,
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            <Plus size={13} /> Add Stop
          </button>
        </div>
      </div>
    </div>
  )
}
