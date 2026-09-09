'use client'
import { useState, useEffect } from 'react'
import { ChevronDown, User, Shield, School, Truck } from 'lucide-react'

interface Contact {
  id: string
  name: string
  role: string
  phone?: string | null
}

interface RecipientPickerProps {
  value: string
  onChange: (contactId: string, contact: Contact | null) => void
  placeholder?: string
}

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: typeof User }> = {
  ADMIN:        { label: 'Transport Admin', color: '#60a5fa', icon: Truck },
  SCHOOL_ADMIN: { label: 'School Admin',    color: '#a78bfa', icon: School },
  DRIVER:       { label: 'Driver',          color: '#34d399', icon: Truck },
  SUPER_ADMIN:  { label: 'Super Admin',     color: '#FFD60A', icon: Shield },
}

export default function RecipientPicker({ value, onChange, placeholder = 'Select recipient…' }: RecipientPickerProps) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/messages/contacts')
      .then(r => r.json())
      .then(data => { setContacts(data.contacts || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const selected = contacts.find(c => c.id === value) || null

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--surface-bg, rgba(255,255,255,0.04))',
          border: '1px solid var(--surface-border)', borderRadius: 10,
          padding: '0.6rem 0.875rem', cursor: 'pointer', color: 'var(--text-primary)',
          textAlign: 'left', fontSize: '0.875rem',
        }}
      >
        {selected ? (
          <>
            {(() => {
              const cfg = ROLE_CONFIG[selected.role] || ROLE_CONFIG.ADMIN
              const Icon = cfg.icon
              return <Icon size={15} style={{ color: cfg.color, flexShrink: 0 }} />
            })()}
            <span style={{ flex: 1 }}>{selected.name}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
              {ROLE_CONFIG[selected.role]?.label || selected.role}
            </span>
          </>
        ) : (
          <span style={{ flex: 1, color: 'var(--text-muted)' }}>{loading ? 'Loading contacts…' : placeholder}</span>
        )}
        <ChevronDown size={14} style={{ color: 'var(--text-muted)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'var(--surface-bg, #141417)',
          border: '1px solid var(--surface-border)',
          borderRadius: 10, marginTop: 4,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}>
          {contacts.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
              No contacts available
            </div>
          ) : contacts.map(c => {
            const cfg = ROLE_CONFIG[c.role] || { label: c.role, color: '#a0a0a0', icon: User }
            const Icon = cfg.icon
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id, c); setOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0.65rem 0.875rem',
                  background: c.id === value ? 'rgba(255,214,10,0.08)' : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  color: 'var(--text-primary)', fontSize: '0.875rem',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <Icon size={15} style={{ color: cfg.color, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{c.name}</span>
                <span style={{ fontSize: '0.72rem', color: cfg.color, fontWeight: 600, flexShrink: 0 }}>
                  {cfg.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
