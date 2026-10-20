-- CreateEnum
CREATE TYPE "CommentReportReason" AS ENUM ('SPAM', 'ABUSIVE', 'OFF_TOPIC', 'OTHER');

-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "area_looked_up_at" TIMESTAMP(3),
ADD COLUMN     "area_lookup_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "area_name" TEXT;

-- CreateTable
CREATE TABLE "comment_reports" (
    "id" UUID NOT NULL,
    "comment_id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reason" "CommentReportReason" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comment_reports_comment_id_reporter_id_key" ON "comment_reports"("comment_id", "reporter_id");

-- AddForeignKey
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reports" ADD CONSTRAINT "comment_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
