import prisma from './prisma'

let isMigrated = false
let migrationInProgress: Promise<void> | null = null

/**
 * Universal auto-migration runner.
 * Automatically runs idempotent DDL statements in PostgreSQL to ensure that
 * all newly declared tables and columns exist in the remote database.
 */
export async function autoMigrateDatabase(): Promise<void> {
  if (isMigrated) return
  if (migrationInProgress) return migrationInProgress

  migrationInProgress = (async () => {
    const ddlList = [
      // 1. Create StudentDailyStatus table if missing
      `CREATE TABLE IF NOT EXISTS "StudentDailyStatus" (
        "id" TEXT NOT NULL,
        "studentId" TEXT NOT NULL,
        "parentId" TEXT NOT NULL,
        "date" TIMESTAMP(3) NOT NULL,
        "status" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "StudentDailyStatus_pkey" PRIMARY KEY ("id")
      );`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "StudentDailyStatus_studentId_date_key" ON "StudentDailyStatus"("studentId", "date");`,

      // 2. Route geo columns
      `ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "startPointName" TEXT;`,
      `ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "startLatitude" DOUBLE PRECISION;`,
      `ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "startLongitude" DOUBLE PRECISION;`,
      `ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "endPointName" TEXT;`,
      `ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "endLatitude" DOUBLE PRECISION;`,
      `ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "endLongitude" DOUBLE PRECISION;`,

      // 3. Trip session and delay columns
      `ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "session" TEXT DEFAULT 'MORNING';`,
      `ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "delayMinutes" INTEGER DEFAULT 0;`,
      `ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "delayReason" TEXT;`,

      // 4. Payment columns
      `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "invoiceUrl" TEXT;`,
      `ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "description" TEXT;`,

      // 5. AcademicEvent columns
      `ALTER TABLE "AcademicEvent" ADD COLUMN IF NOT EXISTS "noBusService" BOOLEAN DEFAULT false;`,

      // 6. EmergencyAlert source
      `ALTER TABLE "EmergencyAlert" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'DRIVER';`,

      // 7. Attendance confirmation flags
      `ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "parentConfirmedPickup" BOOLEAN DEFAULT false;`,
      `ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "parentConfirmedDropoff" BOOLEAN DEFAULT false;`,
    ]

    for (const sql of ddlList) {
      try {
        await prisma.$executeRawUnsafe(sql)
      } catch (err) {
        console.warn('Auto-migrate notice (non-fatal):', sql.substring(0, 45), err)
      }
    }

    isMigrated = true
  })()

  return migrationInProgress
}
