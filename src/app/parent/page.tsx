'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import '../parent.css'
import PaymentSection from '@/components/parent/PaymentSection'
import RecipientPicker from '@/components/parent/RecipientPicker'

interface StudentData {
  id: string; name: string; grade: string; level: string;
  status: string; photoUrl?: string; pickupTime?: string;
  parentContact1: string; parentContact2?: string;
  isSelfPickup: boolean;
  pickupStop?: { name: string; latitude: number; longitude: number };
  dropoffStop?: { name: string };
  route?: { name: string };
  dailyStatuses?: { status: string }[];
}
interface DriverData {
  id: string; name: string; phone?: string;
  lastLatitude: number | null; lastLongitude: number | null;
  lastLocationUpdate?: string; currentSpeedKmH?: number;
  distanceKm?: number; etaMins?: number; isNear?: boolean;
}
interface NotifData {
  id: string; title: string; body: string; type: string;
  read: boolean; createdAt: string;
}
interface MessageData {
  id: string; content: string; read: boolean; createdAt: string;
  sender: { name: string };
}
interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  type: string;
  targetRole: string;
  createdAt: string;
  senderName?: string;
  senderRole?: string;
}

const BusMap = dynamic(() => import('@/components/shared/BusMap'), { ssr: false })

import { useAudio } from '@/hooks/useAudio'
import { useTranslation, LanguageSwitcher } from '@/i18n/provider'
import CalendarCard from '@/components/parent/CalendarCard'
import {
  AlertTriangle, CheckCircle, AlertCircle,
  Phone, Bus, Clock, Clipboard, Home, XCircle, User,
  Settings, Bell, HelpCircle, LogOut, Globe, Navigation, MessageSquare, Shield,
  ChevronRight, MapPin, Check, Send, Receipt
} from 'lucide-react'



