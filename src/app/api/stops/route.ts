import { NextResponse, NextRequest } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { searchParams } = new URL(request.url)
        const routeId = searchParams.get('routeId')

        const whereClause = routeId ? { routeId } : {}
        const stops = await prisma.stop.findMany({
            where: whereClause,
            orderBy: { order: 'asc' }
        })

        return NextResponse.json({ stops })
    } catch (error) {
        console.error('Stops GET Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user || user.role === 'PARENT' || user.role === 'DRIVER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const data = await request.json()

        // Support bulk creation: { stops: [...] }
        if (Array.isArray(data.stops)) {
            if (!data.routeId) {
                return NextResponse.json({ error: 'routeId is required for bulk creation' }, { status: 400 })
            }
            for (let idx = 0; idx < data.stops.length; idx++) {
                const s = data.stops[idx]
                const stopName = String(s.name || `Stop ${idx + 1}`).trim()
                if (stopName) {
                    await prisma.stop.create({
                        data: {
                            routeId: data.routeId,
                            name: stopName,
                            latitude: Number(s.latitude) || 0,
                            longitude: Number(s.longitude) || 0,
                            order: idx + 1,
                        }
                    })
                }
            }
            const stops = await prisma.stop.findMany({
                where: { routeId: data.routeId },
                orderBy: { order: 'asc' }
            })
            return NextResponse.json({ stops })
        }

        // Single stop creation
        if (!data.routeId || !data.name || data.latitude === undefined || data.longitude === undefined || data.order === undefined) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }
        if (!String(data.name).trim()) {
            return NextResponse.json({ error: 'Stop name cannot be only spaces' }, { status: 400 })
        }

        const stop = await prisma.stop.create({
            data: {
                routeId: data.routeId,
                name: String(data.name).trim(),
                latitude: data.latitude,
                longitude: data.longitude,
                order: data.order
            }
        })

        return NextResponse.json({ stop })
    } catch (error) {
        console.error('Stops POST Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
