import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getUserFromSession()
    if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'SUPER_ADMIN' && auth.role !== 'SCHOOL_ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.route.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))
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
      stops,
    } = body
    const updates: Record<string, unknown> = {}

    if (name !== undefined) {
      if (!name || !String(name).trim()) {
        return NextResponse.json({ error: 'Route name is required' }, { status: 400 })
      }
      let candidateName = String(name).trim()
      let otherRoute = await prisma.route.findFirst({ where: { name: candidateName, NOT: { id } } })
      let suffix = 2
      while (otherRoute) {
        candidateName = `${String(name).trim()} (${suffix})`
        otherRoute = await prisma.route.findFirst({ where: { name: candidateName, NOT: { id } } })
        suffix++
      }
      updates.name = candidateName
    }
    if (morningTime !== undefined) updates.morningTime = morningTime || null
    if (afternoonTime !== undefined) updates.afternoonTime = afternoonTime || null

    if (startPointName !== undefined) updates.startPointName = startPointName ? String(startPointName).trim() : null
    if (startLatitude !== undefined) {
      const num = startLatitude !== null && startLatitude !== '' ? Number(startLatitude) : null
      updates.startLatitude = num != null && !isNaN(num) ? num : null
    }
    if (startLongitude !== undefined) {
      const num = startLongitude !== null && startLongitude !== '' ? Number(startLongitude) : null
      updates.startLongitude = num != null && !isNaN(num) ? num : null
    }
    if (endPointName !== undefined) updates.endPointName = endPointName ? String(endPointName).trim() : null
    if (endLatitude !== undefined) {
      const num = endLatitude !== null && endLatitude !== '' ? Number(endLatitude) : null
      updates.endLatitude = num != null && !isNaN(num) ? num : null
    }
    if (endLongitude !== undefined) {
      const num = endLongitude !== null && endLongitude !== '' ? Number(endLongitude) : null
      updates.endLongitude = num != null && !isNaN(num) ? num : null
    }

    const route = await prisma.route.update({
      where: { id },
      data: updates,
    })

    // If stops are passed, sync stops safely
    if (Array.isArray(stops)) {
      await prisma.stop.deleteMany({ where: { routeId: id } })
      for (let idx = 0; idx < stops.length; idx++) {
        const s = stops[idx]
        const stopName = String(s.name || `Stop ${idx + 1}`).trim()
        if (stopName) {
          await prisma.stop.create({
            data: {
              routeId: id,
              name: stopName,
              latitude: Number(s.latitude ?? s.lat) || 0,
              longitude: Number(s.longitude ?? s.lng) || 0,
              order: idx + 1,
            }
          })
        }
      }
    }

    const updatedRouteWithStops = await prisma.route.findUnique({
      where: { id },
      include: {
        stops: { orderBy: { order: 'asc' } },
        _count: { select: { students: true, buses: true } }
      }
    })

    return NextResponse.json({ route: updatedRouteWithStops })
  } catch (error: unknown) {
    console.error('Route update error:', error)
    const msg = error instanceof Error ? error.message : 'Failed to update route'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getUserFromSession()
    if (!auth || (auth.role !== 'ADMIN' && auth.role !== 'SUPER_ADMIN' && auth.role !== 'SCHOOL_ADMIN')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.route.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 })
    }

    await prisma.stop.deleteMany({ where: { routeId: id } })
    await prisma.route.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code
    if (code === 'P2003') {
      return NextResponse.json({
        error: 'Cannot delete route because it has assigned buses or students. Unassign them first.'
      }, { status: 400 })
    }
    console.error('Route delete error:', error)
    return NextResponse.json({ error: 'Failed to delete route' }, { status: 500 })
  }
}
