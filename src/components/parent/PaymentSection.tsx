'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Receipt, Clock, CheckCircle, AlertCircle, FileText } from 'lucide-react'

interface Invoice {
  id: string
  amount: number
  status: string // PENDING | PAID
  description?: string
  dueDate?: string
  paidAt?: string
  createdAt: string
  invoiceUrl?: string
}

interface PaymentSectionProps {
  parentId?: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  PAID:    { label: 'Paid',    color: '#22c55e', icon: CheckCircle },
  PENDING: { label: 'Pending', color: '#FFD60A', icon: Clock },
  FAILED:  { label: 'Failed',  color: '#ef4444', icon: AlertCircle },
}

export default function PaymentSection({ parentId }: PaymentSectionProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const url = parentId ? `/api/billing/${parentId}` : '/api/billing/me'
    fetch(url)
      .then(r => r.json())
      .then(data => {
        setInvoices(data.payments || data.invoices || [])
        setLoading(false)
      })
      .catch(() => { setError('Failed to load invoices.'); setLoading(false) })
  }, [parentId])

  const totalPending = invoices.filter(i => i.status === 'PENDING').reduce((s, i) => s + i.amount, 0)
  const totalPaid    = invoices.filter(i => i.status === 'PAID').reduce((s, i) => s + i.amount, 0)

  if (loading) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
      Loading invoices…
    </div>
  )

  if (error) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>{error}</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div style={{ background: 'rgba(255,214,10,0.08)', border: '1px solid rgba(255,214,10,0.2)', borderRadius: 12, padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Amount Due</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FFD60A' }}>RM {totalPending.toFixed(2)}</div>
        </div>
        <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '1rem 1.25rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Total Paid</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#22c55e' }}>RM {totalPaid.toFixed(2)}</div>
        </div>
      </div>

      {/* Invoice List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {invoices.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid var(--surface-border)' }}>
            <Receipt size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>No invoices yet.</div>
          </div>
        ) : invoices.map((inv, i) => {
          const cfg = STATUS_CONFIG[inv.status] || STATUS_CONFIG.PENDING
          const StatusIcon = cfg.icon
          return (
            <motion.div
              key={inv.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--surface-border)',
                borderRadius: 12,
                padding: '1rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <div style={{ width: 38, height: 38, borderRadius: 10, background: `rgba(${cfg.color === '#22c55e' ? '34,197,94' : cfg.color === '#FFD60A' ? '255,214,10' : '239,68,68'},0.12)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FileText size={18} style={{ color: cfg.color }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', truncate: 'true' }}>
                  {inv.description || `Invoice #${inv.id.slice(-6).toUpperCase()}`}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {inv.dueDate ? `Due: ${new Date(inv.dueDate).toLocaleDateString()}` : `Issued: ${new Date(inv.createdAt).toLocaleDateString()}`}
                  {inv.paidAt && ` · Paid: ${new Date(inv.paidAt).toLocaleDateString()}`}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>RM {inv.amount.toFixed(2)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', marginTop: 2 }}>
                  <StatusIcon size={13} style={{ color: cfg.color }} />
                  <span style={{ fontSize: '0.75rem', color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Info footer — no payment button per design decision */}
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
        💳 To make a payment, please contact your school admin. Online payment will be available soon.
      </div>
    </div>
  )
}
