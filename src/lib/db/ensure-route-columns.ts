import prisma from '@/lib/db/prisma'

let didEnsure = false

/**
 * Ensures that newly added geo columns on the Route table exist in PostgreSQL.
 * Safe to call on every route mutation; executes in <5ms with IF NOT EXISTS.
 */
export async function ensureRouteColumns() {
  if (didEnsure) return
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "startPointName" TEXT;
      ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "startLatitude" DOUBLE PRECISION;
      ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "startLongitude" DOUBLE PRECISION;
      ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "endPointName" TEXT;
      ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "endLatitude" DOUBLE PRECISION;
      ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "endLongitude" DOUBLE PRECISION;
    `)
    didEnsure = true
  } catch (err) {
    console.warn('ensureRouteColumns raw SQL notice (non-fatal):', err)
  }
}
