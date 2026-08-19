-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN     "downpaymentPercent" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "RatePlan" ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "lastModifiedByUserId" TEXT;

-- AlterTable
ALTER TABLE "RoomType" ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "lastModifiedByUserId" TEXT;
