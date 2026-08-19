import { prisma } from "../lib/prisma.js";
import { seedInventoryForRoomType } from "../lib/seed-inventory.js";

const HOTEL_NAME = "Hiraya Test (Channex staging)";
const REAL_PROPERTY_ID = "16d58b92-d07e-4010-bd82-769ba302c0d0";

async function main() {
  let hotel = await prisma.hotel.findFirst({ where: { name: HOTEL_NAME } });
  if (!hotel) {
    hotel = await prisma.hotel.create({ data: { name: HOTEL_NAME, channexPropertyId: REAL_PROPERTY_ID } });
  } else if (hotel.channexPropertyId !== REAL_PROPERTY_ID) {
    hotel = await prisma.hotel.update({ where: { id: hotel.id }, data: { channexPropertyId: REAL_PROPERTY_ID } });
  }

  let roomType = await prisma.roomType.findFirst({ where: { hotelId: hotel.id, name: "Deluxe" } });
  if (!roomType) {
    roomType = await prisma.roomType.create({ data: { hotelId: hotel.id, name: "Deluxe", baseCapacity: 2 } });
  }

  const roomCount = await prisma.room.count({ where: { hotelId: hotel.id, roomTypeId: roomType.id } });
  if (roomCount === 0) {
    await prisma.room.create({ data: { hotelId: hotel.id, roomTypeId: roomType.id, label: "101" } });
    await prisma.room.create({ data: { hotelId: hotel.id, roomTypeId: roomType.id, label: "102" } });
  }

  let ratePlan = await prisma.ratePlan.findFirst({ where: { hotelId: hotel.id, roomTypeId: roomType.id, name: "Standard" } });
  if (!ratePlan) {
    ratePlan = await prisma.ratePlan.create({
      data: {
        hotelId: hotel.id,
        roomTypeId: roomType.id,
        name: "Standard",
        isRefundable: true,
        includesBreakfast: false,
        basePrice: 3000,
      },
    });
  }

  await seedInventoryForRoomType(roomType.id);

  console.log("hotelId:", hotel.id);
  console.log("roomTypeId:", roomType.id);
  console.log("ratePlanId:", ratePlan.id);
  console.log("channexPropertyId:", hotel.channexPropertyId);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
