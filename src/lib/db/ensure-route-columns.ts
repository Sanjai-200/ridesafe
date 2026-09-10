import prisma from '@/lib/db/prisma'

let didEnsure = false

/**
 * Ensures that newly added geo columns on the Route table exist in PostgreSQL.
 * Executes each statement individually so PostgreSQL prepared statements never fail.
 */
export async function ensureRouteColumns() {
  if (didEnsure) return

  const statements = [
    'ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "startPointName" TEXT;',
    'ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "startLatitude" DOUBLE PRECISION;',
    'ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "startLongitude" DOUBLE PRECISION;',
    'ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "endPointName" TEXT;',
    'ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "endLatitude" DOUBLE PRECISION;',
    'ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "endLongitude" DOUBLE PRECISION;',
  ]

  let allSucceeded = true
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql)
    } catch (err) {
      allSucceeded = false
      console.warn('ensureRouteColumns notice for SQL:', sql, err)
    }
  }

  if (allSucceeded) {
    didEnsure = true
  }
}

