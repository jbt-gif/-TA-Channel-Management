-- CreateEnum
CREATE TYPE "PushQueueType" AS ENUM ('AVAILABILITY', 'RATE');

-- CreateEnum
CREATE TYPE "PushQueueStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "PushQueue" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "type" "PushQueueType" NOT NULL,
    "roomTypeId" TEXT,
    "ratePlanId" TEXT,
    "dateFrom" DATE NOT NULL,
    "dateTo" DATE NOT NULL,
    "status" "PushQueueStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushQueue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushQueue_hotelId_status_idx" ON "PushQueue"("hotelId", "status");

-- AddForeignKey
ALTER TABLE "PushQueue" ADD CONSTRAINT "PushQueue_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
