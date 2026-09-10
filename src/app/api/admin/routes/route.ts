import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const auth = await getUserFromSession()
        if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'SUPER_ADMIN' && auth.role !== 'SCHOOL_ADMIN')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const routes = await prisma.route.findMany({
            include: {
                stops: { orderBy: { order: 'asc' } },
                _count: {
                    select: { students: true, buses: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        })

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
            stops, // optional: array of { name, latitude, longitude }
        } = body

        if (!name || String(name).trim().length === 0) {
            return NextResponse.json({ error: 'Route name is required' }, { status: 400 })
        }

        // Auto-resolve duplicate route names cleanly so creation never fails on collision
        let candidateName = String(name).trim()
        let existingRoute = await prisma.route.findFirst({ where: { name: candidateName } })
        let suffix = 2
        while (existingRoute) {
            candidateName = `${String(name).trim()} (${suffix})`
            existingRoute = await prisma.route.findFirst({ where: { name: candidateName } })
            suffix++
        }

        const parsedStartLat = startLatitude !== null && startLatitude !== undefined && startLatitude !== '' ? Number(startLatitude) : null
        const parsedStartLng = startLongitude !== null && startLongitude !== undefined && startLongitude !== '' ? Number(startLongitude) : null
        const parsedEndLat = endLatitude !== null && endLatitude !== undefined && endLatitude !== '' ? Number(endLatitude) : null
        const parsedEndLng = endLongitude !== null && endLongitude !== undefined && endLongitude !== '' ? Number(endLongitude) : null

        // Create the route with geo endpoints
        const route = await prisma.route.create({
            data: {
                name: candidateName,
                morningTime: morningTime || '7:30 AM',
                afternoonTime: afternoonTime || '3:00 PM',
                startPointName: startPointName ? String(startPointName).trim() : 'School / Depot',
                startLatitude: parsedStartLat != null && !isNaN(parsedStartLat) ? parsedStartLat : 3.1390,
                startLongitude: parsedStartLng != null && !isNaN(parsedStartLng) ? parsedStartLng : 101.6869,
                endPointName: endPointName ? String(endPointName).trim() : 'Destination Point',
                endLatitude: parsedEndLat != null && !isNaN(parsedEndLat) ? parsedEndLat : 3.1030,
                endLongitude: parsedEndLng != null && !isNaN(parsedEndLng) ? parsedEndLng : 101.6980,
                organizationId: (auth as any).organizationId || null,
            }
        })

        // Auto Route Suggestion: If no stops were mentioned, auto-generate intermediate waypoint stops along the corridor
        let stopsToCreate = Array.isArray(stops) ? [...stops] : []
        const effectiveStartLat = route.startLatitude ?? 3.1390
        const effectiveStartLng = route.startLongitude ?? 101.6869
        const effectiveEndLat = route.endLatitude ?? 3.1030
        const effectiveEndLng = route.endLongitude ?? 101.6980

        if (stopsToCreate.length === 0) {
            const latDiff = effectiveEndLat - effectiveStartLat
            const lngDiff = effectiveEndLng - effectiveStartLng
            stopsToCreate = [
                {
                    name: `${route.startPointName || 'Start'} Transit Stop 1`,
                    latitude: Number((effectiveStartLat + latDiff * 0.33).toFixed(6)),
                    longitude: Number((effectiveStartLng + lngDiff * 0.33).toFixed(6)),
                },
                {
                    name: `${route.endPointName || 'End'} Transit Stop 2`,
                    latitude: Number((effectiveStartLat + latDiff * 0.66).toFixed(6)),
                    longitude: Number((effectiveStartLng + lngDiff * 0.66).toFixed(6)),
                }
            ]
        }

        // Create stops one by one
        for (let idx = 0; idx < stopsToCreate.length; idx++) {
            const s = stopsToCreate[idx]
            const stopName = String(s.name || `Stop ${idx + 1}`).trim()
            if (stopName) {
                await prisma.stop.create({
                    data: {
                        routeId: route.id,
                        name: stopName,
                        latitude: Number(s.latitude) || Number((effectiveStartLat + (idx + 1) * 0.005).toFixed(6)),
                        longitude: Number(s.longitude) || Number((effectiveStartLng + (idx + 1) * 0.005).toFixed(6)),
                        order: idx + 1,
                    }
                })
            }
        }

        // Return route with newly created stops
        const routeWithStops = await prisma.route.findUnique({
            where: { id: route.id },
            include: {
                stops: { orderBy: { order: 'asc' } },
                _count: { select: { students: true, buses: true } }
            }
        })

        return NextResponse.json({ route: routeWithStops, message: 'Route created successfully' })
    } catch (error: unknown) {
        console.error('Route create error:', error)
        const msg = error instanceof Error ? error.message : 'Failed to create route'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
