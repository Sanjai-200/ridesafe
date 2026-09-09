import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromSession()
    if (!user || user.role === 'PARENT' || user.role === 'DRIVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.stop.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Stop not found' }, { status: 404 })
    }

    const data = await request.json()
    const updated = await prisma.stop.update({
      where: { id },
      data: {
        name: data.name !== undefined ? String(data.name).trim() : undefined,
        latitude: data.latitude !== undefined ? Number(data.latitude) : undefined,
        longitude: data.longitude !== undefined ? Number(data.longitude) : undefined,
        order: data.order !== undefined ? Number(data.order) : undefined,
      }
    })

    return NextResponse.json({ stop: updated })
  } catch (error) {
    console.error('Stop PATCH Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromSession()
    if (!user || user.role === 'PARENT' || user.role === 'DRIVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.stop.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Stop not found' }, { status: 404 })
    }

    await prisma.student.updateMany({ where: { pickupStopId: id }, data: { pickupStopId: null } })
    await prisma.student.updateMany({ where: { dropoffStopId: id }, data: { dropoffStopId: null } })
    await prisma.attendance.updateMany({ where: { stopId: id }, data: { stopId: null } })
    await prisma.stop.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Stop DELETE Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
