/*
  Warnings:

  - Added the required column `basePrice` to the `RatePlan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RatePlan" ADD COLUMN     "basePrice" DECIMAL(10,2) NOT NULL;

-- CreateTable
CREATE TABLE "DailyInventory" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "availableCount" INTEGER NOT NULL,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "heldCount" INTEGER NOT NULL DEFAULT 0,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlanDailyRate" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "minStay" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RatePlanDailyRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyInventory_hotelId_idx" ON "DailyInventory"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyInventory_roomTypeId_date_key" ON "DailyInventory"("roomTypeId", "date");

-- CreateIndex
CREATE INDEX "RatePlanDailyRate_hotelId_idx" ON "RatePlanDailyRate"("hotelId");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlanDailyRate_ratePlanId_date_key" ON "RatePlanDailyRate"("ratePlanId", "date");

-- AddForeignKey
ALTER TABLE "DailyInventory" ADD CONSTRAINT "DailyInventory_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyInventory" ADD CONSTRAINT "DailyInventory_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanDailyRate" ADD CONSTRAINT "RatePlanDailyRate_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlanDailyRate" ADD CONSTRAINT "RatePlanDailyRate_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
