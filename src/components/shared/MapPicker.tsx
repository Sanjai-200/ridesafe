'use client'
import { useEffect, useRef, useState } from 'react'
import { MapPin } from 'lucide-react'

export interface LatLng {
  lat: number
  lng: number
}

interface MapPickerProps {
  value?: LatLng | null
  onChange: (coords: LatLng) => void
  label?: string
  height?: number
  defaultCenter?: LatLng
  markerColor?: string
}

const DEFAULT_CENTER: LatLng = { lat: 3.1390, lng: 101.6869 } // Kuala Lumpur

/**
 * MapPicker — click-to-pin coordinate selector using Leaflet.
 * SSR-safe: Leaflet is loaded dynamically because it needs `window`.
 */
export default function MapPicker({
  value,
  onChange,
  label = 'Click map to pin location',
  height = 280,
  defaultCenter = DEFAULT_CENTER,
  markerColor = '#FFD60A',
}: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<unknown>(null)
  const markerRef = useRef<unknown>(null)
  const [ready, setReady] = useState(false)
  const [coords, setCoords] = useState<LatLng | null>(value ?? null)

  // Sync external value changes
  useEffect(() => {
    if (value) setCoords(value)
  }, [value])

  useEffect(() => {
    if (typeof window === 'undefined' || !mapRef.current) return

    // Dynamically import leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      // Fix default icon paths (Next.js breaks the default leaflet icons)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      // Prevent double-init
      if (leafletMapRef.current) return

      const center: [number, number] = coords
        ? [coords.lat, coords.lng]
        : [defaultCenter.lat, defaultCenter.lng]

      const map = L.map(mapRef.current!, { zoomControl: true, scrollWheelZoom: true }).setView(center, 14)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(map)

      const customIcon = L.divIcon({
        html: `<div style="
          width: 28px; height: 28px;
          background: ${markerColor};
          border: 3px solid white;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        className: '',
      })

      let marker: ReturnType<typeof L.marker> | null = null

      if (coords) {
        marker = L.marker([coords.lat, coords.lng], { icon: customIcon }).addTo(map)
        markerRef.current = marker
      }

      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        const { lat, lng } = e.latlng
        const newCoords = { lat, lng }
        setCoords(newCoords)
        onChange(newCoords)

        if (marker) {
          marker.setLatLng([lat, lng])
        } else {
          marker = L.marker([lat, lng], { icon: customIcon }).addTo(map)
          markerRef.current = marker
        }
      })

      leafletMapRef.current = map
      setReady(true)
    })

    return () => {
      if (leafletMapRef.current) {
        (leafletMapRef.current as { remove: () => void }).remove()
        leafletMapRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {label && (
        <div style={{
          fontSize: '0.8rem', color: 'var(--text-muted)',
          display: 'flex', alignItems: 'center', gap: 6
        }}>
          <MapPin size={13} style={{ color: markerColor }} />
          {label}
        </div>
      )}

      {/* Leaflet CSS — injected once */}
      <style>{`
        @import url('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        .leaflet-container { border-radius: 10px; }
        .leaflet-control-attribution { font-size: 10px; }
      `}</style>

      <div
        ref={mapRef}
        style={{
          height,
          width: '100%',
          borderRadius: '10px',
          border: '1px solid var(--surface-border)',
          overflow: 'hidden',
          position: 'relative',
          background: 'rgba(255,255,255,0.03)',
          cursor: 'crosshair',
        }}
      />

      {coords ? (
        <div style={{
          fontSize: '0.78rem', color: 'var(--text-muted)',
          display: 'flex', gap: 12, background: 'rgba(255,255,255,0.05)',
          borderRadius: 6, padding: '4px 10px',
        }}>
          <span>📍 Lat: <strong style={{ color: 'var(--text-primary)' }}>{coords.lat.toFixed(6)}</strong></span>
          <span>Lng: <strong style={{ color: 'var(--text-primary)' }}>{coords.lng.toFixed(6)}</strong></span>
        </div>
      ) : (
        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>
          No location selected yet
        </div>
      )}
    </div>
  )
}
