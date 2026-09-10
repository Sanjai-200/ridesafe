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
            stops, // optional: array of { name, latitude, longitude } to bulk-create
        } = await request.json()

        if (!name) {
            return NextResponse.json({ error: 'Route name is required' }, { status: 400 })
        }

        const parsedStartLat = startLatitude !== null && startLatitude !== undefined && startLatitude !== '' ? Number(startLatitude) : null
        const parsedStartLng = startLongitude !== null && startLongitude !== undefined && startLongitude !== '' ? Number(startLongitude) : null
        const parsedEndLat = endLatitude !== null && endLatitude !== undefined && endLatitude !== '' ? Number(endLatitude) : null
        const parsedEndLng = endLongitude !== null && endLongitude !== undefined && endLongitude !== '' ? Number(endLongitude) : null

        // Create the route with geo endpoints
        const route = await prisma.route.create({
            data: {
                name: String(name).trim(),
                morningTime: morningTime || null,
                afternoonTime: afternoonTime || null,
                startPointName: startPointName ? String(startPointName).trim() : null,
                startLatitude: parsedStartLat != null && !isNaN(parsedStartLat) ? parsedStartLat : null,
                startLongitude: parsedStartLng != null && !isNaN(parsedStartLng) ? parsedStartLng : null,
                endPointName: endPointName ? String(endPointName).trim() : null,
                endLatitude: parsedEndLat != null && !isNaN(parsedEndLat) ? parsedEndLat : null,
                endLongitude: parsedEndLng != null && !isNaN(parsedEndLng) ? parsedEndLng : null,
                organizationId: (auth as any).organizationId || null,
            }
        })

        // Create stops reliably one by one so Prisma generates client IDs correctly across all DBs
        if (Array.isArray(stops) && stops.length > 0) {
            for (let idx = 0; idx < stops.length; idx++) {
                const s = stops[idx]
                const stopName = String(s.name || `Stop ${idx + 1}`).trim()
                if (stopName) {
                    await prisma.stop.create({
                        data: {
                            routeId: route.id,
                            name: stopName,
                            latitude: Number(s.latitude) || 0,
                            longitude: Number(s.longitude) || 0,
                            order: idx + 1,
                        }
                    })
                }
            }
        }

        // Return route with stops
        const routeWithStops = await prisma.route.findUnique({
            where: { id: route.id },
            include: { stops: { orderBy: { order: 'asc' } } }
        })

        return NextResponse.json({ route: routeWithStops })
    } catch (error: unknown) {
        const code = (error as { code?: string })?.code
        if (code === 'P2002') {
            return NextResponse.json({ error: 'A route with this name already exists' }, { status: 409 })
        }
        console.error('Route create error:', error)
        const msg = error instanceof Error ? error.message : 'Failed to create route'
        return NextResponse.json({ error: msg }, { status: 500 })
    }
}
