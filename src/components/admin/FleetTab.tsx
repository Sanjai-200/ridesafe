'use client'
import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, AlertTriangle, Bus, Plus, Pencil, Trash2, MapPin, Settings2, X, Navigation } from 'lucide-react'
import { useTranslation } from '@/i18n/provider'
import GeoLocationPicker, { LatLng } from '@/components/shared/GeoLocationPicker'
import type { StopDraft } from '@/components/shared/RoutePathBuilder'

const RoutePathBuilder = dynamic(() => import('@/components/shared/RoutePathBuilder'), {
    ssr: false,
    loading: () => <div style={{ padding: '2rem', textAlign: 'center', color: '#A6A6B2' }}>Loading route builder...</div>
})

const defaultBusForm = { plateNumber: '', capacity: '30', driverId: '', routeId: '', wialonUnitId: '', katsanaVehicleId: '' }
const defaultRouteForm = {
    name: '', morningTime: '7:30 AM', afternoonTime: '3:00 PM',
    startPointName: 'Main School Campus', startCoords: { lat: 3.1390, lng: 101.6869 } as LatLng | null,
    endPointName: 'Destination Terminal', endCoords: { lat: 3.0890, lng: 101.6980 } as LatLng | null,
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
            fetch('/api/admin/buses').then(res => res.json()).catch(() => ({ buses: [] })),
            fetch('/api/admin/routes').then(res => res.json()).catch(() => ({ routes: [] })),
            fetch('/api/admin/users').then(res => res.json()).catch(() => ({ users: [] }))
        ]).then(([busData, routeData, userData]) => {
            setBuses(Array.isArray(busData?.buses) ? busData.buses : [])
            setRoutes(Array.isArray(routeData?.routes) ? routeData.routes : [])
            setDrivers(Array.isArray(userData?.users) ? userData.users.filter((u: any) => u.role === 'DRIVER') : [])
            setLoading(false)
        }).catch(err => {
            console.error('loadData error:', err)
            setLoading(false)
        })
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
        setShowRouteModal(true)
    }

    const openEditRouteModal = async (r: any) => {
        setEditingRouteId(r.id)
        let stopsDraft: StopDraft[] = []
        if (r.stops && r.stops.length > 0) {
            stopsDraft = r.stops.map((s: any) => ({
                name: s.name,
                lat: Number(s.latitude) || 0,
                lng: Number(s.longitude) || 0
            }))
        } else {
            try {
                const res = await fetch(`/api/stops?routeId=${r.id}`)
                if (res.ok) {
                    const d = await res.json()
                    stopsDraft = (d.stops || []).map((s: any) => ({
                        name: s.name,
                        lat: Number(s.latitude) || 0,
                        lng: Number(s.longitude) || 0
                    }))
                }
            } catch {}
        }
        setRouteForm({
            name: r.name,
            morningTime: r.morningTime || '7:30 AM',
            afternoonTime: r.afternoonTime || '3:00 PM',
            startPointName: r.startPointName || 'Main School Campus',
            startCoords: (r.startLatitude != null && r.startLongitude != null) ? { lat: Number(r.startLatitude), lng: Number(r.startLongitude) } : { lat: 3.1390, lng: 101.6869 },
            endPointName: r.endPointName || 'Destination Terminal',
            endCoords: (r.endLatitude != null && r.endLongitude != null) ? { lat: Number(r.endLatitude), lng: Number(r.endLongitude) } : { lat: 3.0890, lng: 101.6980 },
            stops: stopsDraft,
        })
        setShowRouteModal(true)
    }

    const handleAddRoute = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!routeForm.name.trim() || routeForm.name.trim().length < 2) {
            alert('Route name must be at least 2 characters'); return
        }
        try {
            const payload: Record<string, unknown> = {
                name: routeForm.name.trim(),
                morningTime: routeForm.morningTime,
                afternoonTime: routeForm.afternoonTime,
                startPointName: routeForm.startPointName?.trim() || 'Main School Campus',
                startLatitude: routeForm.startCoords?.lat ?? 3.1390,
                startLongitude: routeForm.startCoords?.lng ?? 101.6869,
                endPointName: routeForm.endPointName?.trim() || 'Destination Terminal',
                endLatitude: routeForm.endCoords?.lat ?? 3.0890,
                endLongitude: routeForm.endCoords?.lng ?? 101.6980,
                stops: routeForm.stops.map((s, idx) => ({
                    name: (s.name || `Stop ${idx + 1}`).trim(),
                    latitude: s.lat || 0,
                    longitude: s.lng || 0,
                }))
            }

            const res = editingRouteId
                ? await fetch(`/api/admin/routes/${editingRouteId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                : await fetch('/api/admin/routes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

            if (res.ok) {
                setRouteForm(defaultRouteForm)
                setEditingRouteId(null)
                setShowRouteModal(false)
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
    const safeBuses = Array.isArray(buses) ? buses : []
    const safeRoutes = Array.isArray(routes) ? routes : []
    const filteredBuses = q ? safeBuses.filter(b => b?.plateNumber?.toLowerCase().includes(q) || b?.driver?.name?.toLowerCase().includes(q)) : safeBuses
    const filteredRoutes = q ? safeRoutes.filter(r => r?.name?.toLowerCase().includes(q)) : safeRoutes

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
                        <div key={b?.id || i} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
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
                        <div key={r?.id || i} style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--surface-border)' }}>
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
                                    <span>· {Array.isArray(r.stops) ? r.stops.length : (r._count?.stops || 0)} stops</span>
                                </div>
                            )}

                            <AnimatePresence>
                                {selectedRouteId === r.id && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginTop: '1rem', borderTop: '1px solid var(--surface-border)', paddingTop: '1rem' }}>
                                        <h4 style={{ margin: '0 0 1rem 0' }}>Route Stops</h4>
                                        {routeStops.map((s, idx) => (
                                            <div key={s.id || idx} style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                                                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>{idx + 1}</div>
                                                <div style={{ flex: 1 }}>{s.name}</div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>[{Number(s.latitude || 0).toFixed(4)}, {Number(s.longitude || 0).toFixed(4)}]</div>
                                                <button onClick={() => handleDeleteStop(s.id)} title="Remove stop"
                                                    style={{ background: 'none', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, padding: '3px 6px', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}>
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}

                                        <div style={{ marginTop: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: 10, border: '1px solid var(--surface-border)' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.75rem' }}>+ Add Stop to Route</div>
                                            <div className="input-group" style={{ marginBottom: '0.75rem' }}>
                                                <label className="input-label">Stop Name</label>
                                                <input type="text" placeholder="e.g. Jalan Permata 3" className="input-field" value={newStop.name} onChange={e => setNewStop({ ...newStop, name: e.target.value })} />
                                            </div>
                                            <GeoLocationPicker
                                                value={newStop.latitude && newStop.longitude ? { lat: parseFloat(newStop.latitude), lng: parseFloat(newStop.longitude) } : null}
                                                onChange={coords => setNewStop({ ...newStop, latitude: coords ? String(coords.lat) : '', longitude: coords ? String(coords.lng) : '' })}
                                                label="Stop Geolocation Coordinates"
                                                markerColor="#FFD60A"
                                            />
                                            <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                                                <button className="btn btn-success" style={{ padding: '0.5rem 1.25rem', fontWeight: 700 }} onClick={handleAddStop}>+ Add Stop</button>
                                            </div>
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

                                {/* Interactive Route Path Builder with Auto-Suggestion */}
                                <RoutePathBuilder
                                    startPointName={routeForm.startPointName}
                                    startCoords={routeForm.startCoords}
                                    endPointName={routeForm.endPointName}
                                    endCoords={routeForm.endCoords}
                                    stops={routeForm.stops}
                                    onStartChange={(name, coords) => setRouteForm(f => ({ ...f, startPointName: name, startCoords: coords }))}
                                    onEndChange={(name, coords) => setRouteForm(f => ({ ...f, endPointName: name, endCoords: coords }))}
                                    onStopsChange={stops => setRouteForm(f => ({ ...f, stops }))}
                                />

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