export default function ParentDashboard() {
  const { locale, setLocale, t } = useTranslation()
  const [students, setStudents] = useState<StudentData[]>([])
  const [drivers, setDrivers] = useState<DriverData[]>([])
  const [notifications, setNotifications] = useState<NotifData[]>([])
  const [schoolName, setSchoolName] = useState('RideSafe School')
  const [, setLastNotifId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'HOME' | 'MY_CHILD' | 'MESSAGES' | 'PAYMENT' | 'PROFILE'>('HOME')
  const [showMapModal, setShowMapModal] = useState(false)
  const [busNearby, setBusNearby] = useState(false)
  const [busNearbyStop, setBusNearbyStop] = useState<string>('')
  const busNearbyRef = useRef(false)
  const prevDriverLatRef = useRef<number | null>(null)
  
  // Active trip delay info
  const [activeTrip, setActiveTrip] = useState<{ id: string; delayMinutes?: number; delayReason?: string; routeName?: string } | null>(null)
  // Confirmation loading state
  const [confirming, setConfirming] = useState<string | null>(null)

  // Messages state
  const [messages, setMessages] = useState<MessageData[]>([])
  const [msgContent, setMsgContent] = useState('')
  const [msgRecipientId, setMsgRecipientId] = useState('')
  const [sending, setSending] = useState(false)
  const [msgToast, setMsgToast] = useState('')
  // Parent daily status state
  const [dailyStatus, setDailyStatus] = useState<Record<string, string>>({}) // studentId -> status
  const [reportingStatus, setReportingStatus] = useState<string | null>(null)
  // Announcements broadcast feed
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([])

  // Profile menu state
  const [me, setMe] = useState<{ name: string; email: string; phone?: string } | null>(null)
  const [profilePanel, setProfilePanel] = useState<'INFO' | 'HELP' | 'LANG' | null>(null)
  const [profileNotice, setProfileNotice] = useState('')
  const showProfileNotice = (msg: string) => { setProfileNotice(msg); setTimeout(() => setProfileNotice(''), 3000) }

  // Audio Hooks
  const { play: playAlert } = useAudio('/alert toon.mp3')
  const { play: playHorn } = useAudio('/bus-horn.mp3')

  const router = useRouter()



  // Request notification permission
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Real GPS proximity check using Haversine formula to student's assigned pickup stop
  const checkBusProximity = (driversData: DriverData[], studentsData: StudentData[]) => {
    if (!studentsData[0]?.pickupStop) return
    const activeDriver = driversData[0]
    if (!activeDriver?.lastLatitude || !activeDriver?.lastLongitude) return
    const stop = studentsData[0].pickupStop
    if (!stop.latitude || !stop.longitude) return

    const R = 6371
    const dLat = (stop.latitude - activeDriver.lastLatitude) * (Math.PI / 180)
    const dLon = (stop.longitude - activeDriver.lastLongitude) * (Math.PI / 180)
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(activeDriver.lastLatitude * (Math.PI / 180)) * Math.cos(stop.latitude * (Math.PI / 180)) *
      Math.sin(dLon/2) * Math.sin(dLon/2)
    const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

    const THRESHOLD_KM = 0.5
    if (distKm <= THRESHOLD_KM) {
      if (!busNearbyRef.current) {
        busNearbyRef.current = true
        setBusNearby(true)
        setBusNearbyStop(stop.name)
        playAlert()
        if (Notification.permission === 'granted') {
          const etaMins = activeDriver.currentSpeedKmH && activeDriver.currentSpeedKmH > 0
            ? Math.round((distKm / activeDriver.currentSpeedKmH) * 60)
            : null
          const etaStr = etaMins !== null ? ` ETA: ~${etaMins} min${etaMins !== 1 ? 's' : ''}.` : ''
          try {
            new Notification('RideSafe 🚌 Bus Approaching', {
              body: `Your bus is approaching ${stop.name}!${etaStr} Get ready.`,
              icon: '/favicon.ico'
            })
          } catch { /* ignore */ }
        }
        setTimeout(() => { busNearbyRef.current = false; setBusNearby(false); setBusNearbyStop('') }, 60000)
      }
    } else {
      if (busNearbyRef.current && distKm > THRESHOLD_KM + 0.2) {
        busNearbyRef.current = false
        setBusNearby(false)
        setBusNearbyStop('')
      }
    }
    prevDriverLatRef.current = activeDriver.lastLatitude
  }

  useEffect(() => {
    fetch('/api/admin/settings').then(r => r.json()).then(d => {
      if (d.schoolName) setSchoolName(d.schoolName)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [studentsRes, locationRes, notifRes, msgRes, meRes, annRes] = await Promise.all([
          fetch('/api/students'),
          fetch('/api/location'),
          fetch('/api/notifications'),
          fetch('/api/messages'),
          fetch('/api/auth/me'),
          fetch('/api/announcements').catch(() => null),
        ])
        const studentsData = await studentsRes.json()
        const locationData = await locationRes.json()
        const notificationsData = await notifRes.json()
        const msgData = await msgRes.json()
        if (meRes.ok) {
          const meData = await meRes.json()
          if (meData.user) setMe(meData.user)
        }
        if (annRes && annRes.ok) {
          const annJson = await annRes.json()
          setAnnouncements(annJson.announcements || [])
        }

        if (studentsData.error === 'Unauthorized') { router.push('/'); return }

        const currentStudents = studentsData.students || []
        setStudents(currentStudents)

        // Initialize today's status map
        const initialStatus: Record<string, string> = {}
        for (const s of currentStudents) {
          if (s.dailyStatuses?.[0]?.status) {
            initialStatus[s.id] = s.dailyStatuses[0].status
          }
        }
        setDailyStatus(initialStatus)

        const driversData = locationData.drivers || []
        setDrivers(driversData)
        checkBusProximity(driversData, currentStudents)

        const newNotifs = notificationsData.notifications || []
        setNotifications(newNotifs)
        setMessages(msgData.messages || [])

        try {
          const tripRes = await fetch('/api/trips/active')
          if (tripRes.ok) {
            const tripData = await tripRes.json()
            if (tripData.trip) setActiveTrip(tripData.trip)
          }
        } catch { /* silent */ }

        if (loading) setLoading(false)
      } catch (error) { console.error(error) }
    }

    const fetchBackgroundData = async () => {
      try {
        const [notifRes, msgRes, annRes] = await Promise.all([
          fetch('/api/notifications'),
          fetch('/api/messages'),
          fetch('/api/announcements').catch(() => null),
        ])
        const notificationsData = await notifRes.json()
        const msgData = await msgRes.json()
        if (annRes && annRes.ok) {
          const annJson = await annRes.json()
          setAnnouncements(annJson.announcements || [])
        }

        const newNotifs = notificationsData.notifications || []
        setNotifications(newNotifs)
        setMessages(msgData.messages || [])

        if (newNotifs.length > 0) {
          const latest = newNotifs[0]
          setLastNotifId(prev => {
            if (prev !== null && prev !== latest.id) {
              if (latest.type === 'EMERGENCY') playAlert()
              else playHorn()
              if (Notification.permission === 'granted') {
                try {
                  navigator.serviceWorker?.ready.then(reg => {
                    reg.showNotification(latest.title, { body: latest.body, icon: '/favicon.ico' })
                  }).catch(() => new Notification(latest.title, { body: latest.body }))
                } catch { new Notification(latest.title, { body: latest.body }) }
              }
            }
            return latest.id
          })
        }
      } catch (error) { console.error(error) }
    }

    fetchInitialData()
    const interval = setInterval(fetchBackgroundData, 15000)

    const evtSource = new EventSource('/api/location/stream')
    evtSource.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data)
        setDrivers(prevDrivers => {
          const exists = prevDrivers.some(d => d.id === update.id)
          return exists 
            ? prevDrivers.map(d => d.id === update.id ? { ...d, ...update } : d)
            : [...prevDrivers, update]
        })
      } catch (e) {
        console.error('SSE Error parsing update:', e)
      }
    }

    return () => {
      clearInterval(interval)
      evtSource.close()
    }
    // eslint-disable-next-line
  }, [router])

  useEffect(() => {
    if (drivers.length > 0 && students.length > 0) {
      checkBusProximity(drivers, students)
    }
  }, [drivers, students])

  const handleLogout = async () => {
    await fetch('/api/auth/me', { method: 'POST' }); router.push('/')
  }

  const sendMessage = async () => {
    if (!msgContent.trim()) return
    if (!msgRecipientId) { setMsgToast('Please select a recipient'); return }
    setSending(true)
    try {
      const res = await fetch('/api/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: msgRecipientId, content: msgContent.trim() })
      })
      if (res.ok) { setMsgContent(''); setMsgToast('Message sent!') }
      else setMsgToast('Failed to send message')
    } catch { setMsgToast('Network error') } finally {
      setSending(false); setTimeout(() => setMsgToast(''), 3000)
    }
  }

  const reportDailyStatus = async (studentId: string, action: 'PARENT_BOARDING' | 'PARENT_ABSENT_TODAY') => {
    setReportingStatus(studentId + '_' + action)
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, action })
      })
      if (res.ok) {
        const data = await res.json()
        setDailyStatus(prev => ({ ...prev, [studentId]: data.status }))
      }
    } catch { /* silent */ } finally {
      setReportingStatus(null)
    }
  }

  const todayStr = new Intl.DateTimeFormat(locale === 'ms' ? 'ms-MY' : (locale === 'zh' ? 'zh-CN' : 'en-GB'), {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric'
  }).format(new Date())
  const unreadNotifs = notifications.filter(n => !n.read).length
  const primaryStudent = students[0]
  const activeDriver = drivers[0]

  if (loading) return (
    <div className="parent-portal-wrapper" style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:48, height:48, border:'3px solid rgba(255,214,10,0.2)', borderTopColor:'#FFD60A', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 16px' }} />
        <div style={{ color:'var(--hc-text-2, #A6A6B2)', fontSize:14, fontWeight:600 }}>Loading RideSafe Parent Portal…</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  return (
    <div className="parent-portal-wrapper">

      {/* ── Top Navigation Bar ─────────────────────────────────────────────── */}
      <header className="parent-topbar">
        <div className="parent-topbar-inner">
          {/* Brand Logo & School */}
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:'linear-gradient(135deg,#FFD60A,#F5A623)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 16px rgba(255,214,10,0.3)', flexShrink:0 }}>
              <Bus size={22} color="#08080A" strokeWidth={2.5}/>
            </div>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontWeight:800, fontSize:16, color:'#FFFFFF', letterSpacing:'-0.02em' }}>RideSafe</span>
                <span className="parent-badge parent-badge-warning" style={{ fontSize:10, padding:'2px 8px' }}>PARENT</span>
              </div>
              <div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)', fontWeight:500 }}>{schoolName}</div>
            </div>
          </div>

          {/* Center Navigation Pills (Desktop/Tablet) */}
          <nav className="parent-nav-pills">
            <button className={`parent-pill-btn ${activeTab === 'HOME' ? 'active' : ''}`} onClick={() => setActiveTab('HOME')}>
              <Home size={15}/> {t('nav.home')}
            </button>
            <button className={`parent-pill-btn ${activeTab === 'MY_CHILD' ? 'active' : ''}`} onClick={() => setActiveTab('MY_CHILD')}>
              <User size={15}/> {t('parent.myChildren')}
            </button>
            <button className={`parent-pill-btn ${activeTab === 'MESSAGES' ? 'active' : ''}`} onClick={() => setActiveTab('MESSAGES')}>
              <MessageSquare size={15}/> {t('nav.messages')}
              {messages.filter(m => !m.read).length > 0 && (
                <span style={{ width:6, height:6, borderRadius:'50%', background:'#FF453A', display:'inline-block' }}/>
              )}
            </button>
            <button className={`parent-pill-btn ${activeTab === 'PAYMENT' ? 'active' : ''}`} onClick={() => setActiveTab('PAYMENT')}>
              <Receipt size={15}/> Payments
            </button>
            <button className={`parent-pill-btn ${activeTab === 'PROFILE' ? 'active' : ''}`} onClick={() => setActiveTab('PROFILE')}>
              <Settings size={15}/> {t('nav.profile')}
            </button>
          </nav>

          {/* Right Header Actions */}
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <LanguageSwitcher />

            {/* Notification Bell */}
            <button onClick={() => setActiveTab('HOME')} style={{ background:'var(--hc-surface, #141417)', border:'1px solid var(--hc-line, #26262C)', borderRadius:12, padding:8, cursor:'pointer', position:'relative', color:'var(--hc-text-2, #A6A6B2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Bell size={18}/>
              {unreadNotifs > 0 && (
                <span style={{ position:'absolute', top:-4, right:-4, background:'#FF453A', color:'#fff', fontSize:10, fontWeight:800, minWidth:16, height:16, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px', border:'2px solid #08080A' }}>
                  {unreadNotifs}
                </span>
              )}
            </button>

            {/* User Profile Avatar */}
            <div style={{ display:'flex', alignItems:'center', gap:8, paddingLeft:4 }}>
              <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--hc-surface-2, #1C1C21)', border:'1px solid var(--hc-line-strong, #3A3A43)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#FFD60A' }}>
                {me?.name ? me.name.charAt(0).toUpperCase() : 'P'}
              </div>
              <div style={{ display:'none', flexDirection:'column' }} className="parent-user-label">
                <span style={{ fontSize:13, fontWeight:600, color:'#FFFFFF' }}>{me?.name || 'Parent'}</span>
              </div>
            </div>

            {/* Quick Logout Button */}
            <button onClick={handleLogout} title="Log Out" style={{ background:'transparent', border:'none', color:'var(--hc-text-3, #6E6E7A)', cursor:'pointer', padding:6, display:'flex', alignItems:'center' }}>
              <LogOut size={17}/>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Container ─────────────────────────────────────────────────── */}
      <main className="parent-container">

        {/* ── Bus Nearby Approaching Alert Banner ── */}
        <AnimatePresence>
          {busNearby && (
            <motion.div initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-20 }}
              style={{ background:'linear-gradient(90deg, #FFD60A, #F5A623)', color:'#08080A', padding:'14px 20px', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'space-between', gap:14, marginBottom:24, boxShadow:'0 0 30px rgba(255,214,10,0.3)', fontWeight:700, fontSize:15 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:24 }}>🚌</span>
                <div>
                  <div>{t('parent.busApproaching')} — <strong>{busNearbyStop || 'Your Stop'}</strong></div>
                  <div style={{ fontSize:12, opacity:0.85, fontWeight:500 }}>
                    {activeDriver?.etaMins != null ? `Estimated arrival in ~${activeDriver.etaMins} minutes.` : 'Please prepare for pickup/dropoff.'}
                  </div>
                </div>
              </div>
              <button onClick={() => setShowMapModal(true)} className="parent-btn-secondary" style={{ background:'#08080A', color:'#FFD60A', border:'none', fontSize:12, padding:'6px 14px' }}>
                View Map
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Fullscreen Map Modal ── */}
        <AnimatePresence>
          {showMapModal && (
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(12px)', display:'flex', flexDirection:'column' }}>
              <div style={{ background:'var(--hc-surface, #141417)', borderBottom:'1px solid var(--hc-line, #26262C)', padding:'14px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <Bus size={20} color="#FFD60A"/>
                  <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#FFFFFF' }}>{t('parent.trackBus')} — Live GPS Telemetry</h2>
                </div>
                <button onClick={() => setShowMapModal(false)} className="parent-btn-secondary" style={{ padding:'6px 16px', fontSize:13 }}>
                  {t('common.close')}
                </button>
              </div>
              <div style={{ flex:1, position:'relative' }}>
                {typeof window !== 'undefined' && <BusMap drivers={drivers} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Welcome Greeting & Date ────────────────────────────────────────── */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:24, flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--hc-text-3, #6E6E7A)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:4 }}>
              {todayStr}
            </div>
            <h1 style={{ margin:0, fontSize:26, fontWeight:800, color:'#FFFFFF', letterSpacing:'-0.02em' }}>
              Hi, {primaryStudent ? primaryStudent.name.split(' ')[0] : (me?.name || 'Parent')} 👋
            </h1>
            <div style={{ fontSize:14, color:'var(--hc-text-2, #A6A6B2)', marginTop:4 }}>
              Track your child&apos;s real-time transit and school communications.
            </div>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={() => setShowMapModal(true)} className="parent-btn-primary">
              <Navigation size={16}/> {t('parent.trackBus')}
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 1: HOME (Dashboard)
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'HOME' && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.25 }}>
            
            {/* Delay Notice Banner */}
            {activeTrip && activeTrip.delayMinutes && activeTrip.delayMinutes > 0 && (
              <div style={{ background:'rgba(255,159,10,0.12)', border:'1px solid rgba(255,159,10,0.3)', borderRadius:16, padding:'16px 20px', marginBottom:24, display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:40, height:40, borderRadius:10, background:'rgba(255,159,10,0.2)', display:'flex', alignItems:'center', justifyContent:'center', color:'#FF9F0A', flexShrink:0 }}>
                  <AlertTriangle size={22}/>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:'#FF9F0A' }}>{t('parent.delayNotice')}</div>
                  <div style={{ fontSize:13, color:'var(--hc-text-2, #A6A6B2)', marginTop:2 }}>
                    {activeTrip.routeName || t('parent.assignedRoute')} {t('parent.routeRunningLate')} ~{activeTrip.delayMinutes} {t('common.minutes')}
                    {activeTrip.delayReason ? ` (${t('common.reason')}: ${activeTrip.delayReason})` : ''}.
                  </div>
                </div>
              </div>
            )}

            <div className="parent-dashboard-grid">

              {/* ── LEFT MAIN COLUMN ── */}
              <div style={{ display:'flex', flexDirection:'column', gap:24 }}>

                {/* Primary Student Card & Transit Status */}
                {students.map(student => (
                  <div key={student.id} className="parent-card">
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                        <div style={{ width:54, height:54, borderRadius:14, background:'linear-gradient(135deg,#FFD60A,#F5A623)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:800, color:'#08080A', flexShrink:0, boxShadow:'0 0 16px rgba(255,214,10,0.25)' }}>
                          {student.photoUrl ? <Image src={student.photoUrl} alt="" width={54} height={54} style={{ objectFit:'cover', borderRadius:14 }} /> : student.name.charAt(0)}
                        </div>
                        <div>
                          <h3 style={{ margin:0, fontSize:18, fontWeight:700, color:'#FFFFFF' }}>{student.name}</h3>
                          <div style={{ fontSize:13, color:'var(--hc-text-2, #A6A6B2)', marginTop:2 }}>
                            {student.grade} · {student.level} {student.route?.name ? `· Route: ${student.route.name}` : ''}
                          </div>
                        </div>
                      </div>
                      <span className={`parent-badge ${student.status === 'CHECKED_OUT' ? 'parent-badge-success' : 'parent-badge-warning'}`}>
                        {student.status === 'CHECKED_OUT' ? `✓ ${t('parent.droppedOff')}` : `🚌 ${t('parent.onBus')}`}
                      </span>
                    </div>

                    {/* Transit Stop Route details */}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12, padding:'14px', background:'var(--hc-surface-2, #1C1C21)', borderRadius:14, marginBottom:16 }}>
                      <div>
                        <div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)', fontWeight:600, textTransform:'uppercase', marginBottom:2 }}>Pickup Stop</div>
                        <div style={{ fontSize:13, fontWeight:600, color:'#FFFFFF', display:'flex', alignItems:'center', gap:6 }}>
                          <MapPin size={14} color="#FFD60A"/> {student.pickupStop?.name || 'School Gate'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)', fontWeight:600, textTransform:'uppercase', marginBottom:2 }}>Drop-off Stop</div>
                        <div style={{ fontSize:13, fontWeight:600, color:'#FFFFFF', display:'flex', alignItems:'center', gap:6 }}>
                          <Home size={14} color="#4D8DFF"/> {student.dropoffStop?.name || 'Home Address'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)', fontWeight:600, textTransform:'uppercase', marginBottom:2 }}>Pickup Time</div>
                        <div style={{ fontSize:13, fontWeight:600, color:'#FFFFFF', display:'flex', alignItems:'center', gap:6 }}>
                          <Clock size={14} color="#2FD16B"/> {student.pickupTime || '07:30 AM'}
                        </div>
                      </div>
                    </div>

                    {/* Today's Daily Transit Status Declaration (1-Tap for Driver manifest) */}
                    <div style={{
                      padding: '14px 16px',
                      background: 'rgba(255,214,10,0.05)',
                      border: '1px solid rgba(255,214,10,0.2)',
                      borderRadius: 14,
                      marginBottom: 16
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#FFD60A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          Today&apos;s Daily Transit Status
                        </div>
                        {dailyStatus[student.id] && (
                          <span style={{
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: 9999,
                            background: dailyStatus[student.id] === 'BOARDING' ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)',
                            color: dailyStatus[student.id] === 'BOARDING' ? '#30D158' : '#FF453A',
                            border: `1px solid ${dailyStatus[student.id] === 'BOARDING' ? 'rgba(48,209,88,0.3)' : 'rgba(255,69,58,0.3)'}`
                          }}>
                            {dailyStatus[student.id] === 'BOARDING' ? '✓ Declared: Boarding Today' : '✕ Declared: Absent Today'}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          disabled={reportingStatus === `${student.id}_PARENT_BOARDING`}
                          onClick={() => reportDailyStatus(student.id, 'PARENT_BOARDING')}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 10,
                            border: dailyStatus[student.id] === 'BOARDING' ? '2px solid #30D158' : '1px solid rgba(48,209,88,0.3)',
                            background: dailyStatus[student.id] === 'BOARDING' ? 'rgba(48,209,88,0.2)' : 'rgba(48,209,88,0.08)',
                            color: '#30D158',
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6
                          }}
                        >
                          <span>🟢</span>
                          {reportingStatus === `${student.id}_PARENT_BOARDING` ? 'Updating…' : 'Boarding Today'}
                        </motion.button>

                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          disabled={reportingStatus === `${student.id}_PARENT_ABSENT_TODAY`}
                          onClick={() => reportDailyStatus(student.id, 'PARENT_ABSENT_TODAY')}
                          style={{
                            padding: '10px 14px',
                            borderRadius: 10,
                            border: dailyStatus[student.id] === 'ABSENT_TODAY' ? '2px solid #FF453A' : '1px solid rgba(255,69,58,0.3)',
                            background: dailyStatus[student.id] === 'ABSENT_TODAY' ? 'rgba(255,69,58,0.2)' : 'rgba(255,69,58,0.08)',
                            color: '#FF453A',
                            fontWeight: 700,
                            fontSize: 13,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6
                          }}
                        >
                          <span>🔴</span>
                          {reportingStatus === `${student.id}_PARENT_ABSENT_TODAY` ? 'Updating…' : 'Absent Today'}
                        </motion.button>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--hc-text-3, #6E6E7A)', marginTop: 8, textAlign: 'center' }}>
                        Driver will see this badge instantly on the manifest to know whether to stop for {student.name}.
                      </div>
                    </div>

                    {/* Two-Way Confirmation Action Buttons */}
                    {activeTrip && (
                      <div style={{ display:'flex', gap:10, paddingTop:6, borderTop:'1px solid var(--hc-line, #26262C)' }}>
                        <button
                          disabled={confirming === `pickup-${student.id}`}
                          onClick={async () => {
                            setConfirming(`pickup-${student.id}`)
                            try {
                              await fetch('/api/attendance', {
                                method:'POST', headers:{'Content-Type':'application/json'},
                                body:JSON.stringify({ tripId: activeTrip.id, studentId: student.id, action:'PARENT_PICKUP_CONFIRMED' })
                              })
                              playHorn()
                            } catch { /* silent */ } finally { setConfirming(null) }
                          }}
                          className="parent-btn-secondary"
                          style={{ flex:1, borderColor:'rgba(47,209,107,0.3)', color:'#2FD16B' }}>
                          {confirming === `pickup-${student.id}` ? 'Confirming…' : `✓ ${t('parent.confirmBoarded')}`}
                        </button>
                        <button
                          disabled={confirming === `dropoff-${student.id}`}
                          onClick={async () => {
                            setConfirming(`dropoff-${student.id}`)
                            try {
                              await fetch('/api/attendance', {
                                method:'POST', headers:{'Content-Type':'application/json'},
                                body:JSON.stringify({ tripId: activeTrip.id, studentId: student.id, action:'PARENT_DROPOFF_CONFIRMED' })
                              })
                              playHorn()
                            } catch { /* silent */ } finally { setConfirming(null) }
                          }}
                          className="parent-btn-secondary"
                          style={{ flex:1, borderColor:'rgba(77,141,255,0.3)', color:'#4D8DFF' }}>
                          {confirming === `dropoff-${student.id}` ? 'Confirming…' : `🏠 ${t('parent.confirmDropoff')}`}
                        </button>
                      </div>
                    )}
                  </div>
                ))}

                {/* School Broadcasts / Announcements Feed */}
                <div className="parent-card">
                  <div className="parent-card-header">
                    <div className="parent-card-title">
                      <Bell size={18} color="#FFD60A" /> School Notices & Broadcasts
                    </div>
                    <span className="parent-badge parent-badge-warning">{announcements.length} Notices</span>
                  </div>

                  {announcements.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--hc-text-3, #6E6E7A)', fontSize: 13 }}>
                      No active announcements from school administration.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {announcements.map(ann => (
                        <div
                          key={ann.id}
                          style={{
                            padding: '14px 16px',
                            background: 'var(--hc-surface-2, #1C1C21)',
                            borderRadius: 12,
                            borderLeft: `4px solid ${ann.type === 'EMERGENCY' ? '#FF453A' : ann.type === 'WEATHER' ? '#0A84FF' : '#FFD60A'}`
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontWeight: 700, fontSize: 14, color: '#FFFFFF' }}>{ann.title}</span>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 4,
                                background: ann.type === 'EMERGENCY' ? 'rgba(255,69,58,0.15)' : 'rgba(255,214,10,0.15)',
                                color: ann.type === 'EMERGENCY' ? '#FF453A' : '#FFD60A'
                              }}>
                                {ann.type}
                              </span>
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--hc-text-3, #6E6E7A)' }}>
                              {new Date(ann.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--hc-text-2, #A6A6B2)', lineHeight: 1.5 }}>
                            {ann.body}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--hc-text-3, #6E6E7A)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>Notice by: <strong style={{ color: '#FFF' }}>{ann.senderName || 'School Administration'}</strong></span>
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

                {/* Live Driver & GPS Telemetry Card */}
                {activeDriver && (
                  <div className="parent-card">
                    <div className="parent-card-header">
                      <div className="parent-card-title">
                        <Navigation size={18} color="#FFD60A"/> Live Bus Telemetry
                      </div>
                      <span className={`parent-badge ${activeDriver.lastLatitude ? 'parent-badge-success' : 'parent-badge-neutral'}`}>
                        {activeDriver.lastLatitude ? '● Live Telemetry' : '○ Offline'}
                      </span>
                    </div>

                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16, marginBottom:16 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ width:44, height:44, borderRadius:12, background:'var(--hc-surface-2, #1C1C21)', border:'1px solid var(--hc-line, #26262C)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>
                          🧑‍✈️
                        </div>
                        <div>
                          <div style={{ fontSize:15, fontWeight:700, color:'#FFFFFF' }}>{activeDriver.name}</div>
                          <div style={{ fontSize:12, color:'var(--hc-text-2, #A6A6B2)' }}>
                            {t('parent.assignedDriver')} {activeDriver.phone ? `· ${activeDriver.phone}` : ''}
                          </div>
                        </div>
                      </div>
                      {activeDriver.phone && (
                        <a href={`tel:${activeDriver.phone}`} className="parent-btn-secondary" style={{ padding:'8px 14px', fontSize:13 }}>
                          <Phone size={14}/> Call Driver
                        </a>
                      )}
                    </div>

                    {/* Telemetry Stats Grid */}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10, textAlign:'center' }}>
                      <div style={{ background:'var(--hc-surface-2, #1C1C21)', padding:'12px', borderRadius:12 }}>
                        <div style={{ fontSize:18, fontWeight:800, color:'#FFD60A' }}>
                          {activeDriver.currentSpeedKmH ? `${Math.round(activeDriver.currentSpeedKmH)} km/h` : '—'}
                        </div>
                        <div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)', marginTop:2 }}>Current Speed</div>
                      </div>
                      <div style={{ background:'var(--hc-surface-2, #1C1C21)', padding:'12px', borderRadius:12 }}>
                        <div style={{ fontSize:18, fontWeight:800, color:'#2FD16B' }}>
                          {activeDriver.etaMins != null ? `~${activeDriver.etaMins} mins` : 'Calculating'}
                        </div>
                        <div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)', marginTop:2 }}>Estimated Arrival</div>
                      </div>
                      <div style={{ background:'var(--hc-surface-2, #1C1C21)', padding:'12px', borderRadius:12 }}>
                        <div style={{ fontSize:18, fontWeight:800, color:'#4D8DFF' }}>
                          {activeDriver.distanceKm != null ? `${activeDriver.distanceKm.toFixed(1)} km` : '—'}
                        </div>
                        <div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)', marginTop:2 }}>Distance to School</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Academic Calendar Widget */}
                <div>
                  <CalendarCard />
                </div>
              </div>

              {/* ── RIGHT SIDEBAR COLUMN ── */}
              <div style={{ display:'flex', flexDirection:'column', gap:24 }}>


                {/* Digital Boarding Pass */}
                <div className="parent-card" style={{ textAlign:'center', background:'linear-gradient(145deg, #141417, #1C1C21)' }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--hc-text-3, #6E6E7A)', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                    Digital Boarding Pass
                  </div>
                  <div style={{ fontFamily:'var(--hc-mono, monospace)', fontSize:28, fontWeight:800, letterSpacing:'4px', color:'#FFD60A', margin:'12px 0' }}>
                    {(primaryStudent?.id || 'PASS').slice(0,8).toUpperCase()}
                  </div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#FFFFFF' }}>{primaryStudent?.name || 'Student'}</div>
                  <div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)', marginTop:2 }}>Show this token to driver for boarding verification</div>
                </div>

                {/* Weekly Attendance Stats Snapshot */}
                <div className="parent-card">
                  <div className="parent-card-header">
                    <div className="parent-card-title">
                      <Clock size={16} color="#FFD60A"/> Transit Activity
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, textAlign:'center' }}>
                    {[
                      { val: notifications.filter(n => n.type === 'INFO').length, label:'Arrived', color:'#2FD16B' },
                      { val: notifications.filter(n => n.type === 'WARNING').length, label:'Notice', color:'#FF9F0A' },
                      { val: notifications.filter(n => n.type === 'EMERGENCY').length, label:'Alert', color:'#FF453A' },
                      { val: notifications.length, label:'Total', color:'var(--hc-text-2, #A6A6B2)' },
                    ].map(({ val, label, color }) => (
                      <div key={label} style={{ background:'var(--hc-surface-2, #1C1C21)', padding:'10px 6px', borderRadius:10 }}>
                        <div style={{ fontSize:18, fontWeight:800, color }}>{val}</div>
                        <div style={{ fontSize:10, color:'var(--hc-text-3, #6E6E7A)', marginTop:2 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rate Last Ride */}
                <div className="parent-card" style={{ textAlign:'center' }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#FFFFFF', marginBottom:8 }}>Rate Your Last Ride</div>
                  <div style={{ fontSize:12, color:'var(--hc-text-2, #A6A6B2)', marginBottom:12 }}>How was your child&apos;s trip today?</div>
                  <div style={{ display:'flex', justifyContent:'center', gap:8 }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <motion.button key={star} whileHover={{ scale:1.25 }} whileTap={{ scale:0.9 }}
                        onClick={async () => {
                          const res = await fetch('/api/ratings', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tripId: 'latest', rating: star }) })
                          if (res.ok) alert(`Thank you! You rated ${star} stars.`)
                          else { const d = await res.json(); alert(d.error || 'Already rated') }
                        }}
                        style={{ background:'none', border:'none', fontSize:24, cursor:'pointer' }}>
                        ⭐
                      </motion.button>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 2: MY CHILD
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'MY_CHILD' && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.25 }} style={{ maxWidth:840, margin:'0 auto' }}>
            {students.map(student => (
              <div key={student.id} style={{ display:'flex', flexDirection:'column', gap:20 }}>
                
                {/* ID Header Card */}
                <div className="parent-card" style={{ background:'linear-gradient(135deg, #141417, #1C1C21)', border:'1px solid var(--hc-line-strong, #3A3A43)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:18 }}>
                    <div style={{ width:68, height:68, borderRadius:16, background:'linear-gradient(135deg,#FFD60A,#F5A623)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:800, color:'#08080A', flexShrink:0 }}>
                      {student.name.charAt(0)}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:'#FFFFFF' }}>{student.name}</h2>
                        <span className="parent-badge parent-badge-success">{student.status === 'CHECKED_OUT' ? 'Checked In' : 'En Route'}</span>
                      </div>
                      <div style={{ fontSize:14, color:'var(--hc-text-2, #A6A6B2)', marginTop:4 }}>
                        {student.grade} · {student.level} · Student ID: STU-{student.id.slice(-6).toUpperCase()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Details Breakdown */}
                <div className="parent-card">
                  <div className="parent-card-header">
                    <div className="parent-card-title"><Clipboard size={18} color="#FFD60A"/> Student Profile Details</div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:16 }}>
                    <div>
                      <div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)', fontWeight:600, textTransform:'uppercase' }}>Primary Guardian</div>
                      <div style={{ fontSize:14, fontWeight:600, color:'#FFFFFF', marginTop:3 }}>{student.parentContact1 || '—'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)', fontWeight:600, textTransform:'uppercase' }}>Transport Mode</div>
                      <div style={{ fontSize:14, fontWeight:600, color:'#FFFFFF', marginTop:3 }}>{student.isSelfPickup ? 'Self-Pickup' : 'School Fleet Bus'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)', fontWeight:600, textTransform:'uppercase' }}>Designated Route</div>
                      <div style={{ fontSize:14, fontWeight:600, color:'#FFFFFF', marginTop:3 }}>{student.route?.name || 'Default Route'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)', fontWeight:600, textTransform:'uppercase' }}>Pickup Stop</div>
                      <div style={{ fontSize:14, fontWeight:600, color:'#FFFFFF', marginTop:3 }}>{student.pickupStop?.name || 'Main Gate'}</div>
                    </div>
                  </div>
                </div>

                {/* Activity Feed */}
                <div className="parent-card">
                  <div className="parent-card-header">
                    <div className="parent-card-title"><Clock size={18} color="#FFD60A"/> Recent Transit Timeline</div>
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ textAlign:'center', color:'var(--hc-text-3, #6E6E7A)', padding:24 }}>No activity records available yet.</div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                      {notifications.slice(0, 5).map(n => (
                        <div key={n.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 14px', background:'var(--hc-surface-2, #1C1C21)', borderRadius:12 }}>
                          <div style={{ width:34, height:34, borderRadius:8, background:'rgba(255,214,10,0.1)', color:'#FFD60A', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            {n.type === 'EMERGENCY' ? <AlertTriangle size={18} color="#FF453A"/> : <CheckCircle size={18} color="#2FD16B"/>}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:14, fontWeight:600, color:'#FFFFFF' }}>{n.title}</div>
                            <div style={{ fontSize:12, color:'var(--hc-text-2, #A6A6B2)', marginTop:2 }}>{n.body}</div>
                          </div>
                          <div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)', flexShrink:0 }}>
                            {new Date(n.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            ))}
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 3: MESSAGES
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'MESSAGES' && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.25 }} style={{ maxWidth:840, margin:'0 auto', display:'flex', flexDirection:'column', gap:20 }}>
            <AnimatePresence>
              {msgToast && (
                <motion.div initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                  style={{ padding:'12px 16px', background:'rgba(47,209,107,0.15)', border:'1px solid rgba(47,209,107,0.4)', borderRadius:12, color:'#2FD16B', fontWeight:600, fontSize:14 }}>
                  {msgToast}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Compose Message Box */}
            <div className="parent-card">
              <div className="parent-card-header">
                <div className="parent-card-title"><MessageSquare size={18} color="#FFD60A"/> Send Message</div>
              </div>
              <div style={{ marginBottom:12 }}>
                <div style={{ fontSize:12, color:'var(--hc-text-3, #6E6E7A)', marginBottom:6, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.04em' }}>To</div>
                <RecipientPicker
                  value={msgRecipientId}
                  onChange={(id) => setMsgRecipientId(id)}
                  placeholder="Select Admin, School Admin, or Driver…"
                />
              </div>
              <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
                {['Child is sick today', 'Running 5 minutes late', 'Parent pickup today', 'Lost bottle on bus'].map(preset => (
                  <button key={preset} onClick={() => setMsgContent(preset)} style={{ background:'var(--hc-surface-2, #1C1C21)', border:'1px solid var(--hc-line, #26262C)', color:'var(--hc-text-2, #A6A6B2)', borderRadius:9999, padding:'4px 12px', fontSize:12, cursor:'pointer' }}>
                    + {preset}
                  </button>
                ))}
              </div>
              <textarea
                rows={4}
                value={msgContent}
                onChange={e => setMsgContent(e.target.value)}
                placeholder="Type your message…"
                style={{ width:'100%', background:'var(--hc-surface-2, #1C1C21)', border:'1px solid var(--hc-line, #26262C)', borderRadius:12, padding:'14px', color:'#FFFFFF', fontSize:14, outline:'none', resize:'none', fontFamily:'inherit' }}
              />
              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}>
                <button onClick={sendMessage} disabled={sending || !msgRecipientId} className="parent-btn-primary">
                  <Send size={15}/> {sending ? 'Sending…' : 'Send Message'}
                </button>
              </div>
            </div>

            {/* Inbox Thread */}
            <div className="parent-card">
              <div className="parent-card-header">
                <div className="parent-card-title"><Clock size={16} color="#FFD60A"/> Conversation History</div>
              </div>
              {messages.length === 0 ? (
                <div style={{ textAlign:'center', color:'var(--hc-text-3, #6E6E7A)', padding:32 }}>No communications yet.</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {messages.map(m => (
                    <div key={m.id} style={{ padding:'14px 16px', background:'var(--hc-surface-2, #1C1C21)', borderRadius:14, borderLeft:'3px solid #FFD60A' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                        <span style={{ fontSize:13, fontWeight:700, color:'#FFFFFF' }}>{m.sender?.name || 'School Admin'}</span>
                        <span style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)' }}>{new Date(m.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontSize:14, color:'var(--hc-text-2, #A6A6B2)', lineHeight:1.5 }}>{m.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 3.5: PAYMENT
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'PAYMENT' && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.25 }} style={{ maxWidth:840, margin:'0 auto', display:'flex', flexDirection:'column', gap:20 }}>
            <div className="parent-card">
              <div className="parent-card-header">
                <div className="parent-card-title"><Receipt size={18} color="#FFD60A"/> My Payments</div>
              </div>
              <PaymentSection />
            </div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            TAB 4: PROFILE & SETTINGS
           ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'PROFILE' && (
          <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.25 }} style={{ maxWidth:720, margin:'0 auto', display:'flex', flexDirection:'column', gap:20 }}>
            {/* User Account Overview */}
            <div className="parent-card" style={{ textAlign:'center', padding:'32px 20px' }}>
              <div style={{ width:76, height:76, borderRadius:'50%', background:'linear-gradient(135deg,#FFD60A,#F5A623)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, fontWeight:800, color:'#08080A', margin:'0 auto 16px', boxShadow:'0 0 24px rgba(255,214,10,0.3)' }}>
                {me?.name ? me.name.charAt(0).toUpperCase() : 'P'}
              </div>
              <h2 style={{ margin:0, fontSize:22, fontWeight:800, color:'#FFFFFF' }}>{me?.name || 'Parent Guardian'}</h2>
              <div style={{ fontSize:14, color:'var(--hc-text-2, #A6A6B2)', marginTop:4 }}>{me?.email}</div>
              <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:12 }}>
                <span className="parent-badge parent-badge-warning">VERIFIED GUARDIAN</span>
                <span className="parent-badge parent-badge-neutral">{schoolName}</span>
              </div>
            </div>

            {/* Settings Options List */}
            <div className="parent-card" style={{ padding:0, overflow:'hidden' }}>
              {[
                { icon:<User size={18}/>, title:'Account Information', desc:'View your registered contact info', action:() => setProfilePanel(p => p === 'INFO' ? null : 'INFO') },
                { icon:<Globe size={18}/>, title:'Language Preferences', desc:'English, Bahasa Malaysia, 中文', action:() => setProfilePanel(p => p === 'LANG' ? null : 'LANG') },
                { icon:<HelpCircle size={18}/>, title:'Help & Support', desc:'Contact transport dispatch office', action:() => setProfilePanel(p => p === 'HELP' ? null : 'HELP') },
              ].map((item, idx) => (
                <div key={item.title} onClick={item.action} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'18px 20px', borderBottom: idx < 2 ? '1px solid var(--hc-line, #26262C)' : 'none', cursor:'pointer' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:'var(--hc-surface-2, #1C1C21)', display:'flex', alignItems:'center', justifyContent:'center', color:'#FFD60A' }}>
                      {item.icon}
                    </div>
                    <div>
                      <div style={{ fontSize:15, fontWeight:600, color:'#FFFFFF' }}>{item.title}</div>
                      <div style={{ fontSize:12, color:'var(--hc-text-3, #6E6E7A)' }}>{item.desc}</div>
                    </div>
                  </div>
                  <ChevronRight size={18} color="var(--hc-text-3, #6E6E7A)"/>
                </div>
              ))}
            </div>

            {/* Profile Drawer: Info */}
            {profilePanel === 'INFO' && (
              <div className="parent-card">
                <h4 style={{ margin:'0 0 14px 0', fontSize:15, color:'#FFFFFF' }}>Account Details</h4>
                <div style={{ display:'grid', gap:12 }}>
                  <div><div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)' }}>NAME</div><div style={{ fontSize:14, fontWeight:600 }}>{me?.name}</div></div>
                  <div><div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)' }}>EMAIL</div><div style={{ fontSize:14 }}>{me?.email}</div></div>
                  {me?.phone && <div><div style={{ fontSize:11, color:'var(--hc-text-3, #6E6E7A)' }}>PHONE</div><div style={{ fontSize:14 }}>{me?.phone}</div></div>}
                </div>
              </div>
            )}

            {/* Profile Drawer: Language */}
            {profilePanel === 'LANG' && (
              <div className="parent-card">
                <h4 style={{ margin:'0 0 14px 0', fontSize:15, color:'#FFFFFF' }}>Choose Language</h4>
                <div style={{ display:'flex', gap:10 }}>
                  {[
                    { code:'en' as const, label:'English' },
                    { code:'ms' as const, label:'Bahasa Malaysia' },
                    { code:'zh' as const, label:'中文' },
                  ].map(l => (
                    <button key={l.code} onClick={() => setLocale(l.code)} className={locale === l.code ? 'parent-btn-primary' : 'parent-btn-secondary'} style={{ flex:1, padding:'10px' }}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Profile Drawer: Help */}
            {profilePanel === 'HELP' && (
              <div className="parent-card">
                <h4 style={{ margin:'0 0 10px 0', fontSize:15, color:'#FFFFFF' }}>School Dispatch Support</h4>
                <p style={{ fontSize:13, color:'var(--hc-text-2, #A6A6B2)', lineHeight:1.6, margin:0 }}>
                  Need urgent help with pickup schedules, driver contacts, or routing changes? Send a direct message in the <strong>Messages</strong> tab or contact your school transport administration office.
                </p>
              </div>
            )}

            {/* Logout Action */}
            <button onClick={handleLogout} className="parent-btn-secondary" style={{ borderColor:'rgba(255,69,58,0.4)', color:'#FF453A', padding:'14px', borderRadius:14, fontWeight:700 }}>
              <LogOut size={16}/> Sign Out of RideSafe
            </button>
          </motion.div>
        )}

      </main>

      {/* ── Mobile Floating Bottom Bar ──────────────────────────────────────── */}
      <nav className="parent-mobile-bottom-nav">
        {[
          { key:'HOME', label: t('nav.home'), icon: Home },
          { key:'MY_CHILD', label: t('parent.myChildren'), icon: User },
          { key:'MESSAGES', label: t('nav.messages'), icon: MessageSquare },
          { key:'PROFILE', label: t('nav.profile'), icon: Settings },
        ].map(item => {
          const isActive = activeTab === item.key
          return (
            <button key={item.key} onClick={() => setActiveTab(item.key as any)} className={`parent-mobile-nav-item ${isActive ? 'active' : ''}`}>
              <item.icon size={20}/>
              <span>{item.label}</span>
            </button>
          )
        })}
      </nav>

    </div>
  )
}
