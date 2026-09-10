'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { 
  Bus, Navigation, Timer, GraduationCap, MapPin, AlertTriangle, 
  ShieldAlert, CheckCircle, RefreshCw, Sparkles, ClipboardCheck, Users, 
  Calendar, Bell, User, Phone, Shield, Clock, Search, Check, X,
  Radio, AlertCircle, Wrench
} from 'lucide-react'

import { useAudio } from '@/hooks/useAudio'
import CameraCapture from '@/components/driver/CameraCapture'
import { useTranslation, LanguageSwitcher } from '@/i18n/provider'

// ── Shared types ─────────────────────────────────────────────────────────────
interface ShiftRecord { 
  id: string
  date: string
  startTime: string
  endTime: string
  status: string 
}

interface TripRecord { 
  id: string
  routeName: string
  date: string
  pickedUp: number
  droppedOff: number
  absent: number
  avgRating?: string | null 
}

interface StopStudent { 
  id: string
  name: string
  grade: string
  type: 'PICKUP' | 'DROPOFF'
  photoUrl?: string | null
  parentContact1?: string | null
  isSelfPickup?: boolean
}

interface AttendanceRecord { 
  studentId: string
  action: string
  temp?: boolean
  parentConfirmedPickup?: boolean
  parentConfirmedDropoff?: boolean 
}

interface Stop { 
  id: string
  name: string
  latitude?: number | null
  longitude?: number | null
  order?: number
  pickupStudents: StopStudent[]
  dropoffStudents: StopStudent[]
  attendances: AttendanceRecord[] 
}

interface AnnouncementItem {
  id: string
  title: string
  body: string
  type: string
  targetRole: string
  createdAt: string
  senderName?: string
  senderRole?: string
}

