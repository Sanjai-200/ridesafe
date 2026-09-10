'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { MapPin, Navigation, Map as MapIcon, Check, X, Loader2 } from 'lucide-react'

export interface LatLng {
  lat: number
  lng: number
}

interface GeoLocationPickerProps {
  value?: LatLng | null
  onChange: (coords: LatLng | null) => void
  label?: string
  markerColor?: string
  height?: number
}

const MapPicker = dynamic(() => import('@/components/shared/MapPicker'), {
  ssr: false,
  loading: () => (
    <div style={{
      height: 240,
      background: 'rgba(255,255,255,0.03)',
      borderRadius: 10,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--text-muted, #A6A6B2)',
      fontSize: 13,
      border: '1px solid var(--surface-border, #26262C)'
    }}>
      Loading interactive map…
    </div>
  )
})

export default function GeoLocationPicker({
  value,
  onChange,
  label = 'Geographic Coordinates',
  markerColor = '#FFD60A',
  height = 240,
}: GeoLocationPickerProps) {
  const [latInput, setLatInput] = useState<string>(value?.lat != null ? String(value.lat) : '')
  const [lngInput, setLngInput] = useState<string>(value?.lng != null ? String(value.lng) : '')
  const [showMap, setShowMap] = useState(false)
  const [fetchingGps, setFetchingGps] = useState(false)
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'info' | 'error' | 'success' } | null>(null)

  // Keep local string inputs in sync when value changes from outside (e.g. map click or reset)
  useEffect(() => {
    if (value && value.lat != null && value.lng != null) {
      setLatInput(String(value.lat))
      setLngInput(String(value.lng))
    } else if (!value) {
      setLatInput('')
      setLngInput('')
    }
  }, [value])

  const flashMsg = (text: string, type: 'info' | 'error' | 'success' = 'info') => {
    setStatusMsg({ text, type })
    setTimeout(() => setStatusMsg(null), 3500)
  }

  const handleLatChange = (val: string) => {
    setLatInput(val)
    const latNum = parseFloat(val)
    const lngNum = parseFloat(lngInput)
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      onChange({ lat: latNum, lng: lngNum })
    } else if (val === '' && lngInput === '') {
      onChange(null)
    }
  }

  const handleLngChange = (val: string) => {
    setLngInput(val)
    const latNum = parseFloat(latInput)
    const lngNum = parseFloat(val)
    if (!isNaN(latNum) && !isNaN(lngNum)) {
      onChange({ lat: latNum, lng: lngNum })
    } else if (latInput === '' && val === '') {
      onChange(null)
    }
  }

  const handleFetchLiveGps = () => {
    if (!('geolocation' in navigator)) {
      flashMsg('Geolocation is not supported by your browser', 'error')
      return
    }

    setFetchingGps(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = parseFloat(pos.coords.latitude.toFixed(6))
        const lng = parseFloat(pos.coords.longitude.toFixed(6))
        setLatInput(String(lat))
        setLngInput(String(lng))
        onChange({ lat, lng })
        setFetchingGps(false)
        flashMsg(`📍 Live GPS Locked: [${lat}, ${lng}]`, 'success')
      },
      (err) => {
        console.warn('Geolocation error:', err)
        setFetchingGps(false)
        flashMsg(err.message || 'Unable to retrieve live GPS location', 'error')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  }

  const handleClear = () => {
    setLatInput('')
    setLngInput('')
    onChange(null)
    setShowMap(false)
  }

  const hasCoords = value?.lat != null && value?.lng != null

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--surface-border, #26262C)',
      borderRadius: 12,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }}>
      {/* Header Label + Status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{
          fontSize: '0.82rem',
          fontWeight: 700,
          color: '#FFF',
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}>
          <MapPin size={14} style={{ color: markerColor }} />
          <span>{label}</span>
        </div>
        {hasCoords && (
          <span style={{ fontSize: '0.72rem', color: 'var(--success, #22c55e)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Check size={12} /> Set
          </span>
        )}
      </div>

      {/* Dual Text Inputs for Latitude and Longitude */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted, #A6A6B2)', marginBottom: 4, fontWeight: 600 }}>
            Latitude (e.g. 3.13900)
          </label>
          <input
            type="number"
            step="any"
            placeholder="3.1390"
            value={latInput}
            onChange={e => handleLatChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              background: '#0E0E11',
              border: '1px solid #26262C',
              color: '#FFF',
              fontSize: '0.82rem',
              outline: 'none',
              fontFamily: 'monospace'
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted, #A6A6B2)', marginBottom: 4, fontWeight: 600 }}>
            Longitude (e.g. 101.68690)
          </label>
          <input
            type="number"
            step="any"
            placeholder="101.6869"
            value={lngInput}
            onChange={e => handleLngChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 8,
              background: '#0E0E11',
              border: '1px solid #26262C',
              color: '#FFF',
              fontSize: '0.82rem',
              outline: 'none',
              fontFamily: 'monospace'
            }}
          />
        </div>
      </div>

      {/* Alternative Point Selection Actions: Live GPS & Map Picker */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={handleFetchLiveGps}
          disabled={fetchingGps}
          style={{
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.35)',
            color: '#60A5FA',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: '0.78rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.2s'
          }}
          title="Pick coordinates using device live GPS sensor"
        >
          {fetchingGps ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />}
          {fetchingGps ? 'Locating…' : '📍 Live GPS Picker'}
        </button>

        <button
          type="button"
          onClick={() => setShowMap(m => !m)}
          style={{
            background: showMap ? 'rgba(255, 214, 10, 0.2)' : 'rgba(255, 255, 255, 0.05)',
            border: `1px solid ${showMap ? 'var(--bus-yellow, #FFD60A)' : 'var(--surface-border, #26262C)'}`,
            color: showMap ? 'var(--bus-yellow, #FFD60A)' : 'var(--text-main, #FFF)',
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            transition: 'all 0.2s'
          }}
          title="Pick coordinates by pinning location on Leaflet map"
        >
          <MapIcon size={13} />
          {showMap ? 'Hide Map Picker' : (hasCoords ? '🗺️ Change Pin on Map' : '🗺️ Pick on Map')}
        </button>

        {hasCoords && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 69, 58, 0.3)',
              color: 'var(--danger, #FF453A)',
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: '0.75rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              marginLeft: 'auto'
            }}
            title="Clear coordinates"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Temporary feedback banner */}
      {statusMsg && (
        <div style={{
          fontSize: '0.75rem',
          padding: '4px 8px',
          borderRadius: 6,
          background: statusMsg.type === 'error' ? 'rgba(239,68,68,0.15)' : statusMsg.type === 'success' ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.15)',
          color: statusMsg.type === 'error' ? '#EF4444' : statusMsg.type === 'success' ? '#22C55E' : '#60A5FA',
          border: `1px solid ${statusMsg.type === 'error' ? 'rgba(239,68,68,0.3)' : statusMsg.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(59,130,246,0.3)'}`
        }}>
          {statusMsg.text}
        </div>
      )}

      {/* Interactive Map */}
      {showMap && (
        <div style={{ marginTop: 4 }}>
          <MapPicker
            value={value}
            height={height}
            markerColor={markerColor}
            label="Click on map to pin coordinates"
            onChange={(coords) => {
              const lat = parseFloat(coords.lat.toFixed(6))
              const lng = parseFloat(coords.lng.toFixed(6))
              setLatInput(String(lat))
              setLngInput(String(lng))
              onChange({ lat, lng })
            }}
          />
        </div>
      )}
    </div>
  )
}
