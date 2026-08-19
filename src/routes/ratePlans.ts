import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const ratePlansRouter = Router();

const ADMIN_ROLES = new Set(["HOTEL_ADMIN", "SUPER_ADMIN"]);
const RATE_PLAN_NOT_FOUND_BODY = { error: "Rate plan not found" };

function todayManilaDateString(): string {
  const manilaMs = Date.now() + 8 * 60 * 60 * 1000;
  return new Date(manilaMs).toISOString().slice(0, 10);
}

function isValidName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

ratePlansRouter.patch("/:ratePlanId", requireAuth, async (req, res) => {
  const { role, hotelId, userId } = req.auth!;
  if (!ADMIN_ROLES.has(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const ratePlanId = req.params.ratePlanId as string;
  const body = req.body ?? {};
  const data: {
    name?: string;
    isRefundable?: boolean;
    includesBreakfast?: boolean;
    basePrice?: Prisma.Decimal;
  } = {};

  if (body.name !== undefined) {
    if (!isValidName(body.name)) {
      res.status(400).json({ error: "name must be a non-empty string" });
      return;
    }
    data.name = body.name;
  }
  if (body.isRefundable !== undefined) {
    if (typeof body.isRefundable !== "boolean") {
      res.status(400).json({ error: "isRefundable must be a boolean" });
      return;
    }
    data.isRefundable = body.isRefundable;
  }
  if (body.includesBreakfast !== undefined) {
    if (typeof body.includesBreakfast !== "boolean") {
      res.status(400).json({ error: "includesBreakfast must be a boolean" });
      return;
    }
    data.includesBreakfast = body.includesBreakfast;
  }
  if (body.basePrice !== undefined) {
    if (typeof body.basePrice !== "number" || !Number.isFinite(body.basePrice) || body.basePrice <= 0) {
      res.status(400).json({ error: "basePrice must be a positive number" });
      return;
    }
    data.basePrice = new Prisma.Decimal(body.basePrice);
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    const existing = await prisma.ratePlan.findFirst({
      where: { id: ratePlanId, hotelId, deletedAt: null },
    });
    if (!existing) {
      res.status(404).json(RATE_PLAN_NOT_FOUND_BODY);
      return;
    }

    const updated = await prisma.ratePlan.update({
      where: { id: ratePlanId },
      data: { ...data, lastModifiedByUserId: userId },
    });
    res.status(200).json(updated);
  } catch (err) {
    console.error("Rate-plan update error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal server error" });
  }
});

ratePlansRouter.delete("/:ratePlanId", requireAuth, async (req, res) => {
  const { role, hotelId, userId } = req.auth!;
  if (!ADMIN_ROLES.has(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const ratePlanId = req.params.ratePlanId as string;

  try {
    const existing = await prisma.ratePlan.findFirst({
      where: { id: ratePlanId, hotelId, deletedAt: null },
    });
    if (!existing) {
      res.status(404).json(RATE_PLAN_NOT_FOUND_BODY);
      return;
    }

    // Same reasoning as roomTypes.ts's DELETE handler — a future active booking
    // against this rate plan must block the delete, not silently survive it
    // orphaned from every staff-facing view.
    const today = new Date(`${todayManilaDateString()}T00:00:00.000Z`);
    const futureBooking = await prisma.bookingItem.findFirst({
      where: {
        ratePlanId,
        checkOutDate: { gte: today },
        booking: { status: { notIn: ["CANCELLED"] } },
      },
    });
    if (futureBooking) {
      res.status(409).json({ error: "Cannot delete: has upcoming bookings" });
      return;
    }

    const deleted = await prisma.ratePlan.update({
      where: { id: ratePlanId },
      data: { deletedAt: new Date(), deletedByUserId: userId },
    });
    res.status(200).json({ id: deleted.id, deletedAt: deleted.deletedAt });
  } catch (err) {
    console.error("Rate-plan delete error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal server error" });
  }
});
