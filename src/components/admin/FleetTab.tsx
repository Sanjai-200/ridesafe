'use client'
import { useState, useEffect, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertTriangle, Bus, Plus, Pencil, Trash2, MapPin, Settings2, X, Navigation } from 'lucide-react'
import { useTranslation } from '@/i18n/provider'

// Lazy load MapPicker (Leaflet requires browser/window)
const MapPicker = lazy(() => import('@/components/shared/MapPicker'))

interface LatLng { lat: number; lng: number }
interface StopDraft { name: string; coords: LatLng | null }

const defaultBusForm = { plateNumber: '', capacity: '30', driverId: '', routeId: '', wialonUnitId: '', katsanaVehicleId: '' }
const defaultRouteForm = {
    name: '', morningTime: '7:30 AM', afternoonTime: '3:00 PM',
    startPointName: '', startCoords: null as LatLng | null,
    endPointName: '', endCoords: null as LatLng | null,
    stops: [] as StopDraft[],
}

export default function FleetTab({ searchQuery = '' }: { searchQuery?: string }) {
    const { t } = useTranslation()
    const [buses, setBuses] = useState<any[]>([])
    const [routes, setRoutes] = useState<any[]>([])
    const [drivers, setDrivers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
    const [routeStops, setRouteStops] = useState<any[]>([])
    const [newStop, setNewStop] = useState({ name: '', latitude: '', longitude: '' })

    const [showBusModal, setShowBusModal] = useState(false)
    const [showRouteModal, setShowRouteModal] = useState(false)
    const [editingBusId, setEditingBusId] = useState<string | null>(null)
    const [editingRouteId, setEditingRouteId] = useState<string | null>(null)
    const [deletingBusId, setDeletingBusId] = useState<string | null>(null)
    const [deletingRouteId, setDeletingRouteId] = useState<string | null>(null)
    // Track which stop map picker index is active
    const [activeStopMapIdx, setActiveStopMapIdx] = useState<number | null>(null)
    const [activeEndpointMap, setActiveEndpointMap] = useState<'start' | 'end' | null>(null)

    const [busForm, setBusForm] = useState(defaultBusForm)
    const [routeForm, setRouteForm] = useState(defaultRouteForm)

    const loadData = () => {
        Promise.all([
            fetch('/api/admin/buses').then(res => res.json()),
            fetch('/api/admin/routes').then(res => res.json()),
            fetch('/api/admin/users').then(res => res.json())
        ]).then(([busData, routeData, userData]) => {
            setBuses(busData.buses || [])
            setRoutes(routeData.routes || [])
            setDrivers((userData.users || []).filter((u: any) => u.role === 'DRIVER'))
            setLoading(false)
        }).catch(console.error)
    }

    useEffect(() => { loadData() }, [])

    const loadStops = async (routeId: string) => {
        const res = await fetch(`/api/stops?routeId=${routeId}`)
        const data = await res.json()
        setRouteStops(data.stops || [])
        setSelectedRouteId(routeId)
    }

    const handleAddStop = async () => {
        if (!newStop.name.trim() || !selectedRouteId) return
        try {
            const res = await fetch('/api/stops', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    routeId: selectedRouteId,
                    name: newStop.name,
                    latitude: parseFloat(newStop.latitude) || 0,
                    longitude: parseFloat(newStop.longitude) || 0,
                    order: routeStops.length + 1
                })
            })
            if (res.ok) {
                setNewStop({ name: '', latitude: '', longitude: '' })
                loadStops(selectedRouteId)
            }
        } catch (e) { console.error(e) }
    }

    const handleDeleteStop = async (stopId: string) => {
        if (!selectedRouteId) return
        if (!confirm('Remove this stop?')) return
        try {
            const res = await fetch(`/api/stops/${stopId}`, { method: 'DELETE' })
            if (res.ok) loadStops(selectedRouteId)
            else { const err = await res.json(); alert(err.error || 'Failed to remove stop') }
        } catch (e) { console.error(e) }
    }

    const openAddBusModal = () => { setEditingBusId(null); setBusForm(defaultBusForm); setShowBusModal(true) }

    const openEditBusModal = (b: any) => {
        setEditingBusId(b.id)
        setBusForm({
            plateNumber: b.plateNumber, capacity: String(b.capacity),
            driverId: b.driverId || b.driver?.id || '', routeId: b.routeId || b.route?.id || '',
            wialonUnitId: b.wialonUnitId || '', katsanaVehicleId: b.katsanaVehicleId || ''
        })
        setShowBusModal(true)
    }

    const handleAddBus = async (e: React.FormEvent) => {
        e.preventDefault()
        const cap = parseInt(busForm.capacity)
        if (!busForm.plateNumber.trim() || busForm.plateNumber.trim().length < 2) {
            alert('Please enter a valid plate number (min. 2 characters)'); return
        }
        if (isNaN(cap) || cap < 1 || cap > 200) {
            alert('Capacity must be a number between 1 and 200'); return
        }
        try {
            const payload = {
                plateNumber: busForm.plateNumber.toUpperCase().trim(),
                capacity: cap,
                driverId: busForm.driverId || null,
                routeId: busForm.routeId || null,
                wialonUnitId: busForm.wialonUnitId.trim() || null,
                katsanaVehicleId: busForm.katsanaVehicleId.trim() || null,
            }
            const res = editingBusId
                ? await fetch(`/api/admin/buses/${editingBusId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                : await fetch('/api/admin/buses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            if (res.ok) {
                setBusForm(defaultBusForm)
                setEditingBusId(null)
                setShowBusModal(false)
                loadData()
            } else {
                const err = await res.json()
                alert(err.error || (editingBusId ? 'Failed to update bus' : 'Failed to add bus'))
            }
        } catch (e) { console.error(e) }
    }

    const handleDeleteBus = async (b: any) => {
        if (!confirm(`Remove bus "${b.plateNumber}"? This cannot be undone.`)) return
        setDeletingBusId(b.id)
        try {
            const res = await fetch(`/api/admin/buses/${b.id}`, { method: 'DELETE' })
            if (res.ok) loadData()
            else { const err = await res.json(); alert(err.error || 'Failed to delete bus') }
        } catch (e) { console.error(e) } finally { setDeletingBusId(null) }
    }

    const openAddRouteModal = () => {
        setEditingRouteId(null)
        setRouteForm(defaultRouteForm)
        setActiveEndpointMap(null)
        setActiveStopMapIdx(null)
        setShowRouteModal(true)
    }

    const openEditRouteModal = (r: any) => {
        setEditingRouteId(r.id)
        setRouteForm({
            name: r.name,
            morningTime: r.morningTime || '',
            afternoonTime: r.afternoonTime || '',
            startPointName: r.startPointName || '',
            startCoords: (r.startLatitude && r.startLongitude) ? { lat: r.startLatitude, lng: r.startLongitude } : null,
            endPointName: r.endPointName || '',
            endCoords: (r.endLatitude && r.endLongitude) ? { lat: r.endLatitude, lng: r.endLongitude } : null,
            stops: [],
        })
        setActiveEndpointMap(null)
        setActiveStopMapIdx(null)
        setShowRouteModal(true)
    }

    const addStopDraft = () => {
        setRouteForm(f => ({ ...f, stops: [...f.stops, { name: '', coords: null }] }))
        setActiveStopMapIdx(routeForm.stops.length)
    }

    const removeStopDraft = (idx: number) => {
        setRouteForm(f => ({ ...f, stops: f.stops.filter((_, i) => i !== idx) }))
        if (activeStopMapIdx === idx) setActiveStopMapIdx(null)
    }

    const handleAddRoute = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!routeForm.name.trim() || routeForm.name.trim().length < 2) {
            alert('Route name must be at least 2 characters'); return
        }
        try {
            const payload: Record<string, unknown> = {
                name: routeForm.name,
                morningTime: routeForm.morningTime,
                afternoonTime: routeForm.afternoonTime,
                startPointName: routeForm.startPointName || null,
                startLatitude: routeForm.startCoords?.lat ?? null,
                startLongitude: routeForm.startCoords?.lng ?? null,
                endPointName: routeForm.endPointName || null,
                endLatitude: routeForm.endCoords?.lat ?? null,
                endLongitude: routeForm.endCoords?.lng ?? null,
            }

            // For new routes, include stops in the payload for bulk creation
            if (!editingRouteId && routeForm.stops.length > 0) {
                payload.stops = routeForm.stops
                    .filter(s => s.name.trim())
                    .map(s => ({ name: s.name, latitude: s.coords?.lat || 0, longitude: s.coords?.lng || 0 }))
            }

            const res = editingRouteId
                ? await fetch(`/api/admin/routes/${editingRouteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                : await fetch('/api/admin/routes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

            if (res.ok) {
                setRouteForm(defaultRouteForm)
                setEditingRouteId(null)
                setShowRouteModal(false)
                setActiveEndpointMap(null)
                setActiveStopMapIdx(null)
                loadData()
            } else {
                const err = await res.json()
                alert(err.error || (editingRouteId ? 'Failed to update route' : 'Failed to add route'))
            }
        } catch (e) { console.error(e) }
    }

    const handleDeleteRoute = async (r: any) => {
        if (!confirm(`Delete route "${r.name}"? This cannot be undone.`)) return
        setDeletingRouteId(r.id)
        try {
            const res = await fetch(`/api/admin/routes/${r.id}`, { method: 'DELETE' })
            if (res.ok) {
                if (selectedRouteId === r.id) setSelectedRouteId(null)
                loadData()
            } else { const err = await res.json(); alert(err.error || 'Failed to delete route') }
        } catch (e) { console.error(e) } finally { setDeletingRouteId(null) }
    }

    const q = searchQuery.trim().toLowerCase()
    const filteredBuses = q ? buses.filter(b => b.plateNumber?.toLowerCase().includes(q) || b.driver?.name?.toLowerCase().includes(q)) : buses
    const filteredRoutes = q ? routes.filter(r => r.name?.toLowerCase().includes(q)) : routes

    if (loading) return <div>Loading fleet...</div>

    return (
        <div style={{ display: 'grid', gap: '2rem', gridTemplateColumns: '1fr 1fr' }}>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0 }}>Fleet (Buses)</h3>
                    <button className="btn btn-primary" onClick={openAddBusModal}>+ Add Bus</button>
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                    {filteredBuses.map((b, i) => (
                        <div key={b.id} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong><span style={{ color: 'var(--text-muted)', fontWeight: 400, marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>{b.plateNumber}</strong>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <span className="badge" style={{ background: 'rgba(255,255,255,0.1)' }}>{b.status}</span>
                                    <button onClick={() => openEditBusModal(b)} title="Edit bus"
                                        style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '4px 7px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                                        <Pencil size={13} />
                                    </button>
                                    <button onClick={() => handleDeleteBus(b)} title="Delete bus" disabled={deletingBusId === b.id}
                                        style={{ background: 'none', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, padding: '4px 7px', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}>
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                                Capacity: {b.capacity} | Driver: {b.driver?.name || 'Unassigned'}
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel" style={{ padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0 }}>Routes</h3>
                    <button className="btn btn-primary" onClick={openAddRouteModal}>+ Add Route</button>
                </div>

                <div style={{ display: 'grid', gap: '1rem' }}>
                    {filteredRoutes.map((r, i) => (
                        <div key={r.id} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <strong><span style={{ color: 'var(--text-muted)', fontWeight: 400, marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>{r.name}</strong>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                    <button onClick={() => openEditRouteModal(r)} title="Edit route"
                                        style={{ background: 'none', border: '1px solid var(--surface-border)', borderRadius: 8, padding: '4px 7px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                                        <Pencil size={13} />
                                    </button>
                                    <button onClick={() => handleDeleteRoute(r)} title="Delete route" disabled={deletingRouteId === r.id}
                                        style={{ background: 'none', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, padding: '4px 7px', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}>
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Morning: {r.morningTime || 'N/A'} | Afternoon: {r.afternoonTime || 'N/A'}</span>
                                <button className="btn" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)' }} onClick={() => selectedRouteId === r.id ? setSelectedRouteId(null) : loadStops(r.id)}>
                                    {selectedRouteId === r.id ? 'Hide Stops' : 'Manage Stops'}
                                </button>
                            </div>
                            {/* Route geo info pill */}
                            {(r.startPointName || r.endPointName) && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem', display: 'flex', gap: 8 }}>
                                    {r.startPointName && <span>🟢 {r.startPointName}</span>}
                                    {r.endPointName && <span>🔴 {r.endPointName}</span>}
                                    <span>·  {(r.stops || r._count?.stops || 0)} stops</span>
                                </div>
                            )}

                            <AnimatePresence>
                                {selectedRouteId === r.id && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginTop: '1rem', borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
                                        <h4 style={{ margin: '0 0 1rem 0' }}>Route Stops</h4>
                                        {routeStops.map((s, idx) => (
                                            <div key={s.id} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>{idx + 1}</div>
                                                <div style={{ flex: 1 }}>{s.name}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>[{s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}]</div>
                                                <button onClick={() => handleDeleteStop(s.id)} title="Remove stop"
                                                    style={{ background: 'none', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, padding: '3px 6px', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}>
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}

                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                            <input type="text" placeholder="Stop Name" className="input-field" style={{ marginBottom: 0, padding: '0.5rem', flex: 1 }} value={newStop.name} onChange={e => setNewStop({ ...newStop, name: e.target.value })} />
                                            <input type="number" placeholder="Lat" className="input-field" style={{ marginBottom: 0, padding: '0.5rem', width: 90 }} value={newStop.latitude} onChange={e => setNewStop({ ...newStop, latitude: e.target.value })} />
                                            <input type="number" placeholder="Lng" className="input-field" style={{ marginBottom: 0, padding: '0.5rem', width: 90 }} value={newStop.longitude} onChange={e => setNewStop({ ...newStop, longitude: e.target.value })} />
                                            <button className="btn btn-success" style={{ padding: '0.5rem 1rem' }} onClick={handleAddStop}>Add Stop</button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Add/Edit Bus Modal */}
            <AnimatePresence>
                {showBusModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                    }} onClick={e => { if (e.target === e.currentTarget) { setShowBusModal(false); setEditingBusId(null) } }}>
                        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="glass-panel" style={{ padding: '2rem', width: '90%', maxWidth: '500px', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ margin: 0, color: 'var(--bus-yellow)' }}>{editingBusId ? 'Edit Bus' : 'Add New Bus'}</h3>
                                <button type="button" onClick={() => { setShowBusModal(false); setEditingBusId(null) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handleAddBus} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label">Plate Number</label>
                                    <input type="text" required className="input-field" placeholder="e.g. BUS-123" value={busForm.plateNumber} onChange={e => setBusForm({...busForm, plateNumber: e.target.value})} />
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label">Capacity (seats)</label>
                                    <input type="number" required min={1} max={200} step={1} className="input-field" placeholder="e.g. 30" value={busForm.capacity} onChange={e => setBusForm({...busForm, capacity: e.target.value.replace(/[^0-9]/g,'')})} />
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label">Driver (Optional)</label>
                                    <select className="input-field" style={{ background: 'var(--surface-bg)' }} value={busForm.driverId} onChange={e => setBusForm({...busForm, driverId: e.target.value})}>
                                        <option value="">-- Select Driver --</option>
                                        {drivers.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label">Route (Optional)</label>
                                    <select className="input-field" style={{ background: 'var(--surface-bg)' }} value={busForm.routeId} onChange={e => setBusForm({...busForm, routeId: e.target.value})}>
                                        <option value="">-- Select Route --</option>
                                        {routes.map(r => (
                                            <option key={r.id} value={r.id}>{r.name}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* GPS Tracker IDs */}
                                <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                                        GPS Tracker IDs (optional — leave blank if not using)
                                    </div>
                                    <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                                        <label className="input-label">🛰️ Wialon Unit ID</label>
                                        <input type="text" className="input-field" placeholder="e.g. 123456789"
                                            value={busForm.wialonUnitId}
                                            onChange={e => setBusForm({...busForm, wialonUnitId: e.target.value})} />
                                    </div>
                                    <div className="input-group" style={{ marginBottom: 0 }}>
                                        <label className="input-label">📡 Katsana Vehicle ID</label>
                                        <input type="text" className="input-field" placeholder="e.g. 78901"
                                            value={busForm.katsanaVehicleId}
                                            onChange={e => setBusForm({...busForm, katsanaVehicleId: e.target.value})} />
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
                                    <button type="button" className="btn" style={{ background: 'rgba(255,255,255,0.1)' }} onClick={() => { setShowBusModal(false); setEditingBusId(null) }}>Cancel</button>
                                    <button type="submit" className="btn btn-primary">{editingBusId ? 'Save Changes' : 'Save Bus'}</button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Add/Edit Route Modal — Enhanced with Geo Map */}
            <AnimatePresence>
                {showRouteModal && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
                        overflowY: 'auto', padding: '2rem 0'
                    }} onClick={e => { if (e.target === e.currentTarget) { setShowRouteModal(false); setEditingRouteId(null) } }}>
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                            className="glass-panel"
                            style={{ padding: '2rem', width: '90%', maxWidth: '680px', border: '1px solid rgba(255,255,255,0.1)', maxHeight: '90vh', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h3 style={{ margin: 0, color: 'var(--bus-yellow)' }}>{editingRouteId ? 'Edit Route' : 'Add New Route'}</h3>
                                <button type="button" onClick={() => { setShowRouteModal(false); setEditingRouteId(null) }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex' }}>
                                    <X size={20} />
                                </button>
                            </div>
                            <form onSubmit={handleAddRoute} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>

                                {/* Basic Info */}
                                <div className="input-group" style={{ marginBottom: 0 }}>
                                    <label className="input-label">Route Name *</label>
                                    <input type="text" required className="input-field" placeholder="e.g. Route C — Taman Jaya" value={routeForm.name} onChange={e => setRouteForm({...routeForm, name: e.target.value})} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div className="input-group" style={{ marginBottom: 0 }}>
                                        <label className="input-label">Morning Pickup Time</label>
                                        <input type="text" className="input-field" placeholder="7:30 AM" value={routeForm.morningTime} onChange={e => setRouteForm({...routeForm, morningTime: e.target.value})} />
                                    </div>
                                    <div className="input-group" style={{ marginBottom: 0 }}>
                                        <label className="input-label">Afternoon Dropoff Time</label>
                                        <input type="text" className="input-field" placeholder="3:00 PM" value={routeForm.afternoonTime} onChange={e => setRouteForm({...routeForm, afternoonTime: e.target.value})} />
                                    </div>
                                </div>

                                {/* Start Point */}
                                <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Start Point (School / Depot)</span>
                                    </div>
                                    <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                                        <label className="input-label">Start Point Name</label>
                                        <input type="text" className="input-field" placeholder="e.g. SJK Taman Maju" value={routeForm.startPointName} onChange={e => setRouteForm({...routeForm, startPointName: e.target.value})} />
                                    </div>
                                    <button type="button" className="btn" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}
                                        onClick={() => setActiveEndpointMap(activeEndpointMap === 'start' ? null : 'start')}>
                                        <MapPin size={13} /> {activeEndpointMap === 'start' ? 'Close Map' : (routeForm.startCoords ? 'Change Start Pin' : 'Pin Start on Map')}
                                    </button>
                                    {activeEndpointMap === 'start' && (
                                        <Suspense fallback={<div style={{ height: 280, background: 'rgba(255,255,255,0.03)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading map…</div>}>
                                            <MapPicker
                                                value={routeForm.startCoords}
                                                onChange={coords => setRouteForm(f => ({ ...f, startCoords: coords }))}
                                                label="Click to pin the start point"
                                                markerColor="#22c55e"
                                            />
                                        </Suspense>
                                    )}
                                    {routeForm.startCoords && !activeEndpointMap && (
                                        <div style={{ fontSize: '0.78rem', color: '#22c55e' }}>
                                            ✓ Pinned: {routeForm.startCoords.lat.toFixed(5)}, {routeForm.startCoords.lng.toFixed(5)}
                                        </div>
                                    )}
                                </div>

                                {/* End Point */}
                                <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.75rem' }}>
                                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>End Point (Last Drop)</span>
                                    </div>
                                    <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                                        <label className="input-label">End Point Name</label>
                                        <input type="text" className="input-field" placeholder="e.g. Taman Sentosa" value={routeForm.endPointName} onChange={e => setRouteForm({...routeForm, endPointName: e.target.value})} />
                                    </div>
                                    <button type="button" className="btn" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}
                                        onClick={() => setActiveEndpointMap(activeEndpointMap === 'end' ? null : 'end')}>
                                        <MapPin size={13} /> {activeEndpointMap === 'end' ? 'Close Map' : (routeForm.endCoords ? 'Change End Pin' : 'Pin End on Map')}
                                    </button>
                                    {activeEndpointMap === 'end' && (
                                        <Suspense fallback={<div style={{ height: 280, background: 'rgba(255,255,255,0.03)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading map…</div>}>
                                            <MapPicker
                                                value={routeForm.endCoords}
                                                onChange={coords => setRouteForm(f => ({ ...f, endCoords: coords }))}
                                                label="Click to pin the end point"
                                                markerColor="#ef4444"
                                            />
                                        </Suspense>
                                    )}
                                    {routeForm.endCoords && !activeEndpointMap && (
                                        <div style={{ fontSize: '0.78rem', color: '#ef4444' }}>
                                            ✓ Pinned: {routeForm.endCoords.lat.toFixed(5)}, {routeForm.endCoords.lng.toFixed(5)}
                                        </div>
                                    )}
                                </div>

                                {/* Stops (only on new route creation) */}
                                {!editingRouteId && (
                                    <div style={{ borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>🚏 Boarding Stops ({routeForm.stops.length})</span>
                                            <button type="button" className="btn" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem', background: 'rgba(255,214,10,0.15)', border: '1px solid rgba(255,214,10,0.3)', color: 'var(--bus-yellow)', display: 'flex', alignItems: 'center', gap: 6 }}
                                                onClick={addStopDraft}>
                                                <Plus size={13} /> Add Stop
                                            </button>
                                        </div>

                                        {routeForm.stops.map((stop, idx) => (
                                            <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '0.75rem', marginBottom: '0.75rem', border: '1px solid var(--surface-border)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem' }}>
                                                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--primary)', color: '#08080A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700 }}>{idx + 1}</div>
                                                    <input
                                                        type="text"
                                                        className="input-field"
                                                        placeholder={`Stop ${idx + 1} name`}
                                                        style={{ flex: 1, marginBottom: 0, padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                                                        value={stop.name}
                                                        onChange={e => {
                                                            const stops = [...routeForm.stops]
                                                            stops[idx] = { ...stops[idx], name: e.target.value }
                                                            setRouteForm(f => ({ ...f, stops }))
                                                        }}
                                                    />
                                                    <button type="button" onClick={() => removeStopDraft(idx)}
                                                        style={{ background: 'none', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 6, padding: '3px 6px', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}>
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                                <button type="button" className="btn" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: 'rgba(255,214,10,0.1)', border: '1px solid rgba(255,214,10,0.2)', color: 'var(--bus-yellow)', display: 'flex', alignItems: 'center', gap: 5 }}
                                                    onClick={() => setActiveStopMapIdx(activeStopMapIdx === idx ? null : idx)}>
                                                    <MapPin size={11} /> {activeStopMapIdx === idx ? 'Close Map' : (stop.coords ? 'Change Pin' : 'Pin on Map')}
                                                </button>
                                                {activeStopMapIdx === idx && (
                                                    <div style={{ marginTop: '0.5rem' }}>
                                                        <Suspense fallback={<div style={{ height: 240, background: 'rgba(255,255,255,0.03)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading map…</div>}>
                                                            <MapPicker
                                                                value={stop.coords}
                                                                height={240}
                                                                onChange={coords => {
                                                                    const stops = [...routeForm.stops]
                                                                    stops[idx] = { ...stops[idx], coords }
                                                                    setRouteForm(f => ({ ...f, stops }))
                                                                }}
                                                                label={`Click to pin stop ${idx + 1}`}
                                                                markerColor="#FFD60A"
                                                            />
                                                        </Suspense>
                                                    </div>
                                                )}
                                                {stop.coords && activeStopMapIdx !== idx && (
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--bus-yellow)', marginTop: '0.25rem' }}>
                                                        ✓ {stop.coords.lat.toFixed(5)}, {stop.coords.lng.toFixed(5)}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                        {routeForm.stops.length === 0 && (
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.5rem 0' }}>
                                                No stops added yet. You can add them after route creation too.
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', justifyContent: 'flex-end' }}>
                                    <button type="button" className="btn" style={{ background: 'rgba(255,255,255,0.1)' }} onClick={() => { setShowRouteModal(false); setEditingRouteId(null) }}>Cancel</button>
                                    <button type="submit" className="btn btn-primary">{editingRouteId ? 'Save Changes' : 'Create Route'}</button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    )
}
