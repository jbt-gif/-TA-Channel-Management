import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import type { AddressInfo } from "node:net";
import { app } from "../app.js";
import { prisma } from "../lib/prisma.js";

const SMOKE_HOTEL_NAME = "__smoke_test_auth_hotel__";
const TEST_EMAIL = "authsmoketest@smoke-test.local";
const TEST_PASSWORD = "AuthSmokeTest123!";

async function main() {
  const existing = await prisma.hotel.findFirst({ where: { name: SMOKE_HOTEL_NAME } });
  if (existing) {
    await prisma.user.deleteMany({ where: { hotelId: existing.id } });
    await prisma.hotel.delete({ where: { id: existing.id } });
    console.log("Cleaned up previous auth smoke-test run.");
  }

  const hotel = await prisma.hotel.create({ data: { name: SMOKE_HOTEL_NAME } });
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  const user = await prisma.user.create({
    data: { hotelId: hotel.id, email: TEST_EMAIL, passwordHash, role: "FRONT_DESK" },
  });

  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const checks: Array<[string, boolean]> = [];

  try {
    // AC-1: valid login returns 200 + token
    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    const loginBody = (await loginRes.json()) as { token?: string };
    checks.push(["AC-1: valid login returns 200", loginRes.status === 200]);
    checks.push(["AC-1: valid login returns a token", typeof loginBody.token === "string"]);
    const validToken = loginBody.token ?? "";

    // AC-2: wrong password and nonexistent email return identical 401 bodies
    const wrongPwRes = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: "WrongPassword123!" }),
    });
    const wrongPwBody = await wrongPwRes.text();
    checks.push(["AC-2: wrong password returns 401", wrongPwRes.status === 401]);

    const noEmailRes = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@smoke-test.local", password: "WrongPassword123!" }),
    });
    const noEmailBody = await noEmailRes.text();
    checks.push(["AC-2: nonexistent email returns 401", noEmailRes.status === 401]);
    checks.push(["AC-2: wrong-password and nonexistent-email bodies are identical", wrongPwBody === noEmailBody]);

    // AC-3: /api/me with no token is rejected
    const noTokenRes = await fetch(`${base}/api/me`);
    checks.push(["AC-3: /api/me with no token returns 401", noTokenRes.status === 401]);

    // AC-3: /api/me with a malformed token is rejected
    const malformedRes = await fetch(`${base}/api/me`, {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    checks.push(["AC-3: /api/me with a malformed token returns 401", malformedRes.status === 401]);

    // AC-3: /api/me with a token signed by a different secret is rejected
    const bogusKey = new TextEncoder().encode("a-completely-different-32-byte-secret-key-here");
    const bogusToken = await new SignJWT({ userId: "x", hotelId: "y", role: "FRONT_DESK" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(bogusKey);
    const wrongSecretRes = await fetch(`${base}/api/me`, {
      headers: { Authorization: `Bearer ${bogusToken}` },
    });
    checks.push(["AC-3: /api/me with a wrong-secret token returns 401", wrongSecretRes.status === 401]);

    // AC-4: /api/me with a valid token returns the correct hotelId/role
    const meRes = await fetch(`${base}/api/me`, {
      headers: { Authorization: `Bearer ${validToken}` },
    });
    const meBody = (await meRes.json()) as { userId?: string; hotelId?: string; role?: string };
    checks.push(["AC-4: /api/me with a valid token returns 200", meRes.status === 200]);
    checks.push(["AC-4: /api/me returns the correct hotelId", meBody.hotelId === hotel.id]);
    checks.push(["AC-4: /api/me returns the correct role", meBody.role === "FRONT_DESK"]);
    checks.push(["AC-4: /api/me returns the correct userId", meBody.userId === user.id]);
  } finally {
    server.close();
  }

  let allPassed = true;
  for (const [label, passed] of checks) {
    console.log(`${passed ? "PASS" : "FAIL"} — ${label}`);
    if (!passed) allPassed = false;
  }

  if (!allPassed) {
    process.exitCode = 1;
    throw new Error("One or more checks failed — see FAIL lines above.");
  }

  console.log("All auth smoke-test checks passed.");
}

main()
  .catch((err) => {
    console.error("Auth smoke test failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
