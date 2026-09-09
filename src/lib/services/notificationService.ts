import prisma from '@/lib/db/prisma'

export type NotificationType =
  | 'INFO'
  | 'SUCCESS'
  | 'WARNING'
  | 'ERROR'
  | 'TRIP_STARTED'
  | 'TRIP_COMPLETED'
  | 'STUDENT_BOARDED'
  | 'STUDENT_DROPPED'
  | 'STUDENT_ABSENT'
  | 'DELAY'
  | 'EMERGENCY'
  | 'PAYMENT'
  | 'ANNOUNCEMENT'
  | 'NO_SERVICE'
  | 'PARENT_BOARDING'
  | 'STUDENT_ASSIGNED'
  | 'BUS_APPROACHING'

export interface NotifyParams {
  userId: string
  title: string
  body: string
  type?: NotificationType
}

/**
 * Create a DB notification for a single user.
 * Fire-and-forget — errors are logged but never block the caller.
 */
export async function notify({
  userId,
  title,
  body,
  type = 'INFO',
}: NotifyParams): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId, title, body, type },
    })
  } catch (err) {
    console.error('[NotificationService] Failed to create notification:', err)
  }
}

/**
 * Notify multiple users in parallel.
 */
export async function notifyMany(
  users: string[],
  title: string,
  body: string,
  type: NotificationType = 'INFO'
): Promise<void> {
  if (!users.length) return
  await Promise.allSettled(
    users.map((userId) => notify({ userId, title, body, type }))
  )
}

/**
 * Notify all users with a given role inside an organization.
 */
export async function notifyByRole({
  organizationId,
  role,
  title,
  body,
  type = 'INFO',
}: {
  organizationId: string
  role: string | string[]
  title: string
  body: string
  type?: NotificationType
}): Promise<void> {
  try {
    const roles = Array.isArray(role) ? role : [role]
    const users = await prisma.user.findMany({
      where: { organizationId, role: { in: roles } },
      select: { id: true },
    })
    await notifyMany(
      users.map((u) => u.id),
      title,
      body,
      type
    )
  } catch (err) {
    console.error('[NotificationService] Failed notifyByRole:', err)
  }
}

/**
 * Notify all parents whose children are on a given route.
 */
export async function notifyRouteParents({
  routeId,
  title,
  body,
  type = 'INFO',
}: {
  routeId: string
  title: string
  body: string
  type?: NotificationType
}): Promise<void> {
  try {
    const students = await prisma.student.findMany({
      where: { routeId, parentId: { not: null } },
      select: { parentId: true },
    })
    const parentIds = [
      ...new Set(students.map((s) => s.parentId).filter(Boolean) as string[]),
    ]
    await notifyMany(parentIds, title, body, type)
  } catch (err) {
    console.error('[NotificationService] Failed notifyRouteParents:', err)
  }
}

/**
 * Notify all admins and school admins in an org. Optionally includes SUPER_ADMINs globally.
 */
export async function notifyAdmins({
  organizationId,
  title,
  body,
  type = 'INFO',
  includeSuperAdmin = true,
}: {
  organizationId: string
  title: string
  body: string
  type?: NotificationType
  includeSuperAdmin?: boolean
}): Promise<void> {
  const roles: string[] = ['ADMIN', 'SCHOOL_ADMIN']
  if (includeSuperAdmin) roles.push('SUPER_ADMIN')
  await notifyByRole({ organizationId, role: roles, title, body, type })
  // Also notify SUPER_ADMINs globally (no org filter)
  if (includeSuperAdmin) {
    try {
      const superAdmins = await prisma.user.findMany({
        where: { role: 'SUPER_ADMIN' },
        select: { id: true },
      })
      await notifyMany(
        superAdmins.map((u) => u.id),
        title,
        body,
        type
      )
    } catch (err) {
      console.error('[NotificationService] Failed to notify super admins:', err)
    }
  }
}
