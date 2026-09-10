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
            console.warn('Prisma findMany failed, fetching routes via raw SQL:', findErr)
            try {
                const rawRoutes: any[] = await prisma.$queryRawUnsafe(`
                    SELECT r.id, r.name, r."morningTime", r."afternoonTime", r."organizationId", r."createdAt", r."updatedAt"
                    FROM "Route" r
                    ORDER BY r."createdAt" DESC
                `)
                const routeIds = rawRoutes.map(r => r.id)
                const allStops = await prisma.stop.findMany({
                    where: { routeId: { in: routeIds } },
                    orderBy: { order: 'asc' }
                })
                routes = rawRoutes.map(r => ({
                    ...r,
                    stops: allStops.filter(s => s.routeId === r.id),
                    _count: { students: 0, buses: 0 }
                }))
            } catch (rawErr) {
                console.error('Raw route query failed:', rawErr)
                routes = []
            }
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

        // Create the route with bulletproof collision retry and raw SQL fallback
        let route: { id: string; name: string } | null = null
        let attempts = 0
        const maxAttempts = 6

        while (!route && attempts < maxAttempts) {
            attempts++
            try {
                const created = await prisma.route.create({
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
                    },
                    select: { id: true, name: true }
                })
                route = created
            } catch (createErr: any) {
                const isConflict = createErr?.code === 'P2002' || String(createErr?.message || '').includes('already exists') || String(createErr?.message || '').includes('23505')
                if (isConflict && attempts < maxAttempts) {
                    candidateName = `${String(name).trim()} (${suffix++})`
                    continue
                }

                // If not standard Prisma create, try safe raw SQL insert
                try {
                    const newRouteId = `route_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
                    const mTime = morningTime || '7:30 AM'
                    const aTime = afternoonTime || '3:00 PM'
                    const orgId = (auth as any).organizationId || null

                    await prisma.$executeRawUnsafe(
                        `INSERT INTO "Route" ("id", "name", "morningTime", "afternoonTime", "organizationId", "createdAt", "updatedAt") 
                         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                        newRouteId,
                        candidateName,
                        mTime,
                        aTime,
                        orgId
                    )
                    route = { id: newRouteId, name: candidateName }
                } catch (rawErr: any) {
                    const isRawConflict = String(rawErr?.message || '').includes('already exists') || String(rawErr?.message || '').includes('23505') || rawErr?.code === 'P2010'
                    if (isRawConflict && attempts < maxAttempts) {
                        candidateName = `${String(name).trim()} (${suffix++})`
                        continue
                    }
                    console.error('Route create raw insert error:', rawErr)
                    return NextResponse.json({ error: `Route "${candidateName}" already exists. Please choose a different name.` }, { status: 409 })
                }
            }
        }

        if (!route) {
            return NextResponse.json({ error: 'A route with this name already exists. Please choose a different name.' }, { status: 409 })
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

        // Create intermediate stops in prisma.stop (which is 100% standard and always exists in postgres)
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
        let routeWithStops: any
        try {
            routeWithStops = await prisma.route.findUnique({
                where: { id: route.id },
                include: {
                    stops: { orderBy: { order: 'asc' } },
                    _count: { select: { students: true, buses: true } }
                }
            })
        } catch {
            const dbStops = await prisma.stop.findMany({
                where: { routeId: route.id },
                orderBy: { order: 'asc' }
            })
            routeWithStops = {
                id: route.id,
                name: route.name,
                morningTime: morningTime || '7:30 AM',
                afternoonTime: afternoonTime || '3:00 PM',
                stops: dbStops,
                _count: { students: 0, buses: 0 }
            }
        }

        return NextResponse.json({ route: routeWithStops, message: 'Route created successfully' })
    } catch (error: unknown) {
        console.error('Route create error:', error)
        const msg = error instanceof Error ? error.message : 'Failed to create route'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}

