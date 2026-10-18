-- AlterTable
ALTER TABLE "issues" ADD COLUMN     "embedded_at" TIMESTAMP(3),
ADD COLUMN     "embedding" vector(768),
ADD COLUMN     "embedding_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "embedding_model" TEXT;

