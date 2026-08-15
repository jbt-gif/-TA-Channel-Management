import { prisma } from "../lib/prisma.js";

async function main() {
  const hotel = await prisma.hotel.create({ data: { name: "__constraint_verify_hotel__" } });
  const roomType = await prisma.roomType.create({
    data: { hotelId: hotel.id, name: "Verify Room", baseCapacity: 2 },
  });

  let rejected = false;
  let errorMessage = "";
  try {
    // availableCount 3, but bookedCount+heldCount = 5 — must be rejected by the CHECK constraint
    await prisma.$executeRawUnsafe(
      `INSERT INTO "DailyInventory" (id, "hotelId", "roomTypeId", date, "availableCount", "bookedCount", "heldCount", "isClosed", "createdAt", "updatedAt")
       VALUES ('checkconstrainttest01', '${hotel.id}', '${roomType.id}', CURRENT_DATE, 3, 4, 1, false, now(), now())`
    );
  } catch (err) {
    rejected = true;
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  console.log("Invalid write rejected by database:", rejected);
  if (rejected) {
    console.log("Rejected via constraint:", errorMessage.includes("DailyInventory_counts_check") ? "DailyInventory_counts_check (confirmed correct constraint)" : errorMessage);
  }

  // Cleanup
  await prisma.roomType.delete({ where: { id: roomType.id } });
  await prisma.hotel.delete({ where: { id: hotel.id } });

  if (!rejected) {
    console.error("FAILURE: invalid write was NOT rejected — CHECK constraint is not live");
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("Verification script failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
