import { SignJWT, jwtVerify } from "jose";

const MIN_SECRET_LENGTH = 32;
const TOKEN_EXPIRY = "12h";

const rawSecret = process.env.JWT_SECRET;
if (!rawSecret || rawSecret.length < MIN_SECRET_LENGTH) {
  console.error(
    `JWT_SECRET is missing or shorter than ${MIN_SECRET_LENGTH} characters. Refusing to start — a weak secret is forgeable.`
  );
  process.exit(1);
}
const secretKey = new TextEncoder().encode(rawSecret);

export interface AuthClaims {
  userId: string;
  hotelId: string;
  role: string;
}

export async function signToken(claims: AuthClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TOKEN_EXPIRY)
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<AuthClaims> {
  const { payload } = await jwtVerify(token, secretKey);
  const { userId, hotelId, role } = payload as Record<string, unknown>;
  if (typeof userId !== "string" || typeof hotelId !== "string" || typeof role !== "string") {
    throw new Error("Malformed token payload");
  }
  return { userId, hotelId, role };
}
