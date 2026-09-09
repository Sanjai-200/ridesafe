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

        // Create the route with geo endpoints
        const route = await prisma.route.create({
            data: {
                name,
                morningTime,
                afternoonTime,
                startPointName: startPointName || null,
                startLatitude: startLatitude ?? null,
                startLongitude: startLongitude ?? null,
                endPointName: endPointName || null,
                endLatitude: endLatitude ?? null,
                endLongitude: endLongitude ?? null,
                organizationId: auth.organizationId || null,
            }
        })

        // Bulk-create stops if provided
        if (Array.isArray(stops) && stops.length > 0) {
            await prisma.stop.createMany({
                data: stops.map((s: { name: string; latitude: number; longitude: number }, idx: number) => ({
                    routeId: route.id,
                    name: String(s.name).trim(),
                    latitude: Number(s.latitude) || 0,
                    longitude: Number(s.longitude) || 0,
                    order: idx + 1,
                }))
            })
        }

        // Return route with stops
        const routeWithStops = await prisma.route.findUnique({
            where: { id: route.id },
            include: { stops: { orderBy: { order: 'asc' } } }
        })

        return NextResponse.json({ route: routeWithStops })
    } catch (error) {
        console.error('Route create error:', error)
        return NextResponse.json({ error: 'Failed to create route' }, { status: 500 })
    }
}
