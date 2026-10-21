-- CreateEnum
CREATE TYPE "CaptureSource" AS ENUM ('CAMERA', 'GALLERY');

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "note" TEXT;

-- AlterTable
ALTER TABLE "repair_submissions" ADD COLUMN     "capture_source" "CaptureSource";
