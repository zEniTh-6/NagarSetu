-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'DEADLINE_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_ENDED';

-- AlterTable
ALTER TABLE "repair_submissions" ADD COLUMN     "ai_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ai_model" TEXT,
ADD COLUMN     "gps_distance_m" DOUBLE PRECISION;


-- At most one repair submission waiting for review per assignment (hand-written: Prisma has no partial indexes).
CREATE UNIQUE INDEX "repair_submissions_one_pending_per_assignment"
  ON "repair_submissions" ("assignment_id") WHERE "status" = 'SUBMITTED';
