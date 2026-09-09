import { EventEmitter } from 'events'

/**
 * In-process cross-module event bus.
 * Used to propagate state changes across API routes within the same process.
 *
 * NOTE: This is a single-process event emitter. In a multi-instance serverless
 * deployment (Vercel), each instance has its own emitter. For cross-instance
 * propagation, use Redis pub/sub (already wired in src/lib/db/redis.ts).
 * The event bus is sufficient for same-request side-effects and dev environments.
 */

export type RideSafeEvent =
  | 'student.assigned'        // { studentId, routeId, driverId, parentId, organizationId }
  | 'student.reassigned'      // { studentId, oldRouteId, newRouteId, organizationId }
  | 'trip.started'            // { tripId, routeId, driverId, busId, session }
  | 'trip.completed'          // { tripId, routeId, driverId, session }
  | 'trip.delayed'            // { tripId, routeId, driverId, delayMinutes, delayReason }
  | 'attendance.pickup'       // { tripId, studentId, stopId, parentId }
  | 'attendance.dropoff'      // { tripId, studentId, stopId, parentId }
  | 'attendance.absent'       // { tripId, studentId, stopId, source: 'DRIVER'|'PARENT' }
  | 'parent.boarding_declared'// { studentId, parentId, date }
  | 'parent.absent_declared'  // { studentId, parentId, date }
  | 'stop.arrived'            // { tripId, stopId, latitude, longitude }
  | 'emergency.created'       // { emergencyId, driverId, routeId }
  | 'calendar.no_service'     // { eventId, organizationId, startDate, endDate }
  | 'invoice.created'         // { paymentId, parentId, amount }
  | 'announcement.sent'       // { announcementId, targetRole, organizationId }

class RideSafeEventBus extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(50)
  }

  emit<T extends Record<string, unknown>>(event: RideSafeEvent, payload: T): boolean {
    return super.emit(event, payload)
  }

  on<T extends Record<string, unknown>>(
    event: RideSafeEvent,
    listener: (payload: T) => void
  ): this {
    return super.on(event, listener as (payload: unknown) => void)
  }

  once<T extends Record<string, unknown>>(
    event: RideSafeEvent,
    listener: (payload: T) => void
  ): this {
    return super.once(event, listener as (payload: unknown) => void)
  }

  off<T extends Record<string, unknown>>(
    event: RideSafeEvent,
    listener: (payload: T) => void
  ): this {
    return super.off(event, listener as (payload: unknown) => void)
  }
}

// Singleton export — one bus per process
export const eventBus = new RideSafeEventBus()
