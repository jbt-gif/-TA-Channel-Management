import { prisma } from "../lib/prisma.js";

async function main() {
  const hotels = await prisma.hotel.findMany({ where: { name: "__smoke_test_hotel__" } });
  for (const hotel of hotels) {
    await prisma.room.deleteMany({ where: { hotelId: hotel.id } });
    await prisma.ratePlan.deleteMany({ where: { hotelId: hotel.id } });
    await prisma.roomType.deleteMany({ where: { hotelId: hotel.id } });
    await prisma.user.deleteMany({ where: { hotelId: hotel.id } });
    await prisma.hotel.delete({ where: { id: hotel.id } });
  }
  console.log(`Cleared ${hotels.length} smoke-test hotel(s) and their data.`);
}

main()
  .catch((err) => {
    console.error("Cleanup failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
