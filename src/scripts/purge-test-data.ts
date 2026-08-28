import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

// Every hotel EXCEPT this one is smoke-test/checkpoint residue that must not
// survive into the internet-facing staging environment. This name is the
// intended, reusable demo dataset — see seed-channex-test-hotel.ts.
const KEEP_HOTEL_NAME = "Hiraya Test (Channex staging)";

async function deleteHotelAndDependents(hotelId: string): Promise<void> {
  // FK-safe order — matches every existing smoke-test script's own cleanup block.
  await prisma.dailyInventory.deleteMany({ where: { hotelId } });
  await prisma.ratePlanDailyRate.deleteMany({ where: { hotelId } });
  await prisma.bookingItem.deleteMany({ where: { booking: { hotelId } } });
  await prisma.payment.deleteMany({ where: { booking: { hotelId } } });
  await prisma.booking.deleteMany({ where: { hotelId } });
  await prisma.guest.deleteMany({ where: { hotelId } });
  await prisma.channelMapping.deleteMany({ where: { hotelId } });
  await prisma.room.deleteMany({ where: { hotelId } });
  await prisma.ratePlan.deleteMany({ where: { hotelId } });
  await prisma.roomType.deleteMany({ where: { hotelId } });
  await prisma.user.deleteMany({ where: { hotelId } });
  await prisma.hotel.delete({ where: { id: hotelId } });
}

function generatePassword(): string {
  return randomBytes(24).toString("base64url");
}

async function main() {
  const allHotels = await prisma.hotel.findMany({ select: { id: true, name: true } });
  const toDelete = allHotels.filter((h) => h.name !== KEEP_HOTEL_NAME);

  for (const hotel of toDelete) {
    console.log(`Deleting hotel: ${hotel.name} (${hotel.id})`);
    await deleteHotelAndDependents(hotel.id);
  }
  console.log(`Deleted ${toDelete.length} test/checkpoint hotel(s).`);

  const keepHotel = allHotels.find((h) => h.name === KEEP_HOTEL_NAME);
  if (!keepHotel) {
    console.log(`No "${KEEP_HOTEL_NAME}" hotel found — nothing to rotate.`);
    return;
  }

  const usersToRotate = await prisma.user.findMany({
    where: { hotelId: keepHotel.id },
    select: { id: true, email: true, role: true },
  });

  const rotated: Array<{ email: string; role: string; password: string }> = [];
  for (const user of usersToRotate) {
    const newPassword = generatePassword();
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    rotated.push({ email: user.email, role: user.role, password: newPassword });
  }

  console.log(`Rotated ${rotated.length} user password(s) on "${KEEP_HOTEL_NAME}":`);
  for (const r of rotated) {
    console.log(`  ${r.email} (${r.role}): ${r.password}`);
  }
  console.log("Save these now — this is the only time the plaintext is shown.");
}

main()
  .catch((err) => {
    console.error("Purge failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
