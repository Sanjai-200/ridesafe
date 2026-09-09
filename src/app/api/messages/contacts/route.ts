import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/messages/contacts
 * Returns a list of contactable users for the current parent:
 * - ADMIN and SCHOOL_ADMIN in the same org as the parent's children
 * - The driver assigned to the parent's child's route
 */
export async function GET() {
  try {
    const user = await getUserFromSession()
    if (!user || user.role !== 'PARENT') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get parent's children and their routes/drivers
    const students = await prisma.student.findMany({
      where: { parentId: user.id },
      select: {
        organizationId: true,
        route: {
          select: {
            buses: {
              select: {
                driver: {
                  select: { id: true, name: true, role: true, phone: true }
                }
              }
            }
          }
        }
      }
    })

    const orgIds = [...new Set(students.map(s => s.organizationId).filter(Boolean) as string[])]
    const contacts: { id: string; name: string; role: string; phone?: string | null }[] = []
    const seenIds = new Set<string>()

    // Get Admins and School Admins in the same org
    if (orgIds.length > 0) {
      const adminUsers = await prisma.user.findMany({
        where: {
          organizationId: { in: orgIds },
          role: { in: ['ADMIN', 'SCHOOL_ADMIN'] }
        },
        select: { id: true, name: true, role: true, phone: true }
      })
      for (const u of adminUsers) {
        if (!seenIds.has(u.id)) {
          contacts.push(u)
          seenIds.add(u.id)
        }
      }
    }

    // Get driver(s) assigned to the child's route
    for (const student of students) {
      for (const bus of student.route?.buses || []) {
        if (bus.driver && !seenIds.has(bus.driver.id)) {
          contacts.push(bus.driver)
          seenIds.add(bus.driver.id)
        }
      }
    }

    return NextResponse.json({ contacts })
  } catch (error) {
    console.error('Contacts GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
