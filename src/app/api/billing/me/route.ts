import { NextResponse } from 'next/server'
import prisma from '@/lib/db/prisma'
import { getUserFromSession } from '@/lib/auth/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/billing/me
 * Returns the current parent's own payment records.
 */
export async function GET() {
  try {
    const user = await getUserFromSession()
    if (!user || user.role !== 'PARENT') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const payments = await prisma.payment.findMany({
      where: { parentId: user.id },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ payments })
  } catch (e) {
    console.error('Billing /me error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
