/**
 * Role-Permission Matrix
 * Single source of truth for RBAC access control across all modules.
 * Use canAccess() in API routes to guard resources.
 */

export type Role =
  | 'SUPER_ADMIN'
  | 'SCHOOL_ADMIN'
  | 'ADMIN'
  | 'DRIVER'
  | 'PARENT'

export type Resource =
  | 'organizations'
  | 'users'
  | 'students'
  | 'buses'
  | 'routes'
  | 'stops'
  | 'trips'
  | 'attendance'
  | 'messages'
  | 'notifications'
  | 'announcements'
  | 'calendar'
  | 'payments'
  | 'emergency'
  | 'analytics'
  | 'audit'
  | 'tracking'
  | 'student_daily_status'

export type Action = 'read' | 'write' | 'delete' | 'admin'

type PermissionMatrix = Record<Resource, Record<Action, Role[]>>

const matrix: PermissionMatrix = {
  organizations: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'],
    write:  ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
    delete: ['SUPER_ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  users: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'],
    write:  ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
    delete: ['SUPER_ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  students: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'],
    write:  ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'],
    delete: ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  buses: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER'],
    write:  ['SUPER_ADMIN', 'ADMIN'],
    delete: ['SUPER_ADMIN', 'ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  routes: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'],
    write:  ['SUPER_ADMIN', 'ADMIN'],
    delete: ['SUPER_ADMIN', 'ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  stops: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'],
    write:  ['SUPER_ADMIN', 'ADMIN'],
    delete: ['SUPER_ADMIN', 'ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  trips: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'],
    write:  ['SUPER_ADMIN', 'ADMIN', 'DRIVER'],
    delete: ['SUPER_ADMIN', 'ADMIN'],
    admin:  ['SUPER_ADMIN', 'ADMIN'],
  },
  attendance: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'],
    write:  ['SUPER_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'],
    delete: ['SUPER_ADMIN', 'ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  messages: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'],
    write:  ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'],
    delete: ['SUPER_ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  notifications: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'],
    write:  ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'],
    delete: ['SUPER_ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  announcements: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'],
    write:  ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'],
    delete: ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  calendar: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'],
    write:  ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
    delete: ['SUPER_ADMIN', 'SCHOOL_ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  payments: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'PARENT'],
    write:  ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'],
    delete: ['SUPER_ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  emergency: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'],
    write:  ['SUPER_ADMIN', 'ADMIN', 'DRIVER'],
    delete: ['SUPER_ADMIN', 'ADMIN'],
    admin:  ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'],
  },
  analytics: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'],
    write:  ['SUPER_ADMIN'],
    delete: ['SUPER_ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  audit: {
    read:   ['SUPER_ADMIN'],
    write:  ['SUPER_ADMIN'],
    delete: ['SUPER_ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  tracking: {
    read:   ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'],
    write:  ['SUPER_ADMIN', 'ADMIN', 'DRIVER'],
    delete: ['SUPER_ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
  student_daily_status: {
    read:   ['SUPER_ADMIN', 'ADMIN', 'SCHOOL_ADMIN', 'DRIVER', 'PARENT'],
    write:  ['PARENT'],
    delete: ['SUPER_ADMIN'],
    admin:  ['SUPER_ADMIN'],
  },
}

/**
 * Check whether a given role is permitted to perform an action on a resource.
 * @example canAccess('PARENT', 'payments', 'read') // true
 * @example canAccess('DRIVER', 'organizations', 'write') // false
 */
export function canAccess(role: Role, resource: Resource, action: Action): boolean {
  return matrix[resource]?.[action]?.includes(role) ?? false
}

/**
 * Assert access and throw a structured error if denied.
 * Use in API routes for clean guard clauses.
 */
export function assertAccess(
  role: Role,
  resource: Resource,
  action: Action
): void {
  if (!canAccess(role, resource, action)) {
    throw new PermissionError(
      `Role '${role}' is not authorized to perform '${action}' on '${resource}'`
    )
  }
}

export class PermissionError extends Error {
  readonly status = 403
  constructor(message: string) {
    super(message)
    this.name = 'PermissionError'
  }
}
