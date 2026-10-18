-- CreateEnum
CREATE TYPE "FeedbackVerdict" AS ENUM ('FIXED', 'NOT_FIXED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'REOPENED';
ALTER TYPE "NotificationType" ADD VALUE 'DISPUTE_DISMISSED';

-- AlterEnum
ALTER TYPE "PhotoKind" ADD VALUE 'FEEDBACK';

-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "feedback_id" UUID;

-- CreateTable
CREATE TABLE "issue_feedback" (
    "id" UUID NOT NULL,
    "issue_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "verdict" "FeedbackVerdict" NOT NULL,
    "reason" TEXT,
    "round_resolved_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "issue_feedback_issue_id_user_id_round_resolved_at_key" ON "issue_feedback"("issue_id", "user_id", "round_resolved_at");

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_feedback_id_fkey" FOREIGN KEY ("feedback_id") REFERENCES "issue_feedback"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_feedback" ADD CONSTRAINT "issue_feedback_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_feedback" ADD CONSTRAINT "issue_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

