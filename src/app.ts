import express from "express";
import { authRouter } from "./routes/auth.js";
import { roomTypesRouter } from "./routes/roomTypes.js";
import { ratePlansRouter } from "./routes/ratePlans.js";
import { bookingsRouter } from "./routes/bookings.js";
import { hotelRouter } from "./routes/hotel.js";
import { syncStatusRouter } from "./routes/syncStatus.js";
import { roomsRouter } from "./routes/rooms.js";
import { channexWebhookRouter } from "./routes/channexWebhook.js";
import { requireAuth } from "./middleware/auth.js";
import { corsMiddleware } from "./middleware/cors.js";

export const app = express();

// Trusts exactly one hop (Render's own reverse proxy) — not `true`/unbounded,
// which would let a client forge its own X-Forwarded-For and bypass
// express-rate-limit's per-IP login limiter (src/routes/auth.ts). Without
// this, req.ip resolves to the proxy's address for every request once
// deployed, collapsing every visitor into one shared rate-limit bucket.
app.set("trust proxy", 1);

// Mounted before the global express.json() so this route's own scoped
// (256kb-limited) body parser handles it, not the global default-limit one —
// this is an internet-facing, lighter-auth (shared-secret, not JWT) endpoint.
app.use("/api/webhooks/channex", channexWebhookRouter);

app.use(corsMiddleware);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/room-types", roomTypesRouter);
app.use("/api/rate-plans", ratePlansRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/hotel", hotelRouter);
app.use("/api/sync-status", syncStatusRouter);
app.use("/api/rooms", roomsRouter);

// Real, permanent current-session endpoint — the Phase 2 UI uses this to know
// who's logged in and which hotel/role context applies after a page reload.
app.get("/api/me", requireAuth, (req, res) => {
  res.json(req.auth);
});
