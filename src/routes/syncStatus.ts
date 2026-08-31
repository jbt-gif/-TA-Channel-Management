import { Router } from "express";
import * as Sentry from "@sentry/node";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const syncStatusRouter = Router();

const ADMIN_ROLES = new Set(["HOTEL_ADMIN", "SUPER_ADMIN"]);
const PUSH_QUEUE_NOT_FOUND_BODY = { error: "Not found" };
const RETRY_COOLDOWN_MS = 60_000;

const STATUSES = ["PENDING", "PROCESSING", "DONE", "FAILED"] as const;

syncStatusRouter.get("/", requireAuth, async (req, res) => {
  const { role, hotelId } = req.auth!;
  if (!ADMIN_ROLES.has(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  try {
    const grouped = await prisma.pushQueue.groupBy({
      by: ["status"],
      where: { hotelId },
      _count: true,
    });
    const counts: Record<(typeof STATUSES)[number], number> = {
      PENDING: 0,
      PROCESSING: 0,
      DONE: 0,
      FAILED: 0,
    };
    for (const row of grouped) counts[row.status] = row._count;

    const failedRows = await prisma.pushQueue.findMany({
      where: { hotelId, status: "FAILED" },
      orderBy: { updatedAt: "desc" },
    });

    const roomTypeIds = failedRows.map((r) => r.roomTypeId).filter((id): id is string => id !== null);
    const ratePlanIds = failedRows.map((r) => r.ratePlanId).filter((id): id is string => id !== null);

    const [roomTypes, ratePlans] = await Promise.all([
      roomTypeIds.length > 0
        ? prisma.roomType.findMany({ where: { id: { in: roomTypeIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
      ratePlanIds.length > 0
        ? prisma.ratePlan.findMany({ where: { id: { in: ratePlanIds } }, select: { id: true, name: true } })
        : Promise.resolve([]),
    ]);
    const roomTypeNameById = new Map(roomTypes.map((rt) => [rt.id, rt.name]));
    const ratePlanNameById = new Map(ratePlans.map((rp) => [rp.id, rp.name]));

    const failed = failedRows.map((row) => ({
      id: row.id,
      type: row.type,
      roomTypeId: row.roomTypeId,
      ratePlanId: row.ratePlanId,
      roomTypeName: row.roomTypeId ? (roomTypeNameById.get(row.roomTypeId) ?? "(deleted)") : null,
      ratePlanName: row.ratePlanId ? (ratePlanNameById.get(row.ratePlanId) ?? "(deleted)") : null,
      dateFrom: row.dateFrom,
      dateTo: row.dateTo,
      attempts: row.attempts,
      lastError: row.lastError,
      updatedAt: row.updatedAt,
    }));

    res.status(200).json({ counts, failed });
  } catch (err) {
    console.error("Sync-status fetch error:", err instanceof Error ? err.message : err);
    Sentry.captureException(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

syncStatusRouter.post("/:id/retry", requireAuth, async (req, res) => {
  const { role, hotelId, userId } = req.auth!;
  if (!ADMIN_ROLES.has(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = req.params.id as string;

  try {
    const existing = await prisma.pushQueue.findFirst({ where: { id, hotelId } });
    if (!existing) {
      res.status(404).json(PUSH_QUEUE_NOT_FOUND_BODY);
      return;
    }

    if (existing.status !== "FAILED") {
      res.status(409).json({ error: "Row is not in a retryable state" });
      return;
    }

    // Guard against a retry loop resetting attempts to 0 forever, which would
    // defeat pushQueueWorker.ts's own MAX_ATTEMPTS circuit breaker against
    // Channex's rate-limited (and, in production, paid) API.
    if (existing.lastRetriedAt && Date.now() - existing.lastRetriedAt.getTime() < RETRY_COOLDOWN_MS) {
      res.status(409).json({ error: "Retried too recently, wait before trying again" });
      return;
    }

    // Deliberately do NOT touch lastError — it stays as the last-known
    // failure reason until the next real push attempt overwrites it. Wiping
    // it here would destroy the only record of what failed at the exact
    // moment a human acts on it.
    const updated = await prisma.pushQueue.update({
      where: { id },
      data: { status: "PENDING", attempts: 0, retriedByUserId: userId, lastRetriedAt: new Date() },
    });

    res.status(200).json(updated);
  } catch (err) {
    console.error("Sync-status retry error:", err instanceof Error ? err.message : err);
    Sentry.captureException(err);
    res.status(500).json({ error: "Internal server error" });
  }
});