function useTripTimer(startedAt: Date | null) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!startedAt) return
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  const m = Math.floor(elapsed / 60), s = elapsed % 60
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export default function DriverDashboard() {
  const { t } = useTranslation()
  const router = useRouter()

  // Primary data state
  const [data, setData] = useState<{
    activeTrip?: { id: string; date: string; route: { stops: Stop[] } }
    assignedRoute?: { 
      id: string
      name: string
      morningTime?: string
      afternoonTime?: string
      stops?: Stop[]
      students?: StopStudent[] 
    }
    busId?: string
    busPlate?: string
    driverId?: string
  } | null>(null)

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'DRIVE' | 'ROUTE' | 'MANIFEST' | 'INSPECTION' | 'SHIFTS' | 'ANNOUNCEMENTS' | 'PROFILE'>('DRIVE')
  const [currentStopIndex, setCurrentStopIndex] = useState(0)
  const [offlineQueue, setOfflineQueue] = useState(0)
  const [tripStartedAt, setTripStartedAt] = useState<Date | null>(null)
  const [toast, setToast] = useState('')
  const [toastType, setToastType] = useState<'success' | 'error'>('success')

  // Camera capture modal
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraTarget, setCameraTarget] = useState<string>('')
  const [capturedPhotos, setCapturedPhotos] = useState<Record<string, string>>({})

  // Delay reporting state
  const [showDelayPanel, setShowDelayPanel] = useState(false)
  const [delayMinutes, setDelayMinutes] = useState(15)
  const [delayReason, setDelayReason] = useState('Heavy Traffic')
  const [sendingDelay, setSendingDelay] = useState(false)
  const [claimingRoute, setClaimingRoute] = useState(false)

  // Session (MORNING / AFTERNOON)
  const [tripSession, setTripSession] = useState<'MORNING' | 'AFTERNOON'>('MORNING')

  // Daily status board: parent-reported status per student { studentId: { status, name } }
  const [dailyStatusBoard, setDailyStatusBoard] = useState<Record<string, { status: string; name: string }>>({})

  // Announcements broadcast feed
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([])

  // Shifts & Trip history
  const [shifts, setShifts] = useState<ShiftRecord[]>([])
  const [trips, setTrips] = useState<TripRecord[]>([])

  // Manifest search filter
  const [manifestQuery, setManifestQuery] = useState('')

  // Pre-Trip Inspection Checklist
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    brakes: true,
    tires: true,
    emergencyExits: true,
    lightsAndSignals: true,
    wipers: true,
    firstAidAndExtinguisher: true,
    fuelOrBattery: true,
  })
  const [inspectionSubmitted, setInspectionSubmitted] = useState(false)

  // Driver User info
  const [me, setMe] = useState<{ id: string; name: string; email: string; phone?: string } | null>(null)

  const prevTripId = useRef<string | null>(null)
  const tripTimer = useTripTimer(tripStartedAt)

  // Audio Hooks
  const { play: playAlert } = useAudio('/alert toon.mp3')
  const { play: playHorn } = useAudio('/bus-horn.mp3')

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => { 
    setToast(msg)
    setToastType(type)
    setTimeout(() => setToast(''), 3500) 
  }

  const fetchStatus = useCallback(async () => {
    try {
      const [statusRes, meRes, annRes, shiftsRes, tripsRes] = await Promise.all([
        fetch('/api/driver/status'),
        fetch('/api/auth/me').catch(() => null),
        fetch('/api/announcements').catch(() => null),
        fetch('/api/shifts').catch(() => null),
        fetch('/api/trips/history?page=1').catch(() => null),
      ])

      if (statusRes.status === 401) {
        router.push('/')
        return
      }

      const json = await statusRes.json()
      setData(json)

      if (meRes && meRes.ok) {
        const meJson = await meRes.json()
        if (meJson.user) setMe(meJson.user)
      }

      if (annRes && annRes.ok) {
        const annJson = await annRes.json()
        setAnnouncements(annJson.announcements || [])
      }

      if (shiftsRes && shiftsRes.ok) {
        const shiftsJson = await shiftsRes.json()
        setShifts(shiftsJson.shifts || [])
      }

      if (tripsRes && tripsRes.ok) {
        const tripsJson = await tripsRes.json()
        setTrips(tripsJson.trips || [])
      }

      // Set trip timer
      if (json.activeTrip && !tripStartedAt) {
        setTripStartedAt(new Date(json.activeTrip.date))
      } else if (!json.activeTrip) {
        setTripStartedAt(null)
      }

      // Load today's parent daily status board
      if (json.assignedRoute?.id) {
        fetch(`/api/driver/daily-status?routeId=${json.assignedRoute.id}`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.statuses) setDailyStatusBoard(d.statuses) })
          .catch(() => {})
      }

      // Detect trip start -> play bus horn
      if (json.activeTrip && prevTripId.current !== json.activeTrip.id) {
        if (prevTripId.current !== null) playHorn()
        prevTripId.current = json.activeTrip.id
      }
    } catch (error) { 
      console.error(error) 
    } finally { 
      setLoading(false) 
    }
  }, [router, tripStartedAt, playHorn])

  useEffect(() => {
    fetchStatus()
    // GPS tracking (5 sec interval)
    if ('geolocation' in navigator) {
      const id = setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              await fetch('/api/location', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
              })
            } catch {}
          },
          (err) => console.warn('Geolocation warning:', err.message),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        )
      }, 5000)
      return () => clearInterval(id)
    }
  }, [fetchStatus])

  // Offline queue listener
  useEffect(() => {
    const queue = JSON.parse(localStorage.getItem('offline_attendance_queue') || '[]')
    setOfflineQueue(queue.length)
    const flushQueue = async () => {
      const q = JSON.parse(localStorage.getItem('offline_attendance_queue') || '[]')
      if (q.length === 0) return
      const failed: AttendanceRecord[] = []
      for (const payload of q) {
        try {
          const res = await fetch('/api/attendance', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(payload) 
          })
          if (!res.ok) failed.push(payload)
        } catch { 
          failed.push(payload) 
        }
      }
      localStorage.setItem('offline_attendance_queue', JSON.stringify(failed))
      setOfflineQueue(failed.length)
      if (failed.length === 0) fetchStatus()
    }
    window.addEventListener('online', flushQueue)
    return () => window.removeEventListener('online', flushQueue)
  }, [fetchStatus])

  const handleClaimRoute = async () => {
    setClaimingRoute(true)
    try {
      const res = await fetch('/api/driver/claim-route', { method: 'POST' })
      const json = await res.json()
      if (res.ok) {
        showToast('Bus & Route successfully assigned to your cockpit!', 'success')
        await fetchStatus()
      } else {
        showToast(json.error || 'Failed to assign route', 'error')
      }
    } catch (e: any) {
      showToast(e.message || 'Network error', 'error')
    } finally {
      setClaimingRoute(false)
    }
  }

  const handleStartTrip = async () => {
    if (!data?.assignedRoute) return
    try {
      const res = await fetch('/api/trips', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId: data.assignedRoute.id, busId: data.busId, session: tripSession })
      })
      if (res.ok) { 
        playHorn()
        showToast(`${tripSession === 'MORNING' ? '🌅 Morning' : '🌆 Afternoon'} trip started! Telemetry active.`, 'success')
        fetchStatus() 
      } else {
        const err = await res.json()
        showToast(err.error || 'Failed to start trip', 'error')
      }
    } catch { 
      showToast('Network error starting trip', 'error') 
    }
  }

  const handleCompleteTrip = async () => {
    if (!data?.activeTrip) return
    try {
      const res = await fetch(`/api/trips/${data.activeTrip.id}`, {
        method: 'PATCH', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'TRIP_COMPLETED' })
      })
      if (res.ok) {
        showToast('🎉 Trip completed successfully!', 'success')
        setTimeout(fetchStatus, 800)
      }
    } catch { 
      showToast('Error ending trip', 'error') 
    }
  }

  const recordAttendance = async (studentId: string, action: string) => {
    if (!data?.activeTrip) return
    const stop = data.activeTrip.route.stops[currentStopIndex]
    const payload = { tripId: data.activeTrip.id, studentId, stopId: stop.id, action }

    // Optimistic state update
    const newData = JSON.parse(JSON.stringify(data))
    newData.activeTrip.route.stops[currentStopIndex].attendances.push({ studentId, action, temp: true })
    setData(newData)
    setXp(p => p + (action === 'ABSENT' ? 5 : 20))
    showToast(action === 'ABSENT' ? 'Marked absent' : action === 'PICKED_UP' ? '✓ Student boarded' : '✓ Student dropped off')

    const sync = async () => {
      const res = await fetch('/api/attendance', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(payload) 
      })
      if (res.ok) fetchStatus()
      else throw new Error()
    }

    if (navigator.onLine) {
      try { 
        await sync() 
      } catch {
        const q = JSON.parse(localStorage.getItem('offline_attendance_queue') || '[]')
        q.push(payload)
        localStorage.setItem('offline_attendance_queue', JSON.stringify(q))
        setOfflineQueue(q.length)
      }
    } else {
      const q = JSON.parse(localStorage.getItem('offline_attendance_queue') || '[]')
      q.push(payload)
      localStorage.setItem('offline_attendance_queue', JSON.stringify(q))
      setOfflineQueue(q.length)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '3rem 1.5rem', maxWidth: 1000, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#1C1C21' }} />
          <div style={{ flex: 1, height: 48, borderRadius: 12, background: '#1C1C21' }} />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} style={{ height: 90, marginBottom: 14, borderRadius: 14, background: '#141417', border: '1px solid #26262C' }} />
        ))}
      </div>
    )
  }

  const { activeTrip, assignedRoute } = data || {}

  // Gather all unique students across all stops on the assigned route for Manifest
  const allRouteStudents: (StopStudent & { pickupStopName?: string; dropoffStopName?: string })[] = []
  if (assignedRoute?.stops) {
    const studentMap = new Map<string, StopStudent & { pickupStopName?: string; dropoffStopName?: string }>()
    for (const stop of assignedRoute.stops) {
      for (const ps of stop.pickupStudents || []) {
        if (!studentMap.has(ps.id)) {
          studentMap.set(ps.id, { ...ps, pickupStopName: stop.name })
        } else {
          const s = studentMap.get(ps.id)!
          s.pickupStopName = stop.name
        }
      }
      for (const ds of stop.dropoffStudents || []) {
        if (!studentMap.has(ds.id)) {
          studentMap.set(ds.id, { ...ds, dropoffStopName: stop.name })
        } else {
          const s = studentMap.get(ds.id)!
          s.dropoffStopName = stop.name
        }
      }
    }
    allRouteStudents.push(...Array.from(studentMap.values()))
  }

  // Filtered manifest
  const q = manifestQuery.trim().toLowerCase()
  const filteredStudents = q 
    ? allRouteStudents.filter(s => s.name.toLowerCase().includes(q) || s.grade.toLowerCase().includes(q))
    : allRouteStudents

  // Count students on board
  const onBoard = activeTrip ? activeTrip.route.stops.flatMap((s: Stop) =>
    s.attendances.filter((a: AttendanceRecord) => a.action === 'PICKED_UP')
  ).length : 0

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#08080A', 
      color: '#FFFFFF', 
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
      paddingBottom: '4rem'
    }}>
      {/* Toast Alert */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -20 }}
            style={{ 
              position: 'fixed', top: 20, right: 20, zIndex: 99999, padding: '12px 20px',
              display: 'flex', alignItems: 'center', gap: 10,
              background: toastType === 'error' ? 'rgba(255,69,58,0.2)' : 'rgba(48,209,88,0.2)',
              border: `1px solid ${toastType === 'error' ? '#FF453A' : '#30D158'}`,
              borderRadius: 14, color: '#FFFFFF', fontWeight: 600, fontSize: 14, backdropFilter: 'blur(16px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
            }}
          >
            {toastType === 'error' ? <AlertTriangle size={18} color="#FF453A" /> : <CheckCircle size={18} color="#30D158" />}
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Header */}
      <header style={{
        background: '#141417',
        borderBottom: '1px solid #26262C',
        position: 'sticky', top: 0, zIndex: 100,
        backdropFilter: 'blur(12px)'
      }}>
        <div style={{
          maxWidth: 1180, margin: '0 auto', padding: '14px 20px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: 12,
              background: 'linear-gradient(135deg, #FFD60A, #FF9F0A)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#08080A', boxShadow: '0 0 20px rgba(255,214,10,0.3)', flexShrink: 0
            }}>
              <Bus size={24} strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em', color: '#FFF' }}>RideSafe</span>
                <span style={{
                  background: '#FFD60A', color: '#08080A', fontSize: 10, fontWeight: 800,
                  padding: '2px 8px', borderRadius: 6, textTransform: 'uppercase'
                }}>
                  DRIVER COCKPIT
                </span>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11, color: '#30D158', background: 'rgba(48,209,88,0.12)',
                  padding: '2px 8px', borderRadius: 9999, border: '1px solid rgba(48,209,88,0.3)'
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#30D158', animation: 'pulse 1.5s infinite' }} />
                  GPS Active (5s)
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#A6A6B2', marginTop: 2 }}>
                {assignedRoute ? (
                  <span>Route: <strong style={{ color: '#FFD60A' }}>{assignedRoute.name}</strong> • Bus #{data?.busPlate || data?.busId || 'Fleet'}</span>
                ) : (
                  <span style={{ color: '#FF9F0A' }}>No assigned route</span>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {offlineQueue > 0 && (
              <span style={{
                background: 'rgba(255,159,10,0.15)', color: '#FF9F0A', border: '1px solid rgba(255,159,10,0.3)',
                fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 8
              }}>
                {offlineQueue} offline queue
              </span>
            )}
            <LanguageSwitcher />
            <button
              onClick={() => { fetch('/api/auth/me', { method: 'POST' }).then(() => router.push('/')) }}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid #26262C',
                color: '#A6A6B2', padding: '6px 12px', borderRadius: 8, fontSize: 13, cursor: 'pointer'
              }}
            >
              {t('common.logout')}
            </button>
          </div>
        </div>

        {/* Cockpit Navigation Tabs */}
        <div style={{
          maxWidth: 1180, margin: '0 auto', padding: '0 20px',
          display: 'flex', gap: 6, overflowX: 'auto', borderTop: '1px solid #1C1C21'
        }}>
          {[
            { key: 'DRIVE', label: 'Drive & Trip', icon: <Navigation size={15} /> },
            { key: 'ROUTE', label: 'Route & Stops', icon: <MapPin size={15} /> },
            { key: 'MANIFEST', label: `Student Manifest (${allRouteStudents.length})`, icon: <Users size={15} /> },
            { key: 'INSPECTION', label: 'Pre-Trip Inspection', icon: <ClipboardCheck size={15} /> },
            { key: 'SHIFTS', label: 'Shifts & History', icon: <Calendar size={15} /> },
            { key: 'ANNOUNCEMENTS', label: `Notices (${announcements.length})`, icon: <Bell size={15} /> },
            { key: 'PROFILE', label: 'Driver Profile', icon: <User size={15} /> },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '12px 14px', fontSize: 13, fontWeight: 600,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: activeTab === tab.key ? '#FFD60A' : '#A6A6B2',
                borderBottom: activeTab === tab.key ? '2px solid #FFD60A' : '2px solid transparent',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content Body */}
      <main style={{ maxWidth: 1180, margin: '24px auto', padding: '0 20px' }}>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1: DRIVE & ACTIVE TRIP
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'DRIVE' && (
          <div>
            {/* Auto-assign card if unassigned */}
            {!assignedRoute && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.96 }} 
                animate={{ opacity: 1, scale: 1 }}
                style={{
                  background: 'linear-gradient(180deg, #141417 0%, #0E0E11 100%)',
                  border: '1px solid #26262C', borderRadius: 20,
                  padding: '3rem 2rem', textAlign: 'center', maxWidth: 580, margin: '2rem auto',
                  boxShadow: '0 24px 48px rgba(0,0,0,0.6)'
                }}
              >
                <div style={{
                  width: 76, height: 76, borderRadius: '50%',
                  background: 'rgba(255,214,10,0.12)', border: '1px solid rgba(255,214,10,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1.5rem auto'
                }}>
                  <Bus size={40} color="#FFD60A" />
                </div>
                <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#FFFFFF', marginBottom: '0.6rem' }}>
                  Assign Your Driver Route
                </h2>
                <p style={{ color: '#A6A6B2', fontSize: '0.95rem', maxWidth: 440, margin: '0 auto 1.75rem auto', lineHeight: 1.5 }}>
                  No bus or route is currently assigned to your account. Click below to immediately link to Morning Route A and activate your live GPS telemetry.
                </p>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleClaimRoute}
                    disabled={claimingRoute}
                    style={{
                      padding: '0.9rem 2rem', borderRadius: 9999,
                      background: '#FFD60A', color: '#08080A', fontWeight: 800, fontSize: '1rem',
                      border: 'none', cursor: claimingRoute ? 'not-allowed' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 8
                    }}
                  >
                    <Sparkles size={18} />
                    {claimingRoute ? 'Assigning Fleet Route...' : 'Auto-Assign Bus & Route'}
                  </button>
                  <button
                    onClick={fetchStatus}
                    style={{
                      padding: '0.9rem 1.5rem', borderRadius: 9999,
                      background: 'rgba(255,255,255,0.06)', color: '#FFFFFF', fontWeight: 600, fontSize: '0.95rem',
                      border: '1px solid #26262C', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
                    }}
                  >
                    <RefreshCw size={16} /> Refresh
                  </button>
                </div>
              </motion.div>
            )}

            {/* Pre-Trip Launchpad (When route is assigned but trip is not active) */}
            {assignedRoute && !activeTrip && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
                {/* Trip Starter & Assigned Fleet Card */}
                <div style={{
                  background: '#141417', border: '1px solid #26262C', borderRadius: 16, padding: 24
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: 'rgba(255,214,10,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <Bus size={22} color="#FFD60A" />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#FFF' }}>Pre-Trip Vehicle Readiness</h3>
                      <div style={{ fontSize: 12, color: '#A6A6B2' }}>Assigned bus & active route session</div>
                    </div>
                  </div>

                  <div style={{
                    padding: 14, background: '#1C1C21', borderRadius: 12, border: '1px solid #26262C',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20
                  }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#6E6E7A', textTransform: 'uppercase' }}>Assigned Bus Plate</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#FFD60A', marginTop: 2 }}>
                        {data?.busPlate || 'BUS-001'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#6E6E7A', textTransform: 'uppercase' }}>Vehicle Status</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#30D158', marginTop: 2 }}>
                        ✓ Active & Verified
                      </div>
                    </div>
                  </div>

                  {/* Session Selector */}
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#A6A6B2', marginBottom: 8 }}>
                      SELECT TRIP SESSION:
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      {(['MORNING', 'AFTERNOON'] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => setTripSession(s)}
                          style={{
                            padding: '12px 10px', borderRadius: 10,
                            border: `2px solid ${tripSession === s ? '#FFD60A' : '#26262C'}`,
                            background: tripSession === s ? 'rgba(255,214,10,0.12)' : '#1C1C21',
                            color: tripSession === s ? '#FFD60A' : '#A6A6B2',
                            fontWeight: 700, fontSize: 13, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                          }}
                        >
                          {s === 'MORNING' ? '🌅 Morning' : '🌆 Afternoon'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Start Trip Action */}
                  <button
                    onClick={handleStartTrip}
                    style={{
                      width: '100%', padding: '14px', borderRadius: 12,
                      background: '#FFD60A', color: '#08080A', fontWeight: 800, fontSize: 16,
                      border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: 8, boxShadow: '0 8px 24px rgba(255,214,10,0.3)'
                    }}
                  >
                    <Bus size={20} />
                    Start {tripSession === 'MORNING' ? 'Morning Pickup' : 'Afternoon Drop-off'} Trip
                  </button>
                </div>

                {/* Route Overview & Stop List Card */}
                <div style={{
                  background: '#141417', border: '1px solid #26262C', borderRadius: 16, padding: 24
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#FFF' }}>
                      Route Itinerary ({assignedRoute.stops?.length || 0} Stops)
                    </h3>
                    <span style={{ fontSize: 12, color: '#30D158', fontWeight: 600 }}>
                      {allRouteStudents.length} Students Assigned
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto' }}>
                    {(assignedRoute.stops || []).map((stop, idx) => (
                      <div
                        key={stop.id}
                        style={{
                          padding: '12px 14px', background: '#1C1C21', borderRadius: 10,
                          border: '1px solid #26262C', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{
                            width: 28, height: 28, borderRadius: '50%',
                            background: '#26262C', color: '#FFD60A', fontWeight: 700, fontSize: 13,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                          }}>
                            {idx + 1}
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#FFF' }}>{stop.name}</div>
                            <div style={{ fontSize: 11, color: '#6E6E7A', marginTop: 2 }}>
                              {(stop.pickupStudents?.length || 0)} pickups • {(stop.dropoffStudents?.length || 0)} dropoffs
                            </div>
                          </div>
                        </div>
                        <span style={{ fontSize: 11, color: '#A6A6B2', background: '#0E0E11', padding: '3px 8px', borderRadius: 6 }}>
                          Seq #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Active Driving Trip Screen */}
            {activeTrip && (() => {
              const stops = activeTrip.route.stops
              const stop = stops[currentStopIndex]
              if (!stop) return null
              const isLastStop = currentStopIndex === stops.length - 1

              const getStatus = (studentId: string) => {
                const att = stop.attendances.find((a: AttendanceRecord) => a.studentId === studentId)
                return att ? att.action : null
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Trip Summary Telemetry Strip */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12
                  }}>
                    <div style={{ background: '#141417', border: '1px solid #26262C', borderRadius: 14, padding: 16, textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', color: '#0A84FF', marginBottom: 4 }}><Timer size={22} /></div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#FFF' }}>{tripTimer}</div>
                      <div style={{ fontSize: 11, color: '#A6A6B2' }}>Trip Elapsed Time</div>
                    </div>
                    <div style={{ background: '#141417', border: '1px solid #26262C', borderRadius: 14, padding: 16, textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', color: '#30D158', marginBottom: 4 }}><GraduationCap size={22} /></div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#30D158' }}>{onBoard}</div>
                      <div style={{ fontSize: 11, color: '#A6A6B2' }}>Students on Board</div>
                    </div>
                    <div style={{ background: '#141417', border: '1px solid #26262C', borderRadius: 14, padding: 16, textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', color: '#FFD60A', marginBottom: 4 }}><MapPin size={22} /></div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#FFD60A' }}>{currentStopIndex + 1} / {stops.length}</div>
                      <div style={{ fontSize: 11, color: '#A6A6B2' }}>Current Stop Progress</div>
                    </div>
                  </div>

                  {/* Stop Progress Stepper */}
                  <div style={{
                    background: '#141417', border: '1px solid #26262C', borderRadius: 16, padding: '16px 20px',
                    overflowX: 'auto'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', minWidth: stops.length * 80 }}>
                      {stops.map((s, i) => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < stops.length - 1 ? 1 : 'auto' }}>
                          <div 
                            style={{ 
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 70, 
                              cursor: i <= currentStopIndex ? 'pointer' : 'default' 
                            }}
                            onClick={() => i <= currentStopIndex && setCurrentStopIndex(i)}
                          >
                            <div style={{
                              width: 32, height: 32, borderRadius: '50%',
                              background: i < currentStopIndex ? '#30D158' : i === currentStopIndex ? '#FFD60A' : '#26262C',
                              color: i < currentStopIndex || i === currentStopIndex ? '#08080A' : '#6E6E7A',
                              fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center',
                              boxShadow: i === currentStopIndex ? '0 0 16px rgba(255,214,10,0.5)' : 'none'
                            }}>
                              {i < currentStopIndex ? '✓' : i + 1}
                            </div>
                            <div style={{
                              fontSize: 11, fontWeight: i === currentStopIndex ? 700 : 500,
                              color: i === currentStopIndex ? '#FFD60A' : '#A6A6B2',
                              textAlign: 'center', maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>
                              {s.name}
                            </div>
                          </div>
                          {i < stops.length - 1 && (
                            <div style={{
                              flex: 1, height: 2, margin: '0 6px', marginBottom: 20,
                              background: i < currentStopIndex ? '#30D158' : '#26262C', borderRadius: 999
                            }} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Current Active Stop & Student Attendance Card */}
                  <div style={{
                    background: '#141417', border: '1px solid #26262C', borderRadius: 16, padding: 24
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <div style={{ color: '#FFD60A', fontWeight: 800, fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                          STOP {currentStopIndex + 1} OF {stops.length}
                        </div>
                        <h2 style={{ margin: '4px 0 0 0', fontSize: 22, fontWeight: 800, color: '#FFF' }}>
                          {stop.name}
                        </h2>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        {isLastStop ? (
                          <button
                            onClick={handleCompleteTrip}
                            style={{
                              background: '#FFD60A', color: '#08080A', border: 'none',
                              padding: '10px 24px', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer'
                            }}
                          >
                            ✓ End Trip & Sign Off
                          </button>
                        ) : (
                          <button
                            onClick={() => setCurrentStopIndex(c => c + 1)}
                            style={{
                              background: '#26262C', color: '#FFF', border: '1px solid #3A3A43',
                              padding: '10px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer'
                            }}
                          >
                            Next Stop →
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Students at this stop */}
                    {stop.pickupStudents.length === 0 && stop.dropoffStudents.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '32px 0', color: '#6E6E7A', fontSize: 14 }}>
                        No student pickups or drop-offs scheduled at this stop.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
                        {[
                          ...stop.pickupStudents.map(s => ({ ...s, type: 'PICKUP' as const })),
                          ...stop.dropoffStudents.map(s => ({ ...s, type: 'DROPOFF' as const }))
                        ].map(student => {
                          const status = getStatus(student.id)
                          // Parent reported daily status (Boarding vs Absent)
                          const pDaily = dailyStatusBoard[student.id]?.status

                          return (
                            <div
                              key={student.id + student.type}
                              style={{
                                background: '#1C1C21', border: '1px solid #26262C',
                                borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  {capturedPhotos[student.id] ? (
                                    <Image src={capturedPhotos[student.id]} alt="" width={42} height={42} style={{ borderRadius: '50%', objectFit: 'cover', border: '2px solid #30D158' }} />
                                  ) : (
                                    <div style={{
                                      width: 42, height: 42, borderRadius: '50%',
                                      background: student.type === 'PICKUP' ? 'rgba(48,209,88,0.15)' : 'rgba(10,132,255,0.15)',
                                      color: student.type === 'PICKUP' ? '#30D158' : '#0A84FF',
                                      fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                      {student.name.charAt(0)}
                                    </div>
                                  )}
                                  <div>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#FFF' }}>{student.name}</div>
                                    <div style={{ fontSize: 12, color: '#A6A6B2', marginTop: 1 }}>
                                      {student.grade} • {student.type === 'PICKUP' ? '🟢 Pickup' : '🔴 Drop-off'}
                                    </div>
                                  </div>
                                </div>

                                <button
                                  onClick={() => { setCameraTarget(student.id); setCameraOpen(true); }}
                                  title="Verify face/photo"
                                  style={{ background: 'transparent', border: 'none', color: '#A6A6B2', cursor: 'pointer', padding: 6 }}
                                >
                                  <ScanFace size={20} />
                                </button>
                              </div>

                              {/* Parent-Reported Daily Status Badge */}
                              {pDaily && (
                                <div style={{
                                  padding: '6px 10px', borderRadius: 8,
                                  background: pDaily === 'ABSENT_TODAY' ? 'rgba(255,69,58,0.15)' : 'rgba(48,209,88,0.15)',
                                  border: `1px solid ${pDaily === 'ABSENT_TODAY' ? '#FF453A' : '#30D158'}`,
                                  color: pDaily === 'ABSENT_TODAY' ? '#FF453A' : '#30D158',
                                  fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6
                                }}>
                                  {pDaily === 'ABSENT_TODAY' ? (
                                    <><span>🚫</span> Parent Reported: Absent Today (Skip Stop)</>
                                  ) : (
                                    <><span>✓</span> Parent Declared: Boarding Today</>
                                  )}
                                </div>
                              )}

                              {/* Attendance Action or Recorded Status */}
                              {status ? (
                                <div style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '8px 12px', background: '#0E0E11', borderRadius: 8
                                }}>
                                  <span style={{
                                    fontSize: 12, fontWeight: 700,
                                    color: status === 'ABSENT' ? '#FF453A' : status === 'PICKED_UP' ? '#30D158' : '#0A84FF'
                                  }}>
                                    {status === 'PICKED_UP' ? '✓ Boarded on Bus' : status === 'DROPPED_OFF' ? '✓ Dropped Off' : '✕ Absent'}
                                  </span>
                                  <span style={{ fontSize: 11, color: '#6E6E7A' }}>Recorded</span>
                                </div>
                              ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                  <button
                                    onClick={() => recordAttendance(student.id, 'ABSENT')}
                                    style={{
                                      padding: '8px 12px', borderRadius: 8,
                                      background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.3)',
                                      color: '#FF453A', fontWeight: 700, fontSize: 12, cursor: 'pointer'
                                    }}
                                  >
                                    Mark Absent
                                  </button>
                                  <button
                                    onClick={() => recordAttendance(student.id, student.type === 'PICKUP' ? 'PICKED_UP' : 'DROPPED_OFF')}
                                    style={{
                                      padding: '8px 12px', borderRadius: 8,
                                      background: student.type === 'PICKUP' ? '#30D158' : '#0A84FF',
                                      color: '#08080A', border: 'none', fontWeight: 800, fontSize: 12, cursor: 'pointer'
                                    }}
                                  >
                                    {student.type === 'PICKUP' ? '✓ Boarded' : '✓ Dropped Off'}
                                  </button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Delay Reporting Panel */}
                  <div style={{
                    background: '#141417', border: '1px solid #26262C', borderRadius: 16, padding: 20
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showDelayPanel ? 16 : 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <AlertTriangle size={18} color="#FF9F0A" />
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#FFF' }}>Report Traffic Delay</h3>
                      </div>
                      <button
                        onClick={() => setShowDelayPanel(p => !p)}
                        style={{
                          background: 'rgba(255,159,10,0.12)', border: '1px solid rgba(255,159,10,0.3)',
                          color: '#FF9F0A', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer'
                        }}
                      >
                        {showDelayPanel ? 'Cancel' : 'Report Delay to Parents'}
                      </button>
                    </div>

                    {showDelayPanel && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, color: '#A6A6B2', marginBottom: 4 }}>Reason for Delay</label>
                          <select
                            value={delayReason}
                            onChange={e => setDelayReason(e.target.value)}
                            style={{
                              width: '100%', padding: '10px 12px', background: '#0E0E11',
                              border: '1px solid #26262C', borderRadius: 8, color: '#FFF', fontSize: 13
                            }}
                          >
                            <option>Heavy Traffic</option>
                            <option>Severe Weather</option>
                            <option>Road Construction</option>
                            <option>Mechanical Issue</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, color: '#A6A6B2', marginBottom: 6 }}>Estimated Delay (Minutes)</label>
                          <div style={{ display: 'flex', gap: 8 }}>
                            {[5, 10, 15, 20, 30].map(m => (
                              <button
                                key={m}
                                onClick={() => setDelayMinutes(m)}
                                style={{
                                  flex: 1, padding: '8px 0', borderRadius: 8,
                                  border: `1px solid ${delayMinutes === m ? '#FF9F0A' : '#26262C'}`,
                                  background: delayMinutes === m ? 'rgba(255,159,10,0.15)' : '#0E0E11',
                                  color: delayMinutes === m ? '#FF9F0A' : '#A6A6B2',
                                  fontWeight: delayMinutes === m ? 700 : 500, fontSize: 13, cursor: 'pointer'
                                }}
                              >
                                +{m}m
                              </button>
                            ))}
                          </div>
                        </div>
                        <button
                          disabled={sendingDelay}
                          onClick={async () => {
                            if (!data?.activeTrip) return
                            setSendingDelay(true)
                            try {
                              const res = await fetch(`/api/trips/${data.activeTrip.id}`, {
                                method: 'PATCH', 
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ delayMinutes, delayReason })
                              })
                              if (res.ok) {
                                showToast(`Delay reported: +${delayMinutes}m — Parents notified`, 'success')
                                setShowDelayPanel(false)
                              } else {
                                showToast('Failed to report delay', 'error')
                              }
                            } catch { 
                              showToast('Network error', 'error') 
                            } finally { 
                              setSendingDelay(false) 
                            }
                          }}
                          style={{
                            width: '100%', padding: '12px', background: 'linear-gradient(135deg, #FF9F0A, #D97706)',
                            color: '#08080A', border: 'none', borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: 'pointer'
                          }}
                        >
                          {sendingDelay ? 'Broadcasting…' : `🔔 Broadcast Delay (+${delayMinutes} mins)`}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Panic Emergency SOS Button */}
                  <div style={{
                    background: 'rgba(255,69,58,0.06)', border: '2px solid rgba(255,69,58,0.3)',
                    borderRadius: 16, overflow: 'hidden'
                  }}>
                    <div style={{
                      background: 'repeating-linear-gradient(45deg, rgba(255,69,58,0.08), rgba(255,69,58,0.08) 10px, transparent 10px, transparent 20px)',
                      padding: '8px', textAlign: 'center', fontSize: 11, color: '#FF453A', fontWeight: 800, letterSpacing: 2
                    }}>
                      EMERGENCY DISPATCH LINK ONLY
                    </div>
                    <button
                      onClick={async () => {
                        if (confirm('🚨 ACTIVATE EMERGENCY SOS? This sends immediate GPS location to school dispatch and transport control.')) {
                          playAlert()
                          navigator.geolocation.getCurrentPosition(
                            async (pos) => {
                              await fetch('/api/emergency', {
                                method: 'POST', 
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, source: 'DRIVER' })
                              })
                              showToast('🚨 SOS Emergency Signal Sent to Dispatch!', 'error')
                            },
                            async () => {
                              await fetch('/api/emergency', {
                                method: 'POST', 
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ source: 'DRIVER' })
                              })
                              showToast('🚨 SOS Emergency Signal Sent to Dispatch!', 'error')
                            }
                          )
                        }
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(135deg, #FF453A, #DC2626)',
                        color: '#FFF', fontWeight: 900, width: '100%', padding: '16px',
                        border: 'none', fontSize: 16, letterSpacing: 1, cursor: 'pointer'
                      }}
                    >
                      <ShieldAlert size={22} style={{ marginRight: 8 }} />
                      EMERGENCY PANIC SOS
                    </button>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 2: ROUTE & STOPS
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'ROUTE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{
              background: '#141417', border: '1px solid #26262C', borderRadius: 16, padding: 24
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#FFD60A', fontWeight: 700, textTransform: 'uppercase' }}>Assigned Fleet Route</div>
                  <h2 style={{ margin: '4px 0 0 0', fontSize: 22, fontWeight: 800, color: '#FFF' }}>
                    {assignedRoute?.name || 'No Route Assigned'}
                  </h2>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ padding: '8px 14px', background: '#1C1C21', borderRadius: 10, border: '1px solid #26262C', fontSize: 13 }}>
                    Morning: <strong style={{ color: '#FFD60A' }}>{assignedRoute?.morningTime || '07:30 AM'}</strong>
                  </div>
                  <div style={{ padding: '8px 14px', background: '#1C1C21', borderRadius: 10, border: '1px solid #26262C', fontSize: 13 }}>
                    Afternoon: <strong style={{ color: '#0A84FF' }}>{assignedRoute?.afternoonTime || '03:00 PM'}</strong>
                  </div>
                </div>
              </div>

              {/* Sequential Stops with Geo Coordinates */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(assignedRoute?.stops || []).map((stop, idx) => (
                  <div
                    key={stop.id}
                    style={{
                      padding: 16, background: '#1C1C21', borderRadius: 12, border: '1px solid #26262C',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #FFD60A, #FF9F0A)',
                        color: '#08080A', fontWeight: 800, fontSize: 15,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        {idx + 1}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#FFF' }}>{stop.name}</div>
                        <div style={{ fontSize: 12, color: '#A6A6B2', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>GPS: {stop.latitude ? stop.latitude.toFixed(4) : '3.1390'}, {stop.longitude ? stop.longitude.toFixed(4) : '101.6869'}</span>
                          <span>•</span>
                          <span>Order: #{idx + 1}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{
                        fontSize: 12, padding: '4px 10px', borderRadius: 6,
                        background: 'rgba(48,209,88,0.12)', color: '#30D158', fontWeight: 600
                      }}>
                        {(stop.pickupStudents?.length || 0)} pickups
                      </span>
                      <span style={{
                        fontSize: 12, padding: '4px 10px', borderRadius: 6,
                        background: 'rgba(10,132,255,0.12)', color: '#0A84FF', fontWeight: 600
                      }}>
                        {(stop.dropoffStudents?.length || 0)} dropoffs
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 3: STUDENT MANIFEST
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'MANIFEST' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{
              background: '#141417', border: '1px solid #26262C', borderRadius: 16, padding: 24
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 14 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#FFF' }}>
                    Assigned Student Manifest
                  </h2>
                  <div style={{ fontSize: 13, color: '#A6A6B2', marginTop: 2 }}>
                    Total {allRouteStudents.length} students enrolled on this route with parent emergency contacts.
                  </div>
                </div>

                {/* Search Box */}
                <div style={{ position: 'relative', width: 280 }}>
                  <Search size={16} color="#6E6E7A" style={{ position: 'absolute', left: 12, top: 12 }} />
                  <input
                    type="text"
                    placeholder="Search student or grade…"
                    value={manifestQuery}
                    onChange={e => setManifestQuery(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px 10px 36px',
                      background: '#0E0E11', border: '1px solid #26262C',
                      borderRadius: 10, color: '#FFF', fontSize: 13
                    }}
                  />
                </div>
              </div>

              {/* Manifest List */}
              {filteredStudents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#6E6E7A', fontSize: 14 }}>
                  {manifestQuery ? `No students match "${manifestQuery}"` : 'No students enrolled on this route yet.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {filteredStudents.map(student => {
                    const pDaily = dailyStatusBoard[student.id]?.status

                    return (
                      <div
                        key={student.id}
                        style={{
                          background: '#1C1C21', border: '1px solid #26262C',
                          borderRadius: 12, padding: '16px 20px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <div style={{
                            width: 44, height: 44, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #FFD60A, #FF9F0A)',
                            color: '#08080A', fontWeight: 800, fontSize: 16,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                          }}>
                            {student.name.charAt(0)}
                          </div>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#FFF', display: 'flex', alignItems: 'center', gap: 8 }}>
                              {student.name}
                              <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: '#26262C', color: '#A6A6B2' }}>
                                {student.grade}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: '#A6A6B2', marginTop: 2 }}>
                              Pickup: <strong style={{ color: '#30D158' }}>{student.pickupStopName || 'Assigned Stop'}</strong> • Drop-off: <strong style={{ color: '#0A84FF' }}>{student.dropoffStopName || 'School'}</strong>
                            </div>
                          </div>
                        </div>

                        {/* Today's Parent Daily Status Badge */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {pDaily ? (
                            <span style={{
                              padding: '5px 12px', borderRadius: 8,
                              background: pDaily === 'ABSENT_TODAY' ? 'rgba(255,69,58,0.15)' : 'rgba(48,209,88,0.15)',
                              border: `1px solid ${pDaily === 'ABSENT_TODAY' ? '#FF453A' : '#30D158'}`,
                              color: pDaily === 'ABSENT_TODAY' ? '#FF453A' : '#30D158',
                              fontSize: 12, fontWeight: 700
                            }}>
                              {pDaily === 'ABSENT_TODAY' ? '🚫 Absent Today' : '✓ Boarding Today'}
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: '#6E6E7A', background: '#0E0E11', padding: '4px 10px', borderRadius: 6 }}>
                              ○ No Parent Notice
                            </span>
                          )}

                          {student.parentContact1 && (
                            <a
                              href={`tel:${student.parentContact1}`}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', borderRadius: 8,
                                background: '#26262C', border: '1px solid #3A3A43',
                                color: '#FFF', fontSize: 12, fontWeight: 600, textDecoration: 'none'
                              }}
                            >
                              <Phone size={13} color="#FFD60A" /> Call Parent
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 4: PRE-TRIP VEHICLE INSPECTION
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'INSPECTION' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{
              background: '#141417', border: '1px solid #26262C', borderRadius: 16, padding: 24
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#FFF', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ClipboardCheck size={22} color="#FFD60A" />
                    Daily Pre-Trip Safety Inspection
                  </h2>
                  <div style={{ fontSize: 13, color: '#A6A6B2', marginTop: 2 }}>
                    Bus #{data?.busPlate || 'BUS-001'} • 7-Point Safety Verification Checklist
                  </div>
                </div>
                {inspectionSubmitted && (
                  <span style={{
                    fontSize: 12, fontWeight: 700, color: '#30D158',
                    background: 'rgba(48,209,88,0.15)', border: '1px solid rgba(48,209,88,0.3)',
                    padding: '6px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6
                  }}>
                    <CheckCircle size={15} /> Signed Off For Today
                  </span>
                )}
              </div>

              {/* 7-Point Inspection items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                {[
                  { id: 'brakes', title: 'Service Brakes & Parking Brake', desc: 'Pedal firmness, air pressure stability, and parking brake hold' },
                  { id: 'tires', title: 'Tires & Lug Nuts', desc: 'Adequate tread depth, correct PSI pressure, and tight wheel nuts' },
                  { id: 'emergencyExits', title: 'Emergency Doors & Roof Hatches', desc: 'Unlatches smoothly from inside/outside, warning buzzer active' },
                  { id: 'lightsAndSignals', title: 'Headlights, Flashers & Stop Arm', desc: 'High/low beams, amber warning lights, and deployable stop arm' },
                  { id: 'wipers', title: 'Windshield Wipers & Defroster', desc: 'Blades clear glass without streaking, fluid jets operational' },
                  { id: 'firstAidAndExtinguisher', title: 'First Aid Kit & Fire Extinguisher', desc: 'Fully stocked medical kit, fire extinguisher gauge in green zone' },
                  { id: 'fuelOrBattery', title: 'Fuel Reserve / Battery Charge', desc: 'Fuel tank at least 50% or EV battery above 60% capacity' },
                ].map(item => (
                  <div
                    key={item.id}
                    onClick={() => setChecklist(p => ({ ...p, [item.id]: !p[item.id] }))}
                    style={{
                      padding: '14px 18px', background: '#1C1C21', borderRadius: 12,
                      border: `1px solid ${checklist[item.id] ? '#26262C' : 'rgba(255,69,58,0.3)'}`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#FFF' }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: '#A6A6B2', marginTop: 2 }}>{item.desc}</div>
                    </div>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: checklist[item.id] ? '#30D158' : 'rgba(255,69,58,0.2)',
                      color: checklist[item.id] ? '#08080A' : '#FF453A',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800
                    }}>
                      {checklist[item.id] ? '✓' : '✕'}
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => {
                  setInspectionSubmitted(true)
                  setXp(p => p + 25)
                  showToast('✓ Safety inspection logged! +25 XP awarded', 'success')
                }}
                style={{
                  width: '100%', padding: '14px', borderRadius: 12,
                  background: '#FFD60A', color: '#08080A', fontWeight: 800, fontSize: 15,
                  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8
                }}
              >
                <ClipboardCheck size={18} />
                {inspectionSubmitted ? 'Update Safety Sign-Off' : 'Submit Safety Inspection Sign-Off'}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 5: SHIFTS & TRIP HISTORY
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'SHIFTS' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
            {/* Shifts Schedule Card */}
            <div style={{
              background: '#141417', border: '1px solid #26262C', borderRadius: 16, padding: 24
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 17, fontWeight: 700, color: '#FFF', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar size={18} color="#FFD60A" /> Upcoming Shifts
              </h3>

              {shifts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#6E6E7A', fontSize: 13 }}>
                  No upcoming shifts scheduled.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {shifts.map(s => (
                    <div
                      key={s.id}
                      style={{
                        padding: '12px 14px', background: '#1C1C21', borderRadius: 10,
                        border: '1px solid #26262C', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#FFF' }}>
                          {new Date(s.date).toLocaleDateString()}
                        </div>
                        <div style={{ fontSize: 12, color: '#A6A6B2', marginTop: 2 }}>
                          {s.startTime} → {s.endTime}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        background: s.status === 'SCHEDULED' ? 'rgba(10,132,255,0.15)' : 'rgba(48,209,88,0.15)',
                        color: s.status === 'SCHEDULED' ? '#0A84FF' : '#30D158'
                      }}>
                        {s.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trip History Card */}
            <div style={{
              background: '#141417', border: '1px solid #26262C', borderRadius: 16, padding: 24
            }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: 17, fontWeight: 700, color: '#FFF', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={18} color="#FFD60A" /> Completed Trip History
              </h3>

              {trips.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#6E6E7A', fontSize: 13 }}>
                  No past trips completed yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {trips.map(tRec => (
                    <div
                      key={tRec.id}
                      style={{
                        padding: '12px 14px', background: '#1C1C21', borderRadius: 10,
                        border: '1px solid #26262C', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#FFF' }}>
                          {tRec.routeName}
                        </div>
                        <div style={{ fontSize: 12, color: '#A6A6B2', marginTop: 2 }}>
                          {new Date(tRec.date).toLocaleDateString()} • {tRec.pickedUp} boarded • {tRec.droppedOff} dropped • {tRec.absent} absent
                        </div>
                      </div>
                      {tRec.avgRating && (
                        <span style={{ color: '#FFD60A', fontWeight: 800, fontSize: 13 }}>
                          ⭐ {tRec.avgRating}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 6: BROADCAST ANNOUNCEMENTS
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'ANNOUNCEMENTS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{
              background: '#141417', border: '1px solid #26262C', borderRadius: 16, padding: 24
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#FFF', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bell size={22} color="#FFD60A" />
                    School & Fleet Notices
                  </h2>
                  <div style={{ fontSize: 13, color: '#A6A6B2', marginTop: 2 }}>
                    Official broadcasts issued by School Administrators and Dispatch
                  </div>
                </div>
                <button
                  onClick={fetchStatus}
                  style={{
                    background: '#26262C', border: '1px solid #3A3A43', color: '#FFF',
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>

              {announcements.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '48px 0', color: '#6E6E7A', fontSize: 14 }}>
                  No active broadcasts found.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {announcements.map(ann => (
                    <div
                      key={ann.id}
                      style={{
                        padding: '16px 20px', background: '#1C1C21', borderRadius: 12,
                        borderLeft: `4px solid ${ann.type === 'EMERGENCY' ? '#FF453A' : ann.type === 'WEATHER' ? '#0A84FF' : '#FFD60A'}`
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 15, color: '#FFF' }}>{ann.title}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                            background: ann.type === 'EMERGENCY' ? 'rgba(255,69,58,0.15)' : 'rgba(255,214,10,0.15)',
                            color: ann.type === 'EMERGENCY' ? '#FF453A' : '#FFD60A'
                          }}>
                            {ann.type}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: '#6E6E7A' }}>
                          {new Date(ann.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#A6A6B2', lineHeight: 1.5 }}>
                        {ann.body}
                      </div>
                      <div style={{ fontSize: 11, color: '#6E6E7A', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>Issued by: <strong style={{ color: '#FFF' }}>{ann.senderName || 'School Administration'}</strong></span>
                        {ann.senderRole && (
                          <span style={{ background: '#26262C', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>
                            {ann.senderRole}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 7: DRIVER PROFILE
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'PROFILE' && (
          <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{
              background: '#141417', border: '1px solid #26262C', borderRadius: 16, padding: '32px 24px', textAlign: 'center'
            }}>
              <div style={{
                width: 76, height: 76, borderRadius: '50%',
                background: 'linear-gradient(135deg, #FFD60A, #FF9F0A)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, fontWeight: 800, color: '#08080A', margin: '0 auto 16px',
                boxShadow: '0 0 24px rgba(255,214,10,0.3)'
              }}>
                {me?.name ? me.name.charAt(0).toUpperCase() : 'D'}
              </div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#FFF' }}>
                {me?.name || 'Authorized Fleet Driver'}
              </h2>
              <div style={{ fontSize: 14, color: '#A6A6B2', marginTop: 4 }}>{me?.email || 'driver@ridesafe.internal'}</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: '#FFD60A', color: '#08080A' }}>
                  CERTIFIED COMMERCIAL DRIVER
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6, background: '#1C1C21', color: '#A6A6B2' }}>
                  Bus #{data?.busPlate || 'BUS-001'}
                </span>
              </div>
            </div>

            <div style={{
              background: '#141417', border: '1px solid #26262C', borderRadius: 16, padding: 20
            }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: 16, fontWeight: 700, color: '#FFF' }}>Driver Statistics & Performance</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, textAlign: 'center' }}>
                <div style={{ background: '#1C1C21', padding: 14, borderRadius: 10 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#FFD60A' }}>{xp}</div>
                  <div style={{ fontSize: 11, color: '#6E6E7A', marginTop: 2 }}>Safety XP</div>
                </div>
                <div style={{ background: '#1C1C21', padding: 14, borderRadius: 10 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#30D158' }}>{trips.length}</div>
                  <div style={{ fontSize: 11, color: '#6E6E7A', marginTop: 2 }}>Completed Trips</div>
                </div>
                <div style={{ background: '#1C1C21', padding: 14, borderRadius: 10 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#0A84FF' }}>99.4%</div>
                  <div style={{ fontSize: 11, color: '#6E6E7A', marginTop: 2 }}>On-Time Rating</div>
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Camera Capture Overlay */}
      <CameraCapture
        isOpen={cameraOpen}
        onClose={() => setCameraOpen(false)}
        title="Verify Student Photo"
        onCapture={(dataUrl) => {
          setCapturedPhotos(prev => ({ ...prev, [cameraTarget]: dataUrl }))
          showToast('✓ Photo captured and verified!')
        }}
      />
    </div>
  )
}
