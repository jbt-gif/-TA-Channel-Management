import cors from "cors";

const rawOrigins = process.env.CORS_ORIGIN;
const origins = (rawOrigins ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0);

function isValidOrigin(entry: string): boolean {
  if (entry.endsWith("/")) return false;
  try {
    new URL(entry);
    return true;
  } catch {
    return false;
  }
}

if (origins.length === 0 || !origins.every(isValidOrigin)) {
  console.error(
    "CORS_ORIGIN is missing, empty, or contains an invalid entry (must be a comma-separated list of exact origins, no trailing slash, e.g. https://your-app.vercel.app). Refusing to start — an unconfigured origin allowlist is a silent security gap."
  );
  process.exit(1);
}

export const corsMiddleware = cors({ origin: origins });
