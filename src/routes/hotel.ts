import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const hotelRouter = Router();

const ADMIN_ROLES = new Set(["HOTEL_ADMIN", "SUPER_ADMIN"]);
const MIN_PERCENT = 0;
const MAX_PERCENT = 100;

hotelRouter.get("/policy", requireAuth, async (req, res) => {
  try {
    const hotel = await prisma.hotel.findUniqueOrThrow({ where: { id: req.auth!.hotelId } });
    res.status(200).json({ downpaymentPercent: hotel.downpaymentPercent });
  } catch (err) {
    console.error("Hotel policy fetch error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal server error" });
  }
});

hotelRouter.patch("/policy", requireAuth, async (req, res) => {
  const { role, hotelId } = req.auth!;
  if (!ADMIN_ROLES.has(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { downpaymentPercent } = req.body ?? {};
  if (
    typeof downpaymentPercent !== "number" ||
    !Number.isInteger(downpaymentPercent) ||
    downpaymentPercent < MIN_PERCENT ||
    downpaymentPercent > MAX_PERCENT
  ) {
    res.status(400).json({ error: `downpaymentPercent must be an integer between ${MIN_PERCENT} and ${MAX_PERCENT}` });
    return;
  }

  try {
    const hotel = await prisma.hotel.update({
      where: { id: hotelId },
      data: { downpaymentPercent },
    });
    res.status(200).json({ downpaymentPercent: hotel.downpaymentPercent });
  } catch (err) {
    console.error("Hotel policy update error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal server error" });
  }
});
