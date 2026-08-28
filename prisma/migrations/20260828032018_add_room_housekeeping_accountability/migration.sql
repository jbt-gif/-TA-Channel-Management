-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "lastChangedAt" TIMESTAMP(3),
ADD COLUMN     "lastChangedByUserId" TEXT;
