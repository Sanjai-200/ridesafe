import { NextResponse, NextRequest } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/driver/daily-status?routeId=xxx
 * Returns today's parent-reported daily statuses for all students on the route.
 * Driver uses this to know which students are boarding vs absent before a stop.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromSession()
    if (!user || (user.role !== 'DRIVER' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN' && user.role !== 'SCHOOL_ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const routeId = searchParams.get('routeId')
    if (!routeId) return NextResponse.json({ error: 'routeId required' }, { status: 400 })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today.getTime() + 86400000)

    const statuses = await prisma.studentDailyStatus.findMany({
      where: {
        date: { gte: today, lt: tomorrow },
        student: { routeId }
      },
      select: {
        studentId: true,
        status: true,
        student: { select: { name: true } }
      }
    })

    // Build map: studentId -> { status, studentName }
    const statusMap: Record<string, { status: string; name: string }> = {}
    for (const s of statuses) {
      statusMap[s.studentId] = { status: s.status, name: s.student.name }
    }

    return NextResponse.json({ statuses: statusMap, date: today.toISOString().slice(0, 10) })
  } catch (error) {
    console.error('Driver daily-status GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
