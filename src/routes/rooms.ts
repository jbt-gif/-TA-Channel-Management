import { Router } from "express";
import { HousekeepingStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

export const roomsRouter = Router();

const ALLOWED_ROLES = new Set(["HOUSEKEEPING", "HOTEL_ADMIN", "SUPER_ADMIN"]);
const HOUSEKEEPING_STATUSES = new Set<string>(Object.values(HousekeepingStatus));
const ROOM_NOT_FOUND_BODY = { error: "Room not found" };

roomsRouter.get("/", requireAuth, async (req, res) => {
  try {
    const rooms = await prisma.room.findMany({
      where: { hotelId: req.auth!.hotelId, deletedAt: null },
      include: { roomType: { select: { name: true } } },
      orderBy: [{ roomType: { name: "asc" } }, { label: "asc" }],
    });

    res.status(200).json(
      rooms.map((room) => ({
        id: room.id,
        label: room.label,
        roomTypeId: room.roomTypeId,
        roomTypeName: room.roomType.name,
        housekeepingStatus: room.housekeepingStatus,
        lastChangedByUserId: room.lastChangedByUserId,
        lastChangedAt: room.lastChangedAt,
      }))
    );
  } catch (err) {
    console.error("Rooms list error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal server error" });
  }
});

roomsRouter.patch("/:roomId", requireAuth, async (req, res) => {
  const { role, hotelId, userId } = req.auth!;
  if (!ALLOWED_ROLES.has(role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const roomId = req.params.roomId as string;
  const body = req.body ?? {};
  const { housekeepingStatus } = body;

  if (typeof housekeepingStatus !== "string" || !HOUSEKEEPING_STATUSES.has(housekeepingStatus)) {
    res.status(400).json({
      error: "housekeepingStatus must be one of CLEAN, DIRTY, INSPECTING, OUT_OF_SERVICE",
    });
    return;
  }

  try {
    const existing = await prisma.room.findFirst({
      where: { id: roomId, hotelId, deletedAt: null },
    });
    if (!existing) {
      res.status(404).json(ROOM_NOT_FOUND_BODY);
      return;
    }

    // A same-value resubmit must not overwrite who/when actually changed the
    // status — Task 3's UI uses always-visible status buttons, so a routine
    // re-tap of the current status is normal usage, not an edge case. Silently
    // re-stamping here would corrupt the one field this plan exists to add.
    if (existing.housekeepingStatus === housekeepingStatus) {
      res.status(200).json({
        id: existing.id,
        label: existing.label,
        roomTypeId: existing.roomTypeId,
        housekeepingStatus: existing.housekeepingStatus,
        lastChangedByUserId: existing.lastChangedByUserId,
        lastChangedAt: existing.lastChangedAt,
      });
      return;
    }

    const updated = await prisma.room.update({
      where: { id: roomId },
      data: {
        housekeepingStatus: housekeepingStatus as HousekeepingStatus,
        lastChangedByUserId: userId,
        lastChangedAt: new Date(),
      },
    });
    res.status(200).json({
      id: updated.id,
      label: updated.label,
      roomTypeId: updated.roomTypeId,
      housekeepingStatus: updated.housekeepingStatus,
      lastChangedByUserId: updated.lastChangedByUserId,
      lastChangedAt: updated.lastChangedAt,
    });
  } catch (err) {
    console.error("Room status update error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal server error" });
  }
});
