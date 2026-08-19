-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "channexBookingId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_hotelId_channexBookingId_key" ON "Booking"("hotelId", "channexBookingId");
