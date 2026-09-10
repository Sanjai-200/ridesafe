'use client'

import React, { useState, useEffect, useRef } from 'react'
import { MapPin, Navigation, Sparkles, Plus, Trash2, Route as RouteIcon, Compass, Crosshair } from 'lucide-react'

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

// Default fallback coordinates: Kuala Lumpur
const DEFAULT_START: LatLng = { lat: 3.1390, lng: 101.6869 }
const DEFAULT_END: LatLng = { lat: 3.0890, lng: 101.6980 }

// Quick 1-click route presets
const PRESETS = [
  {
    name: 'KL Hub → Sri Petaling',
    start: { name: 'KL Central School Depot', coords: { lat: 3.1340, lng: 101.6860 } },
    end: { name: 'Sri Petaling Community Gate', coords: { lat: 3.0690, lng: 101.6930 } }
  },
  {
    name: 'Mont Kiara → Damansara',
    start: { name: 'Mont Kiara Academy', coords: { lat: 3.1670, lng: 101.6520 } },
    end: { name: 'Damansara Heights Terminal', coords: { lat: 3.1480, lng: 101.6620 } }
  },
  {
    name: 'Bangsar → Cheras',
    start: { name: 'Bangsar South Hub', coords: { lat: 3.1110, lng: 101.6650 } },
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

  // String state for inputs so users can type freely without NaN interruptions
  const [startLatInput, setStartLatInput] = useState<string>(startCoords?.lat != null ? String(startCoords.lat) : '3.139000')
  const [startLngInput, setStartLngInput] = useState<string>(startCoords?.lng != null ? String(startCoords.lng) : '101.686900')
  const [endLatInput, setEndLatInput] = useState<string>(endCoords?.lat != null ? String(endCoords.lat) : '3.089000')
  const [endLngInput, setEndLngInput] = useState<string>(endCoords?.lng != null ? String(endCoords.lng) : '101.698000')

  // New Stop input row
  const [newStopName, setNewStopName] = useState('')
  const [newStopLatInput, setNewStopLatInput] = useState('')
  const [newStopLngInput, setNewStopLngInput] = useState('')

  // Sync string inputs when coords change externally (map click/drag or preset)
  useEffect(() => {
    if (startCoords && startCoords.lat != null && startCoords.lng != null) {
      setStartLatInput(String(Number(startCoords.lat.toFixed(6))))
      setStartLngInput(String(Number(startCoords.lng.toFixed(6))))
    }
  }, [startCoords?.lat, startCoords?.lng])

  useEffect(() => {
    if (endCoords && endCoords.lat != null && endCoords.lng != null) {
      setEndLatInput(String(Number(endCoords.lat.toFixed(6))))
      setEndLngInput(String(Number(endCoords.lng.toFixed(6))))
    }
  }, [endCoords?.lat, endCoords?.lng])

  // Calculate connected path & statistics
  const pathPoints: LatLng[] = []
  if (startCoords) pathPoints.push(startCoords)
  stops.forEach(s => pathPoints.push({ lat: s.lat, lng: s.lng }))
  if (endCoords) pathPoints.push(endCoords)

  let totalDistanceKm = 0
  for (let i = 0; i < pathPoints.length - 1; i++) {
    totalDistanceKm += haversineKm(pathPoints[i], pathPoints[i + 1])
  }
  const estimatedDriveMins = Math.max(5, Math.round((totalDistanceKm / 32) * 60))

  // Initialize Leaflet Map
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current || mapInstanceRef.current) return

    import('leaflet').then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const center = startCoords || DEFAULT_START
      const map = L.map(mapContainerRef.current!, {
        center: [center.lat, center.lng],
        zoom: 12,
        attributionControl: false,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
      }).addTo(map)

      // Map Click Handler: Updates coordinates based on active mode
      map.on('click', (e: any) => {
        const lat = parseFloat(e.latlng.lat.toFixed(6))
        const lng = parseFloat(e.latlng.lng.toFixed(6))

        const mode = (window as any).__RS_MAP_CLICK_MODE || 'START'

        if (mode === 'START') {
          const name = (window as any).__RS_START_NAME || 'School / Depot'
          onStartChange(name, { lat, lng })
          setStartLatInput(String(lat))
          setStartLngInput(String(lng))
        } else if (mode === 'END') {
          const name = (window as any).__RS_END_NAME || 'Destination Terminal'
          onEndChange(name, { lat, lng })
          setEndLatInput(String(lat))
          setEndLngInput(String(lng))
        } else if (mode === 'STOP') {
          const currentStops: StopDraft[] = (window as any).__RS_CURRENT_STOPS || []
          const stopNum = currentStops.length + 1
          const newStops = [
            ...currentStops,
            { name: `Transit Stop ${stopNum}`, lat, lng }
          ]
          onStopsChange(newStops)
        }
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

  // Sync click mode & current values to window globals for map click listener
  useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as any).__RS_MAP_CLICK_MODE = activeClickMode
      ;(window as any).__RS_START_NAME = startPointName
      ;(window as any).__RS_END_NAME = endPointName
      ;(window as any).__RS_CURRENT_STOPS = stops
    }
  }, [activeClickMode, startPointName, endPointName, stops])

  // Update Markers & Connected Polyline whenever points change
  useEffect(() => {
    if (!mapInstanceRef.current) return

    import('leaflet').then((L) => {
      const map = mapInstanceRef.current
      if (!map) return

      // Remove existing markers & polyline
      markersRef.current.forEach((m) => map.removeLayer(m))
      markersRef.current = []
      if (polylineRef.current) {
        map.removeLayer(polylineRef.current)
        polylineRef.current = null
      }

      const allCoordsForBounds: [number, number][] = []

      // 🟢 Start Marker
      if (startCoords && !isNaN(startCoords.lat) && !isNaN(startCoords.lng)) {
        allCoordsForBounds.push([startCoords.lat, startCoords.lng])
        const startIcon = L.divIcon({
          className: 'rs-start-pin',
          html: `
            <div style="
              display: flex;
              align-items: center;
              gap: 4px;
              background: #22c55e;
              color: #08080A;
              padding: 3px 8px;
              border-radius: 9999px;
              font-size: 11px;
              font-weight: 800;
              box-shadow: 0 2px 10px rgba(34,197,94,0.5);
              border: 2px solid #FFF;
              white-space: nowrap;
              transform: translate(-50%, -100%);
            ">
              <span>🟢</span>
              <span>START</span>
            </div>
          `,
          iconSize: [0, 0],
        })

        const marker = L.marker([startCoords.lat, startCoords.lng], {
          icon: startIcon,
          draggable: true,
        }).addTo(map)

        marker.on('dragend', (ev: any) => {
          const pos = ev.target.getLatLng()
          const lat = parseFloat(pos.lat.toFixed(6))
          const lng = parseFloat(pos.lng.toFixed(6))
          onStartChange(startPointName, { lat, lng })
          setStartLatInput(String(lat))
          setStartLngInput(String(lng))
        })
        markersRef.current.push(marker)
      }

      // 🟡 Intermediate Stop Markers
      stops.forEach((stop, idx) => {
        if (!isNaN(stop.lat) && !isNaN(stop.lng)) {
          allCoordsForBounds.push([stop.lat, stop.lng])
          const stopIcon = L.divIcon({
            className: 'rs-stop-pin',
            html: `
              <div style="
                display: flex;
                align-items: center;
                gap: 3px;
                background: #FFD60A;
                color: #08080A;
                padding: 2px 7px;
                border-radius: 9999px;
                font-size: 10px;
                font-weight: 800;
                box-shadow: 0 2px 8px rgba(255,214,10,0.5);
                border: 2px solid #08080A;
                white-space: nowrap;
                transform: translate(-50%, -100%);
              ">
                <span style="background: #08080A; color: #FFD60A; width: 14px; height: 14px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 9px;">${idx + 1}</span>
                <span>${stop.name || `Stop ${idx + 1}`}</span>
              </div>
            `,
            iconSize: [0, 0],
          })

          const marker = L.marker([stop.lat, stop.lng], {
            icon: stopIcon,
            draggable: true,
          }).addTo(map)

          marker.on('dragend', (ev: any) => {
            const pos = ev.target.getLatLng()
            const updated = [...stops]
            updated[idx] = {
              ...updated[idx],
              lat: parseFloat(pos.lat.toFixed(6)),
              lng: parseFloat(pos.lng.toFixed(6)),
            }
            onStopsChange(updated)
          })
          markersRef.current.push(marker)
        }
      })

      // 🔴 End Marker
      if (endCoords && !isNaN(endCoords.lat) && !isNaN(endCoords.lng)) {
        allCoordsForBounds.push([endCoords.lat, endCoords.lng])
        const endIcon = L.divIcon({
          className: 'rs-end-pin',
          html: `
            <div style="
              display: flex;
              align-items: center;
              gap: 4px;
              background: #ef4444;
              color: #FFF;
              padding: 3px 8px;
              border-radius: 9999px;
              font-size: 11px;
              font-weight: 800;
              box-shadow: 0 2px 10px rgba(239,68,68,0.5);
              border: 2px solid #FFF;
              white-space: nowrap;
              transform: translate(-50%, -100%);
            ">
              <span>🔴</span>
              <span>END</span>
            </div>
          `,
          iconSize: [0, 0],
        })

        const marker = L.marker([endCoords.lat, endCoords.lng], {
          icon: endIcon,
          draggable: true,
        }).addTo(map)

        marker.on('dragend', (ev: any) => {
          const pos = ev.target.getLatLng()
          const lat = parseFloat(pos.lat.toFixed(6))
          const lng = parseFloat(pos.lng.toFixed(6))
          onEndChange(endPointName, { lat, lng })
          setEndLatInput(String(lat))
          setEndLngInput(String(lng))
        })
        markersRef.current.push(marker)
      }

      // ⚡ Draw Connected Polyline Path: Start -> Stops -> End
      if (allCoordsForBounds.length >= 2) {
        const polyline = L.polyline(allCoordsForBounds, {
          color: '#FFD60A',
          weight: 4,
          opacity: 0.85,
          dashArray: '6, 8',
          lineCap: 'round',
        }).addTo(map)
        polylineRef.current = polyline
      }

      // Auto-fit bounds if markers exist
      if (allCoordsForBounds.length > 1) {
        const bounds = L.latLngBounds(allCoordsForBounds)
        map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 })
      } else if (allCoordsForBounds.length === 1) {
        map.panTo(allCoordsForBounds[0])
      }
    })
  }, [startCoords, endCoords, stops, startPointName, endPointName])

  // Handle direct manual typing of Start Latitude
  const handleStartLatChange = (val: string) => {
    setStartLatInput(val)
    const lat = parseFloat(val)
    const lng = parseFloat(startLngInput)
    if (!isNaN(lat) && !isNaN(lng)) {
      onStartChange(startPointName, { lat, lng })
    }
  }

  // Handle direct manual typing of Start Longitude
  const handleStartLngChange = (val: string) => {
    setStartLngInput(val)
    const lat = parseFloat(startLatInput)
    const lng = parseFloat(val)
    if (!isNaN(lat) && !isNaN(lng)) {
      onStartChange(startPointName, { lat, lng })
    }
  }

  // Handle direct manual typing of End Latitude
  const handleEndLatChange = (val: string) => {
    setEndLatInput(val)
    const lat = parseFloat(val)
    const lng = parseFloat(endLngInput)
    if (!isNaN(lat) && !isNaN(lng)) {
      onEndChange(endPointName, { lat, lng })
    }
  }

  // Handle direct manual typing of End Longitude
  const handleEndLngChange = (val: string) => {
    setEndLngInput(val)
    const lat = parseFloat(endLatInput)
    const lng = parseFloat(val)
    if (!isNaN(lat) && !isNaN(lng)) {
      onEndChange(endPointName, { lat, lng })
    }
  }

  // GPS for Start
  const handleGpsStart = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = parseFloat(pos.coords.latitude.toFixed(6))
      const lng = parseFloat(pos.coords.longitude.toFixed(6))
      setStartLatInput(String(lat))
      setStartLngInput(String(lng))
      onStartChange(startPointName || 'Current Location', { lat, lng })
    })
  }

  // GPS for End
  const handleGpsEnd = () => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = parseFloat(pos.coords.latitude.toFixed(6))
      const lng = parseFloat(pos.coords.longitude.toFixed(6))
      setEndLatInput(String(lat))
      setEndLngInput(String(lng))
      onEndChange(endPointName || 'Current Location', { lat, lng })
    })
  }

  // ✨ Auto Connect Path & Suggest Intermediate Stops along the Corridor
  const handleAutoConnectAndSuggest = () => {
    const startLat = parseFloat(startLatInput) || DEFAULT_START.lat
    const startLng = parseFloat(startLngInput) || DEFAULT_START.lng
    const endLat = parseFloat(endLatInput) || DEFAULT_END.lat
    const endLng = parseFloat(endLngInput) || DEFAULT_END.lng

    const sCoords: LatLng = { lat: startLat, lng: startLng }
    const eCoords: LatLng = { lat: endLat, lng: endLng }

    onStartChange(startPointName || 'School Depot / Campus', sCoords)
    onEndChange(endPointName || 'Destination Terminal', eCoords)
    setStartLatInput(String(startLat))
    setStartLngInput(String(startLng))
    setEndLatInput(String(endLat))
    setEndLngInput(String(endLng))

    const latDiff = endLat - startLat
    const lngDiff = endLng - startLng

    // Generate 3 evenly distributed corridor waypoint stops
    const suggestedStops: StopDraft[] = [
      {
        name: `Transit Waypoint 1`,
        lat: parseFloat((startLat + latDiff * 0.28).toFixed(6)),
        lng: parseFloat((startLng + lngDiff * 0.28).toFixed(6)),
      },
      {
        name: `Central Interchange 2`,
        lat: parseFloat((startLat + latDiff * 0.55).toFixed(6)),
        lng: parseFloat((startLng + lngDiff * 0.55).toFixed(6)),
      },
      {
        name: `Dropoff Waypoint 3`,
        lat: parseFloat((startLat + latDiff * 0.82).toFixed(6)),
        lng: parseFloat((startLng + lngDiff * 0.82).toFixed(6)),
      },
    ]

    onStopsChange(suggestedStops)
  }

  // Apply quick preset
  const handleApplyPreset = (preset: typeof PRESETS[0]) => {
    onStartChange(preset.start.name, preset.start.coords)
    onEndChange(preset.end.name, preset.end.coords)
    setStartLatInput(String(preset.start.coords.lat))
    setStartLngInput(String(preset.start.coords.lng))
    setEndLatInput(String(preset.end.coords.lat))
    setEndLngInput(String(preset.end.coords.lng))

    const latDiff = preset.end.coords.lat - preset.start.coords.lat
    const lngDiff = preset.end.coords.lng - preset.start.coords.lng

    const stopsList: StopDraft[] = [
      {
        name: `${preset.start.name} Stop 1`,
        lat: parseFloat((preset.start.coords.lat + latDiff * 0.33).toFixed(6)),
        lng: parseFloat((preset.start.coords.lng + lngDiff * 0.33).toFixed(6)),
      },
      {
        name: `${preset.end.name} Stop 2`,
        lat: parseFloat((preset.start.coords.lat + latDiff * 0.66).toFixed(6)),
        lng: parseFloat((preset.start.coords.lng + lngDiff * 0.66).toFixed(6)),
      },
    ]
    onStopsChange(stopsList)
  }

  // Add stop manually from row
  const handleAddManualStop = () => {
    const name = newStopName.trim() || `Stop ${stops.length + 1}`
    const lat = parseFloat(newStopLatInput) || (endCoords?.lat ?? startCoords?.lat ?? DEFAULT_START.lat)
    const lng = parseFloat(newStopLngInput) || (endCoords?.lng ?? startCoords?.lng ?? DEFAULT_START.lng)

    const newStop: StopDraft = {
      name,
      lat: parseFloat(lat.toFixed(6)),
      lng: parseFloat(lng.toFixed(6)),
    }
    onStopsChange([...stops, newStop])
    setNewStopName('')
    setNewStopLatInput('')
    setNewStopLngInput('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 1. Quick Presets Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.78rem', color: '#A6A6B2', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Compass size={14} color="#FFD60A" /> Quick Presets:
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
              transition: 'all 0.15s',
            }}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* 2. Top Location Cards: Start Point & End Point with Explicit Latitude & Longitude Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {/* 🟢 Start Point Card */}
        <div style={{
          background: '#141417',
          border: activeClickMode === 'START' ? '1px solid #22c55e' : '1px solid #26262C',
          borderRadius: 12,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          boxShadow: activeClickMode === 'START' ? '0 0 12px rgba(34,197,94,0.15)' : 'none'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#22c55e', display: 'flex', alignItems: 'center', gap: 6 }}>
              🟢 Start Point (School / Depot)
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setActiveClickMode('START')}
                title="Click on map to position Start Point"
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: activeClickMode === 'START' ? '#22c55e' : '#333',
                  background: activeClickMode === 'START' ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)',
                  color: activeClickMode === 'START' ? '#22c55e' : '#A6A6B2',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3
                }}
              >
                <MapPin size={11} /> Pick Map
              </button>
              <button
                type="button"
                onClick={handleGpsStart}
                title="Use current device GPS coordinates"
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid #333',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#A6A6B2',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3
                }}
              >
                <Crosshair size={11} /> GPS
              </button>
            </div>
          </div>

          <input
            type="text"
            placeholder="Start location name (e.g. SJK Taman Maju)"
            value={startPointName}
            onChange={e => onStartChange(e.target.value, startCoords)}
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: '0.82rem',
              background: '#0E0E11',
              border: '1px solid #26262C',
              borderRadius: 6,
              color: '#FFF'
            }}
          />

          {/* Explicit Latitude & Longitude Inputs for Start Point */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: '0.68rem', color: '#8E8E9A', display: 'block', marginBottom: 2 }}>Latitude</label>
              <input
                type="number"
                step="any"
                placeholder="3.139000"
                value={startLatInput}
                onChange={e => handleStartLatChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  background: '#0E0E11',
                  border: '1px solid #26262C',
                  borderRadius: 6,
                  color: '#22c55e'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', color: '#8E8E9A', display: 'block', marginBottom: 2 }}>Longitude</label>
              <input
                type="number"
                step="any"
                placeholder="101.686900"
                value={startLngInput}
                onChange={e => handleStartLngChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  background: '#0E0E11',
                  border: '1px solid #26262C',
                  borderRadius: 6,
                  color: '#22c55e'
                }}
              />
            </div>
          </div>
        </div>

        {/* 🔴 End Point Card */}
        <div style={{
          background: '#141417',
          border: activeClickMode === 'END' ? '1px solid #ef4444' : '1px solid #26262C',
          borderRadius: 12,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          boxShadow: activeClickMode === 'END' ? '0 0 12px rgba(239,68,68,0.15)' : 'none'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
              🔴 End Point (Destination Terminal)
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={() => setActiveClickMode('END')}
                title="Click on map to position End Point"
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: activeClickMode === 'END' ? '#ef4444' : '#333',
                  background: activeClickMode === 'END' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.04)',
                  color: activeClickMode === 'END' ? '#ef4444' : '#A6A6B2',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3
                }}
              >
                <MapPin size={11} /> Pick Map
              </button>
              <button
                type="button"
                onClick={handleGpsEnd}
                title="Use current device GPS coordinates"
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid #333',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#A6A6B2',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3
                }}
              >
                <Crosshair size={11} /> GPS
              </button>
            </div>
          </div>

          <input
            type="text"
            placeholder="End location name (e.g. Taman Sentosa)"
            value={endPointName}
            onChange={e => onEndChange(e.target.value, endCoords)}
            style={{
              width: '100%',
              padding: '6px 10px',
              fontSize: '0.82rem',
              background: '#0E0E11',
              border: '1px solid #26262C',
              borderRadius: 6,
              color: '#FFF'
            }}
          />

          {/* Explicit Latitude & Longitude Inputs for End Point */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <label style={{ fontSize: '0.68rem', color: '#8E8E9A', display: 'block', marginBottom: 2 }}>Latitude</label>
              <input
                type="number"
                step="any"
                placeholder="3.089000"
                value={endLatInput}
                onChange={e => handleEndLatChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  background: '#0E0E11',
                  border: '1px solid #26262C',
                  borderRadius: 6,
                  color: '#ef4444'
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.68rem', color: '#8E8E9A', display: 'block', marginBottom: 2 }}>Longitude</label>
              <input
                type="number"
                step="any"
                placeholder="101.698000"
                value={endLngInput}
                onChange={e => handleEndLngChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace',
                  background: '#0E0E11',
                  border: '1px solid #26262C',
                  borderRadius: 6,
                  color: '#ef4444'
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Action Toolbar: Auto Connect Path & Live Route Stats */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
        background: '#1C1C21',
        padding: '8px 12px',
        borderRadius: 10,
        border: '1px solid #26262C'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', color: '#A6A6B2', fontWeight: 600 }}>Map click sets:</span>
          <button
            type="button"
            onClick={() => setActiveClickMode('START')}
            style={{
              padding: '4px 10px',
              borderRadius: 9999,
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: activeClickMode === 'START' ? '#22c55e' : '#333',
              background: activeClickMode === 'START' ? 'rgba(34,197,94,0.2)' : 'transparent',
              color: activeClickMode === 'START' ? '#22c55e' : '#A6A6B2',
            }}
          >
            🟢 Start
          </button>
          <button
            type="button"
            onClick={() => setActiveClickMode('END')}
            style={{
              padding: '4px 10px',
              borderRadius: 9999,
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: activeClickMode === 'END' ? '#ef4444' : '#333',
              background: activeClickMode === 'END' ? 'rgba(239,68,68,0.2)' : 'transparent',
              color: activeClickMode === 'END' ? '#ef4444' : '#A6A6B2',
            }}
          >
            🔴 End
          </button>
          <button
            type="button"
            onClick={() => setActiveClickMode('STOP')}
            style={{
              padding: '4px 10px',
              borderRadius: 9999,
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: '1px solid',
              borderColor: activeClickMode === 'STOP' ? '#FFD60A' : '#333',
              background: activeClickMode === 'STOP' ? 'rgba(255,214,10,0.2)' : 'transparent',
              color: activeClickMode === 'STOP' ? '#FFD60A' : '#A6A6B2',
            }}
          >
            🟡 Add Stop ({stops.length})
          </button>
        </div>

        {/* ✨ Auto-Connect Path & Suggest Stops Button */}
        <button
          type="button"
          onClick={handleAutoConnectAndSuggest}
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(255,214,10,0.25), rgba(255,214,10,0.12))',
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
          <Sparkles size={14} /> Auto Connect Path & Suggest Stops
        </button>
      </div>

      {/* 4. Interactive Map Container with Floating Distance Badge */}
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid #26262C' }}>
        <div ref={mapContainerRef} style={{ height: 260, width: '100%', background: '#08080A' }} />

        {/* Distance & Time Floating Overlay */}
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 400,
          background: 'rgba(8, 8, 10, 0.88)',
          backdropFilter: 'blur(8px)',
          border: '1px solid #26262C',
          borderRadius: 8,
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          fontSize: '0.75rem',
          color: '#FFF'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <RouteIcon size={12} color="#FFD60A" /> <strong>{totalDistanceKm} km</strong>
          </span>
          <span style={{ color: '#8E8E9A' }}>•</span>
          <span>~{estimatedDriveMins} mins</span>
          <span style={{ color: '#8E8E9A' }}>•</span>
          <span>{stops.length} intermediate stops</span>
        </div>
      </div>

      {/* 5. Intermediate Stops List: Each with Name, Latitude, and Longitude Inputs */}
      <div style={{ background: '#141417', border: '1px solid #26262C', borderRadius: 12, padding: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#FFF' }}>
            🚏 Intermediate Stops Along Corridor ({stops.length})
          </span>
          <span style={{ fontSize: '0.7rem', color: '#8E8E9A' }}>
            {stops.length === 0 ? 'Optional: Can create route with Start & End only' : 'Edit coordinates or drag pins on map'}
          </span>
        </div>

        {stops.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
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
                {/* Badge Number */}
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: '#FFD60A',
                  color: '#08080A',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  flexShrink: 0
                }}>
                  {idx + 1}
                </div>

                {/* Stop Name Input */}
                <input
                  type="text"
                  placeholder={`Stop ${idx + 1} name`}
                  value={stop.name}
                  onChange={e => {
                    const updated = [...stops]
                    updated[idx] = { ...updated[idx], name: e.target.value }
                    onStopsChange(updated)
                  }}
                  style={{
                    flex: 1.2,
                    background: '#0E0E11',
                    border: '1px solid #26262C',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontSize: '0.8rem',
                    color: '#FFF'
                  }}
                />

                {/* Stop Latitude Input */}
                <input
                  type="number"
                  step="any"
                  placeholder="Lat"
                  value={stop.lat}
                  onChange={e => {
                    const updated = [...stops]
                    const val = parseFloat(e.target.value)
                    updated[idx] = { ...updated[idx], lat: isNaN(val) ? 0 : val }
                    onStopsChange(updated)
                  }}
                  style={{
                    width: 90,
                    background: '#0E0E11',
                    border: '1px solid #26262C',
                    borderRadius: 6,
                    padding: '4px 6px',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    color: '#FFD60A'
                  }}
                />

                {/* Stop Longitude Input */}
                <input
                  type="number"
                  step="any"
                  placeholder="Lng"
                  value={stop.lng}
                  onChange={e => {
                    const updated = [...stops]
                    const val = parseFloat(e.target.value)
                    updated[idx] = { ...updated[idx], lng: isNaN(val) ? 0 : val }
                    onStopsChange(updated)
                  }}
                  style={{
                    width: 95,
                    background: '#0E0E11',
                    border: '1px solid #26262C',
                    borderRadius: 6,
                    padding: '4px 6px',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    color: '#FFD60A'
                  }}
                />

                {/* Delete Stop Button */}
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
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{
            textAlign: 'center',
            padding: '12px 8px',
            color: '#8E8E9A',
            fontSize: '0.78rem',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 8
          }}>
            No intermediate stops added yet. Click <strong>Auto Connect Path & Suggest Stops</strong> to auto-generate them, or enter a stop below.
          </div>
        )}

        {/* Add Stop Manual Input Row */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="New stop name..."
            value={newStopName}
            onChange={e => setNewStopName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddManualStop() } }}
            style={{
              flex: 1.2,
              minWidth: 120,
              background: '#0E0E11',
              border: '1px solid #26262C',
              borderRadius: 6,
              padding: '5px 8px',
              fontSize: '0.78rem',
              color: '#FFF'
            }}
          />
          <input
            type="number"
            step="any"
            placeholder="Latitude (optional)"
            value={newStopLatInput}
            onChange={e => setNewStopLatInput(e.target.value)}
            style={{
              width: 105,
              background: '#0E0E11',
              border: '1px solid #26262C',
              borderRadius: 6,
              padding: '5px 8px',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              color: '#FFD60A'
            }}
          />
          <input
            type="number"
            step="any"
            placeholder="Longitude (optional)"
            value={newStopLngInput}
            onChange={e => setNewStopLngInput(e.target.value)}
            style={{
              width: 105,
              background: '#0E0E11',
              border: '1px solid #26262C',
              borderRadius: 6,
              padding: '5px 8px',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              color: '#FFD60A'
            }}
          />
          <button
            type="button"
            onClick={handleAddManualStop}
            style={{
              padding: '5px 12px',
              borderRadius: 6,
              background: 'rgba(255,214,10,0.15)',
              border: '1px solid rgba(255,214,10,0.35)',
              color: '#FFD60A',
              fontWeight: 700,
              fontSize: '0.75rem',
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
