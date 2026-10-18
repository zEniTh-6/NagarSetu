-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'REROUTED';
ALTER TYPE "NotificationType" ADD VALUE 'LINKED_DUPLICATE';

-- AlterEnum
ALTER TYPE "SupportSource" ADD VALUE 'LINKED_BY_ADMIN';

-- AlterTable
ALTER TABLE "issue_flags" ADD COLUMN     "confirm_reason" TEXT,
ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "confirmed_by_id" UUID;

-- AddForeignKey
ALTER TABLE "issue_flags" ADD CONSTRAINT "issue_flags_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

