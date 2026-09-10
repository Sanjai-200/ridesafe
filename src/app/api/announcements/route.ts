import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN']

// List past announcements (Admins see all; Parents and Drivers see relevant broadcasts)
export async function GET() {
  try {
    const user = await getUserFromSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isPrivileged = ADMIN_ROLES.includes(user.role)
    const whereClause: Record<string, unknown> = {}

    if (!isPrivileged) {
      whereClause.targetRole = { in: ['ALL', user.role] }
    }

    const announcements = await prisma.announcement.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    // Resolve creator info
    const creatorIds = Array.from(new Set(announcements.map(a => a.createdBy).filter(Boolean))) as string[]
    const creators = creatorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, name: true, role: true }
        })
      : []
    const creatorMap = new Map(creators.map(c => [c.id, c]))

    const enriched = announcements.map(a => {
      const creator = a.createdBy ? creatorMap.get(a.createdBy) : null
      return {
        ...a,
        creator: creator || null,
        senderName: creator ? creator.name : 'School Administration',
        senderRole: creator ? creator.role : 'ADMIN',
      }
    })

    return NextResponse.json({ announcements: enriched })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Broadcast announcement as notifications, and keep a record of the broadcast itself
export async function POST(req: Request) {
  try {
    const user = await getUserFromSession()
    if (!user || !ADMIN_ROLES.includes(user.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { title, body, targetRole, type } = await req.json()
    if (!title?.trim() || !body?.trim()) return NextResponse.json({ error: 'Title and body required' }, { status: 400 })

    // Find target users
    const where: { role?: string } = {}
    if (targetRole && targetRole !== 'ALL') where.role = targetRole

    const users = await prisma.user.findMany({ where, select: { id: true } })

    // Create notifications for targeted users
    let sentCount = 0
    if (users.length > 0) {
      for (const u of users) {
        try {
          await prisma.notification.create({
            data: {
              userId: u.id,
              title: title.trim(),
              body: body.trim(),
              type: type || 'INFO',
            }
          })
          sentCount++
        } catch {}
      }
    }

    // Record the broadcast itself so it can be listed later
    const announcement = await prisma.announcement.create({
      data: {
        title: title.trim(),
        body: body.trim(),
        targetRole: targetRole || 'ALL',
        type: type || 'INFO',
        sentCount,
        createdBy: user.id,
      }
    })

    return NextResponse.json({ sent: sentCount, targetRole: targetRole || 'ALL', announcement })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
