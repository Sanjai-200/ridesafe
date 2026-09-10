'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from '@/i18n/provider'
import { Megaphone, Send, Bell, AlertTriangle, ShieldAlert, CheckCircle, Info, Clock, Users, Globe } from 'lucide-react'

interface Announcement {
  id: string
  title: string
  body: string
  targetRole: string
  type: string
  sentCount: number
  createdAt: string
  senderName?: string
  senderRole?: string
}

export default function SuperAdminAnnouncementsTab() {
  const { t } = useTranslation()
  const [form, setForm] = useState({ title: '', body: '', targetRole: 'ALL', type: 'INFO' })
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [past, setPast] = useState<Announcement[]>([])
  const [loadingPast, setLoadingPast] = useState(true)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const loadPast = () => {
    fetch('/api/announcements')
      .then(r => r.json())
      .then(d => {
        setPast(d.announcements || [])
        setLoadingPast(false)
      })
      .catch(() => setLoadingPast(false))
  }

  useEffect(() => { loadPast() }, [])

  const handleSend = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      showToast('Announcement Title and Message are required', 'error')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await res.json()
      if (res.ok) {
        showToast(`Announcement broadcasted to ${data.sent} active users!`, 'success')
        setForm({ title: '', body: '', targetRole: 'ALL', type: 'INFO' })
        loadPast()
      } else {
        showToast(data.error || 'Failed to broadcast announcement', 'error')
      }
    } catch {
      showToast('Network error broadcasting announcement', 'error')
    } finally {
      setSending(false)
    }
  }

  const roles = [
    { value: 'ALL', label: '🌐 All Users Platform-wide' },
    { value: 'PARENT', label: '👨‍👩‍👧 Parents Only' },
    { value: 'DRIVER', label: '🚌 Drivers Only' },
    { value: 'SCHOOL_ADMIN', label: '🏫 School Admins' },
    { value: 'ADMIN', label: '⚙️ Transport Admins' },
  ]

  const types = [
    { value: 'INFO', label: 'ℹ️ General Notice', color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.15)' },
    { value: 'WARNING', label: '⚠️ Urgent Warning', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' },
    { value: 'EMERGENCY', label: '🚨 Emergency Alert', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' },
  ]

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed',
              top: 24,
              right: 24,
              zIndex: 9999,
              padding: '12px 20px',
              borderRadius: 12,
              background: toast.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
              border: `1px solid ${toast.type === 'error' ? '#EF4444' : '#22C55E'}`,
              color: '#FFF',
              fontWeight: 700,
              fontSize: 14,
              backdropFilter: 'blur(12px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}
          >
            {toast.type === 'error' ? <AlertTriangle size={18} color="#EF4444" /> : <CheckCircle size={18} color="#22C55E" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Broadcast Form Card */}
      <div style={{
        background: '#141417',
        border: '1px solid #26262C',
        borderRadius: 16,
        padding: '24px',
        maxWidth: 800
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'linear-gradient(135deg,#FFD60A,#F5A623)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#08080A'
          }}>
            <Megaphone size={22} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#FFF' }}>Super Admin Broadcast Center</h2>
            <div style={{ fontSize: 12, color: '#A6A6B2', marginTop: 2 }}>
              Broadcast instant push alerts and announcements across all schools, parents, drivers, and transport administrators.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Title */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#FFF', marginBottom: 6 }}>
              Announcement Title *
            </label>
            <input
              type="text"
              placeholder="e.g., Severe Weather Alert — Early Dismissal & Bus Schedules"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                background: '#0E0E11',
                border: '1px solid #26262C',
                color: '#FFF',
                fontSize: 14,
                outline: 'none'
              }}
            />
          </div>

          {/* Body */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#FFF', marginBottom: 6 }}>
              Broadcast Message Content *
            </label>
            <textarea
              rows={4}
              placeholder="Type your official announcement here. This will be delivered to the target users' notification feed in real-time."
              value={form.body}
              onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 10,
                background: '#0E0E11',
                border: '1px solid #26262C',
                color: '#FFF',
                fontSize: 14,
                outline: 'none',
                resize: 'vertical',
                minHeight: 110,
                lineHeight: 1.5
              }}
            />
          </div>

          {/* Target Audience */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#FFF', marginBottom: 8 }}>
              Target Audience
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {roles.map(r => {
                const active = form.targetRole === r.value
                return (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, targetRole: r.value }))}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      border: active ? '1px solid #FFD60A' : '1px solid #26262C',
                      background: active ? 'rgba(255, 214, 10, 0.15)' : 'rgba(255,255,255,0.03)',
                      color: active ? '#FFD60A' : '#A6A6B2',
                      transition: 'all 0.2s'
                    }}
                  >
                    {r.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Priority / Type */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#FFF', marginBottom: 8 }}>
              Priority / Urgency
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {types.map(t => {
                const active = form.type === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setForm(p => ({ ...p, type: t.value }))}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      border: `1px solid ${active ? t.color : '#26262C'}`,
                      background: active ? t.bg : 'rgba(255,255,255,0.03)',
                      color: active ? t.color : '#A6A6B2',
                      transition: 'all 0.2s'
                    }}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Action button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              disabled={sending}
              onClick={handleSend}
              style={{
                background: '#FFD60A',
                color: '#08080A',
                border: 'none',
                padding: '12px 28px',
                borderRadius: 10,
                fontWeight: 800,
                fontSize: 14,
                cursor: sending ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 4px 20px rgba(255,214,10,0.3)'
              }}
            >
              <Send size={16} />
              {sending ? 'Broadcasting to Network…' : 'Broadcast Announcement Now'}
            </motion.button>
          </div>
        </div>
      </div>

      {/* Past Announcements Feed */}
      <div style={{
        background: '#141417',
        border: '1px solid #26262C',
        borderRadius: 16,
        padding: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#FFF', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Clock size={16} color="#FFD60A" /> Past Platform Broadcasts ({past.length})
          </h3>
          <button
            onClick={loadPast}
            style={{ background: 'none', border: 'none', color: '#FFD60A', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            ↻ Refresh
          </button>
        </div>

        {loadingPast ? (
          <div style={{ color: '#A6A6B2', fontSize: 13, textAlign: 'center', padding: '2rem' }}>Loading broadcast log…</div>
        ) : past.length === 0 ? (
          <div style={{ color: '#6E6E7A', fontSize: 13, textAlign: 'center', padding: '2.5rem' }}>
            No broadcasts sent yet. Use the form above to send your first platform-wide announcement.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {past.map(a => {
              const badgeType = a.type === 'EMERGENCY' ? { color: '#EF4444', bg: 'rgba(239,68,68,0.15)', label: 'Emergency' }
                : a.type === 'WARNING' ? { color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', label: 'Warning' }
                : { color: '#3B82F6', bg: 'rgba(59,130,246,0.15)', label: 'Info' }

              return (
                <div
                  key={a.id}
                  style={{
                    background: '#0E0E11',
                    border: '1px solid #26262C',
                    borderRadius: 12,
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#FFF' }}>{a.title}</span>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          color: badgeType.color,
                          background: badgeType.bg
                        }}>
                          {badgeType.label}
                        </span>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#A6A6B2',
                          background: 'rgba(255,255,255,0.05)'
                        }}>
                          Audience: {a.targetRole}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6E6E7A', marginTop: 3 }}>
                        {new Date(a.createdAt).toLocaleString()} {a.senderName ? `· Sent by ${a.senderName} (${a.senderRole || 'SUPER_ADMIN'})` : ''}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: '#22C55E', fontWeight: 700, background: 'rgba(34,197,94,0.1)', padding: '4px 10px', borderRadius: 8 }}>
                      ✓ {a.sentCount} delivered
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#D1D1D6', lineHeight: 1.5, marginTop: 4 }}>
                    {a.body}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

    </motion.div>
  )
}
