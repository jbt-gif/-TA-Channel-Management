import express from "express";
import { authRouter } from "./routes/auth.js";
import { roomTypesRouter } from "./routes/roomTypes.js";
import { ratePlansRouter } from "./routes/ratePlans.js";
import { bookingsRouter } from "./routes/bookings.js";
import { hotelRouter } from "./routes/hotel.js";
import { requireAuth } from "./middleware/auth.js";

export const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter);
app.use("/api/room-types", roomTypesRouter);
app.use("/api/rate-plans", ratePlansRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/hotel", hotelRouter);

// Real, permanent current-session endpoint — the Phase 2 UI uses this to know
// who's logged in and which hotel/role context applies after a page reload.
app.get("/api/me", requireAuth, (req, res) => {
  res.json(req.auth);
});
