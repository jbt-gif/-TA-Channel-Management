import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";

const VALID_ROLES = ["SUPER_ADMIN", "HOTEL_ADMIN", "FRONT_DESK", "HOUSEKEEPING"] as const;
type Role = (typeof VALID_ROLES)[number];

const MIN_PASSWORD_LENGTH = 12;
const BCRYPT_COST = 12;

function isValidRole(value: string): value is Role {
  return (VALID_ROLES as readonly string[]).includes(value);
}

async function main() {
  const [hotelId, rawEmail, password, role] = process.argv.slice(2);

  if (!hotelId || !rawEmail || !password || !role) {
    console.error(
      "Usage: npx tsx src/scripts/create-user.ts <hotelId> <email> <password> <role>"
    );
    console.error(`Roles: ${VALID_ROLES.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (!isValidRole(role)) {
    console.error(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exitCode = 1;
    return;
  }

  const email = rawEmail.trim().toLowerCase();

  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel) {
    console.error(`No Hotel found with id "${hotelId}".`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  const user = await prisma.user.create({
    data: { hotelId, email, passwordHash, role },
  });

  console.log("User created:");
  console.log(JSON.stringify({ id: user.id, email: user.email, role: user.role, hotelId: user.hotelId }, null, 2));
}

main()
  .catch((err) => {
    console.error("create-user failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
