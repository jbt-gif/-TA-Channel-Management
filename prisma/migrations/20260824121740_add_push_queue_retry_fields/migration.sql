-- AlterTable
ALTER TABLE "PushQueue" ADD COLUMN     "retriedByUserId" TEXT,
ADD COLUMN     "lastRetriedAt" TIMESTAMP(3);
