import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'
import { autoMigrateDatabase } from '@/lib/db/auto-migrate'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Auto-heal database schema
    await autoMigrateDatabase().catch(console.warn)

    let students: any[] = [];

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today.getTime() + 86400000)

    const studentInclude = {
      organization: { select: { id: true, name: true } },
      parent: { select: { id: true, name: true, phone: true, email: true } },
      route: {
        select: {
          id: true,
          name: true,
          buses: {
            select: {
              id: true,
              plateNumber: true,
              driver: { select: { id: true, name: true, phone: true } }
            }
          }
        }
      },
      pickupStop: { select: { id: true, name: true, latitude: true, longitude: true } },
      dropoffStop: { select: { id: true, name: true, latitude: true, longitude: true } },
    }

    try {
      if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'SCHOOL_ADMIN') {
        students = await prisma.student.findMany({
          include: {
            ...studentInclude,
            dailyStatuses: {
              where: { date: { gte: today, lt: tomorrow } },
              take: 1,
              select: { status: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        })
      } else if (user.role === 'DRIVER') {
        students = await prisma.student.findMany({
          include: {
            ...studentInclude,
            dailyStatuses: {
              where: { date: { gte: today, lt: tomorrow } },
              take: 1,
              select: { status: true }
            }
          },
          orderBy: { name: 'asc' }
        })
      } else if (user.role === 'PARENT') {
        students = await prisma.student.findMany({
          where: { parentId: user.id },
          include: {
            ...studentInclude,
            dailyStatuses: {
              where: { date: { gte: today, lt: tomorrow } },
              take: 1,
              select: { status: true }
            }
          }
        })
      } else {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    } catch (queryErr) {
      console.warn('Students query with dailyStatuses failed, falling back to base relations:', queryErr)
      // Fallback query without dailyStatuses relation if table is missing
      if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'SCHOOL_ADMIN') {
        students = await prisma.student.findMany({
          include: studentInclude,
          orderBy: { createdAt: 'desc' }
        })
      } else if (user.role === 'DRIVER') {
        students = await prisma.student.findMany({
          include: studentInclude,
          orderBy: { name: 'asc' }
        })
      } else if (user.role === 'PARENT') {
        students = await prisma.student.findMany({
          where: { parentId: user.id },
          include: studentInclude
        })
      }
    }

    return NextResponse.json({ students })
  } catch (error) {
    console.error('Error fetching students:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromSession()
    if (!user || (!['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(user.role))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    // Validate required fields
    const { name, grade, level, parentContact1, parentContact2, isSelfPickup, selfPickupSession, routeId, parentId, pickupStopId, dropoffStopId, organizationId, status } = body

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Student name must be at least 2 characters' }, { status: 400 })
    }
    if (!grade || typeof grade !== 'string' || !grade.trim()) {
      return NextResponse.json({ error: 'Grade is required' }, { status: 400 })
    }
    if (!parentContact1 || typeof parentContact1 !== 'string' || !parentContact1.trim()) {
      return NextResponse.json({ error: 'Primary parent contact is required' }, { status: 400 })
    }

    const studentData: Record<string, unknown> = {
      name: name.trim(),
      grade: grade.trim(),
      level: (level || 'Primary').trim(),
      parentContact1: parentContact1.trim(),
      parentContact2: parentContact2?.trim() || null,
      isSelfPickup: Boolean(isSelfPickup),
      selfPickupSession: selfPickupSession || null,
      routeId: routeId || null,
      parentId: parentId || null,
      pickupStopId: pickupStopId || null,
      dropoffStopId: dropoffStopId || null,
      organizationId: organizationId || (user as any).organizationId || null,
      status: status || 'APPROVED',
    }

    const student = await prisma.student.create({
      data: studentData as Parameters<typeof prisma.student.create>[0]['data'],
      include: {
        organization: { select: { id: true, name: true } },
        parent: { select: { id: true, name: true, phone: true, email: true } },
        route: {
          select: {
            id: true,
            name: true,
            buses: {
              select: {
                id: true,
                plateNumber: true,
                driver: { select: { id: true, name: true, phone: true } }
              }
            }
          }
        }
      }
    })

    return NextResponse.json({ student })
  } catch (error) {
    console.error('Error creating student:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
