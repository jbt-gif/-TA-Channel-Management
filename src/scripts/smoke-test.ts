import { prisma } from "../lib/prisma.js";

const SMOKE_HOTEL_NAME = "__smoke_test_hotel__";

async function main() {
  // Idempotent: wipe any previous smoke-test run before inserting fresh data,
  // so this script is safe to run repeatedly (AC-4).
  const existing = await prisma.hotel.findFirst({ where: { name: SMOKE_HOTEL_NAME } });
  if (existing) {
    await prisma.room.deleteMany({ where: { hotelId: existing.id } });
    await prisma.ratePlan.deleteMany({ where: { hotelId: existing.id } });
    await prisma.roomType.deleteMany({ where: { hotelId: existing.id } });
    await prisma.user.deleteMany({ where: { hotelId: existing.id } });
    await prisma.hotel.delete({ where: { id: existing.id } });
    console.log("Cleaned up previous smoke-test run.");
  }

  const hotel = await prisma.hotel.create({
    data: { name: SMOKE_HOTEL_NAME },
  });
  console.log("Created Hotel:", hotel.id);

  const roles = ["SUPER_ADMIN", "HOTEL_ADMIN", "FRONT_DESK", "HOUSEKEEPING"] as const;
  for (const role of roles) {
    const user = await prisma.user.create({
      data: {
        hotelId: hotel.id,
        email: `${role.toLowerCase()}@smoke-test.local`,
        passwordHash: "not-a-real-hash-smoke-test-only",
        role,
      },
    });
    console.log(`Created User (${role}):`, user.id);
  }

  const roomType = await prisma.roomType.create({
    data: { hotelId: hotel.id, name: "Deluxe Ocean View", baseCapacity: 2 },
  });
  console.log("Created RoomType:", roomType.id);

  const ratePlan = await prisma.ratePlan.create({
    data: {
      roomTypeId: roomType.id,
      hotelId: hotel.id,
      name: "Flexible Rate",
      isRefundable: true,
      includesBreakfast: false,
      basePrice: 3500,
    },
  });
  console.log("Created RatePlan:", ratePlan.id);

  const room = await prisma.room.create({
    data: { hotelId: hotel.id, roomTypeId: roomType.id, label: "101" },
  });
  console.log("Created Room:", room.id);

  // Confirm all IDs are non-sequential cuids, not integers.
  const allIdsAreCuids = [hotel.id, roomType.id, ratePlan.id, room.id].every(
    (id) => /^c[a-z0-9]{20,}$/.test(id)
  );
  console.log("All IDs are non-sequential cuids:", allIdsAreCuids);

  // Confirm invalid enum values are rejected at the database level.
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "Room" (id, "hotelId", "roomTypeId", label, "housekeepingStatus", "createdAt", "updatedAt")
       VALUES ('smoketestbadenum0000', '${hotel.id}', '${roomType.id}', '999', 'NOT_A_REAL_STATUS', now(), now())`
    );
    console.log("ERROR: invalid enum insert was NOT rejected — this should not happen");
    process.exitCode = 1;
  } catch {
    console.log("Confirmed: invalid enum value was rejected by the database.");
  }

  console.log("Smoke test complete.");
}

main()
  .catch((err) => {
    console.error("Smoke test failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
