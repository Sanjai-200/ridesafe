import { NextResponse, NextRequest } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'
import { autoMigrateDatabase } from '@/lib/db/auto-migrate'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        await autoMigrateDatabase().catch(console.warn)

        let trips: any[] = []

        try {
            if (user.role === 'DRIVER') {
                trips = await prisma.trip.findMany({
                    where: { driverId: user.id },
                    include: { route: { include: { stops: { orderBy: { order: 'asc' } } } } },
                    orderBy: { date: 'desc' },
                    take: 10
                })
            } else if (user.role === 'PARENT') {
                const students = await prisma.student.findMany({ where: { parentId: user.id } })
                const routeIds = students.map(s => s.routeId).filter(Boolean) as string[]
                trips = await prisma.trip.findMany({
                    where: { routeId: { in: routeIds }, status: { not: 'TRIP_COMPLETED' } },
                    include: { route: true, driver: { select: { name: true, phone: true } } }
                })
            } else {
                trips = await prisma.trip.findMany({
                    include: { route: true, driver: { select: { name: true } }, bus: { select: { plateNumber: true } } },
                    orderBy: { date: 'desc' },
                    take: 50
                })
            }
        } catch (findErr) {
            console.warn('Trips findMany failed, falling back to safe query:', findErr)
            try {
                // Query core columns using raw SQL if session column missing
                const rawTrips: any[] = await prisma.$queryRawUnsafe(`
                    SELECT t.id, t."routeId", t."driverId", t."busId", t.status, t.date
                    FROM "Trip" t
                    ORDER BY t.date DESC
                    LIMIT 50
                `)
                trips = rawTrips
            } catch {
                trips = []
            }
        }

        return NextResponse.json({ trips })
    } catch (error) {
        console.error('Trips GET Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const data = await request.json()
        if (user.role === 'PARENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const driverId = user.role === 'DRIVER' ? user.id : data.driverId
        if (!driverId || !data.routeId) {
            return NextResponse.json({ error: 'Missing driverId or routeId' }, { status: 400 })
        }

        const trip = await prisma.trip.create({
            data: {
                routeId: data.routeId,
                driverId: driverId,
                busId: data.busId,
                status: 'TRIP_CREATED',
                session: data.session || null,
            }
        })

        // Notify all parents on this route that trip has started
        const students = await prisma.student.findMany({
            where: { routeId: data.routeId, parentId: { not: null } },
            select: { parentId: true, name: true }
        })
        const parentIds = [...new Set(students.map(s => s.parentId).filter(Boolean) as string[])]
        if (parentIds.length > 0) {
            const sessionLabel = data.session === 'AFTERNOON' ? 'Afternoon Drop-off' : 'Morning Pickup'
            await prisma.notification.createMany({
                data: parentIds.map(parentId => ({
                    userId: parentId,
                    title: `🚌 ${sessionLabel} Trip Started`,
                    body: `The bus has started the ${sessionLabel} trip for your route. Driver is on the way.`,
                    type: 'INFO',
                }))
            }).catch(() => {})
        }

        return NextResponse.json({ trip })
    } catch (error) {
        console.error('Trips POST Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
