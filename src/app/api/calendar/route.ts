import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'
import { notify } from '@/lib/services/notificationService'

export async function GET() {
  try {
    const session = await getUserFromSession()
    const user = session ? await prisma.user.findUnique({ where: { id: session.id }, select: { role: true, organizationId: true } }) : null

    const isAdmin = user && ['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(user.role)
    const isSuperAdmin = user?.role === 'SUPER_ADMIN'

    const orgScope = isSuperAdmin
      ? {}
      : { OR: [{ organizationId: user?.organizationId ?? null }, { organizationId: null }] }

    const events = await prisma.academicEvent.findMany({
      where: isAdmin ? orgScope : { ...orgScope, isPublic: true },
      orderBy: { startDate: 'asc' }
    })

    return NextResponse.json({ events })
  } catch (error) {
    console.error('Academic Calendar GET Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getUserFromSession()
    if (!session || !['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = await prisma.user.findUnique({ where: { id: session.id }, select: { organizationId: true } })

    const body = await request.json()
    const { title, description, startDate, endDate, type, isPublic, color, noBusService } = body

    if (!title || !String(title).trim() || !startDate) {
      return NextResponse.json({ error: 'Title and Start Date are required' }, { status: 400 })
    }

    const event = await prisma.academicEvent.create({
      data: {
        title: String(title).trim(),
        description: description && String(description).trim() ? String(description).trim() : null,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        type: type || 'EVENT',
        isPublic: isPublic !== undefined ? isPublic : true,
        color: color || '#1E3A8A',
        organizationId: user?.organizationId ?? null,
        noBusService: Boolean(noBusService),
      }
    })

    // ── Cross-Module: If no-bus-service, notify all parents + drivers in org ───
    if (noBusService && user?.organizationId) {
      const dateStr = new Date(startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      const recipients = await prisma.user.findMany({
        where: {
          organizationId: user.organizationId,
          role: { in: ['PARENT', 'DRIVER'] }
        },
        select: { id: true }
      })
      for (const r of recipients) {
        await notify({
          userId: r.id,
          title: `⛔ No Bus Service — ${dateStr}`,
          body: `"${String(title).trim()}" — There will be NO bus service on ${dateStr}. Please make alternative arrangements.`,
          type: 'NO_BUS_SERVICE',
        }).catch(() => {})
      }
    }

    return NextResponse.json({ event })
  } catch (error) {
    console.error('Academic Calendar POST Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
