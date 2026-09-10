import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'
import { ensureRouteColumns } from '@/lib/db/ensure-route-columns'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const auth = await getUserFromSession()
        if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'SUPER_ADMIN' && auth.role !== 'SCHOOL_ADMIN')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Auto-heal schema if columns are not yet present in PostgreSQL
        await ensureRouteColumns()

        let routes
        try {
            routes = await prisma.route.findMany({
                include: {
                    stops: { orderBy: { order: 'asc' } },
                    _count: {
                        select: { students: true, buses: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            })
        } catch (findErr) {
            console.warn('Fallback to base route fields for GET:', findErr)
            // If postgres column missing, select only confirmed core fields
            routes = await prisma.route.findMany({
                select: {
                    id: true,
                    name: true,
                    morningTime: true,
                    afternoonTime: true,
                    organizationId: true,
                    createdAt: true,
                    updatedAt: true,
                    stops: { orderBy: { order: 'asc' } },
                    _count: {
                        select: { students: true, buses: true }
                    }
                },
                orderBy: { createdAt: 'desc' }
            })
        }

        return NextResponse.json({ routes })
    } catch (error) {
        console.error('Route list error:', error)
        return NextResponse.json({ error: 'Failed to fetch routes' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const auth = await getUserFromSession()
        if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'SUPER_ADMIN' && auth.role !== 'SCHOOL_ADMIN')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Ensure database columns exist before performing any query
        await ensureRouteColumns()

        const body = await request.json().catch(() => ({}))
        const {
            name,
            morningTime,
            afternoonTime,
            startPointName,
            startLatitude,
            startLongitude,
            endPointName,
            endLatitude,
            endLongitude,
            stops, // optional: array of { name, latitude/lat, longitude/lng }
        } = body

        if (!name || String(name).trim().length === 0) {
            return NextResponse.json({ error: 'Route name is required' }, { status: 400 })
        }

        // Auto-resolve duplicate route names cleanly; SELECT ONLY id to avoid querying missing columns!
        let candidateName = String(name).trim()
        let existingRoute = await prisma.route.findFirst({
            where: { name: candidateName },
            select: { id: true }
        })
        let suffix = 2
        while (existingRoute) {
            candidateName = `${String(name).trim()} (${suffix})`
            existingRoute = await prisma.route.findFirst({
                where: { name: candidateName },
                select: { id: true }
            })
            suffix++
        }

        const parsedStartLat = startLatitude !== null && startLatitude !== undefined && startLatitude !== '' ? Number(startLatitude) : null
        const parsedStartLng = startLongitude !== null && startLongitude !== undefined && startLongitude !== '' ? Number(startLongitude) : null
        const parsedEndLat = endLatitude !== null && endLatitude !== undefined && endLatitude !== '' ? Number(endLatitude) : null
        const parsedEndLng = endLongitude !== null && endLongitude !== undefined && endLongitude !== '' ? Number(endLongitude) : null

        const effectiveStartLat = parsedStartLat != null && !isNaN(parsedStartLat) ? parsedStartLat : 3.1390
        const effectiveStartLng = parsedStartLng != null && !isNaN(parsedStartLng) ? parsedStartLng : 101.6869
        const effectiveEndLat = parsedEndLat != null && !isNaN(parsedEndLat) ? parsedEndLat : 3.0890
        const effectiveEndLng = parsedEndLng != null && !isNaN(parsedEndLng) ? parsedEndLng : 101.6980
        const effectiveStartName = startPointName ? String(startPointName).trim() : 'School / Depot'
        const effectiveEndName = endPointName ? String(endPointName).trim() : 'Destination Point'

        // Create the route with fallback if Postgres table has not finished altering
        let route: { id: string; name: string }
        try {
            route = await prisma.route.create({
                data: {
                    name: candidateName,
                    morningTime: morningTime || '7:30 AM',
                    afternoonTime: afternoonTime || '3:00 PM',
                    startPointName: effectiveStartName,
                    startLatitude: effectiveStartLat,
                    startLongitude: effectiveStartLng,
                    endPointName: effectiveEndName,
                    endLatitude: effectiveEndLat,
                    endLongitude: effectiveEndLng,
                    organizationId: (auth as any).organizationId || null,
                }
            })
        } catch (createErr) {
            console.warn('Direct create with geo columns failed, creating base route:', createErr)
            route = await prisma.route.create({
                data: {
                    name: candidateName,
                    morningTime: morningTime || '7:30 AM',
                    afternoonTime: afternoonTime || '3:00 PM',
                    organizationId: (auth as any).organizationId || null,
                }
            })
        }

        // Auto Route Suggestion: If no stops were specified, auto-generate intermediate waypoint stops along the corridor
        let stopsToCreate = Array.isArray(stops) ? [...stops] : []

        if (stopsToCreate.length === 0) {
            const latDiff = effectiveEndLat - effectiveStartLat
            const lngDiff = effectiveEndLng - effectiveStartLng
            stopsToCreate = [
                {
                    name: `${effectiveStartName} Transit Stop 1`,
                    latitude: Number((effectiveStartLat + latDiff * 0.33).toFixed(6)),
                    longitude: Number((effectiveStartLng + lngDiff * 0.33).toFixed(6)),
                },
                {
                    name: `${effectiveEndName} Transit Stop 2`,
                    latitude: Number((effectiveStartLat + latDiff * 0.66).toFixed(6)),
                    longitude: Number((effectiveStartLng + lngDiff * 0.66).toFixed(6)),
                }
            ]
        }

        // Create intermediate stops in prisma.stop (which is 100% standard in postgres)
        for (let idx = 0; idx < stopsToCreate.length; idx++) {
            const s = stopsToCreate[idx]
            const stopName = String(s.name || `Stop ${idx + 1}`).trim()
            if (stopName) {
                const sLat = Number(s.latitude ?? s.lat)
                const sLng = Number(s.longitude ?? s.lng)
                await prisma.stop.create({
                    data: {
                        routeId: route.id,
                        name: stopName,
                        latitude: !isNaN(sLat) && sLat !== 0 ? sLat : Number((effectiveStartLat + (idx + 1) * 0.005).toFixed(6)),
                        longitude: !isNaN(sLng) && sLng !== 0 ? sLng : Number((effectiveStartLng + (idx + 1) * 0.005).toFixed(6)),
                        order: idx + 1,
                    }
                })
            }
        }

        // Return route with newly created stops safely
        let routeWithStops
        try {
            routeWithStops = await prisma.route.findUnique({
                where: { id: route.id },
                include: {
                    stops: { orderBy: { order: 'asc' } },
                    _count: { select: { students: true, buses: true } }
                }
            })
        } catch {
            routeWithStops = await prisma.route.findUnique({
                where: { id: route.id },
                select: {
                    id: true,
                    name: true,
                    morningTime: true,
                    afternoonTime: true,
                    organizationId: true,
                    createdAt: true,
                    updatedAt: true,
                    stops: { orderBy: { order: 'asc' } },
                    _count: { select: { students: true, buses: true } }
                }
            })
        }

        return NextResponse.json({ route: routeWithStops, message: 'Route created successfully' })
    } catch (error: unknown) {
        console.error('Route create error:', error)
        const msg = error instanceof Error ? error.message : 'Failed to create route'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
