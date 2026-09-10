import { NextResponse, NextRequest } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromSession()
    if (!user || user.role !== 'DRIVER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Check if driver already has an assigned bus with a route
    let bus = await prisma.bus.findFirst({
      where: { driverId: user.id },
      include: {
        route: {
          include: {
            stops: { orderBy: { order: 'asc' } },
            students: { select: { id: true, name: true, grade: true } }
          }
        }
      }
    })

    if (bus?.route) {
      return NextResponse.json({
        message: 'Bus and route already assigned',
        busId: bus.id,
        busPlate: bus.plateNumber,
        assignedRoute: bus.route
      })
    }

    // 2. Find any bus that has a route and assign to this driver
    let candidateBus = await prisma.bus.findFirst({
      where: { routeId: { not: null } },
      include: {
        route: {
          include: {
            stops: { orderBy: { order: 'asc' } },
            students: { select: { id: true, name: true, grade: true } }
          }
        }
      }
    })

    if (candidateBus) {
      bus = await prisma.bus.update({
        where: { id: candidateBus.id },
        data: { driverId: user.id },
        include: {
          route: {
            include: {
              stops: { orderBy: { order: 'asc' } },
              students: { select: { id: true, name: true, grade: true } }
            }
          }
        }
      })

      return NextResponse.json({
        message: 'Assigned to active bus and route',
        busId: bus.id,
        busPlate: bus.plateNumber,
        assignedRoute: bus.route
      })
    }

    // 3. Find any route or create a default demo route
    let route = await prisma.route.findFirst({
      include: {
        stops: { orderBy: { order: 'asc' } },
        students: { select: { id: true, name: true, grade: true } }
      }
    })

    if (!route) {
      route = await prisma.route.create({
        data: {
          name: 'Morning Route A',
          morningTime: '7:30 AM',
          afternoonTime: '3:00 PM',
          stops: {
            create: [
              { name: 'Taman Desa Stop', latitude: 3.1030, longitude: 101.6870, order: 1 },
              { name: 'Sri Petaling Gate', latitude: 3.0890, longitude: 101.6980, order: 2 },
              { name: 'Mont Kiara Academy', latitude: 3.1670, longitude: 101.6520, order: 3 },
            ]
          }
        },
        include: {
          stops: { orderBy: { order: 'asc' } },
          students: { select: { id: true, name: true, grade: true } }
        }
      })

      // Seed default students for this route if none exist
      const stops = route.stops
      if (stops.length >= 2) {
        await prisma.student.createMany({
          data: [
            { name: 'Timmy Chen', grade: 'Grade 3', level: 'Primary', parentContact1: '+60 12-345 6789', routeId: route.id, pickupStopId: stops[0].id, dropoffStopId: stops[1].id },
            { name: 'Sarah Lee', grade: 'Grade 1', level: 'Primary', parentContact1: '+60 12-987 6543', routeId: route.id, pickupStopId: stops[1].id, dropoffStopId: stops[0].id, isSelfPickup: true },
            { name: 'Lucas Wong', grade: 'Grade 4', level: 'Primary', parentContact1: '+60 17-555 4321', routeId: route.id, pickupStopId: stops[0].id, dropoffStopId: stops[2].id },
          ]
        })
      }
    }

    // 4. Create or update bus for this driver
    const existingBus = await prisma.bus.findFirst({ where: { driverId: user.id } })
    if (existingBus) {
      bus = await prisma.bus.update({
        where: { id: existingBus.id },
        data: { routeId: route.id, qrToken: existingBus.qrToken || 'QR-BUS-001' },
        include: {
          route: {
            include: {
              stops: { orderBy: { order: 'asc' } },
              students: { select: { id: true, name: true, grade: true } }
            }
          }
        }
      })
    } else {
      const plateNumber = 'BUS-' + Math.floor(100 + Math.random() * 900)
      bus = await prisma.bus.create({
        data: {
          plateNumber,
          capacity: 32,
          status: 'ACTIVE',
          driverId: user.id,
          routeId: route.id,
          qrToken: 'QR-' + plateNumber,
        },
        include: {
          route: {
            include: {
              stops: { orderBy: { order: 'asc' } },
              students: { select: { id: true, name: true, grade: true } }
            }
          }
        }
      })
    }

    return NextResponse.json({
      message: 'Bus and route assigned successfully',
      busId: bus.id,
      busPlate: bus.plateNumber,
      assignedRoute: bus.route
    })
  } catch (error: any) {
    console.error('Claim Route Error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
