-- Overbooking backstop: the database itself refuses to let a DailyInventory row
-- hold more bookedCount + heldCount than availableCount, even if application-layer
-- transaction logic (Phase 2) has a bug.
ALTER TABLE "DailyInventory"
  ADD CONSTRAINT "DailyInventory_counts_check"
  CHECK ("availableCount" >= 0 AND "bookedCount" >= 0 AND "heldCount" >= 0 AND "bookedCount" + "heldCount" <= "availableCount");

ALTER TABLE "RatePlanDailyRate"
  ADD CONSTRAINT "RatePlanDailyRate_minStay_check"
  CHECK ("minStay" >= 1);

ALTER TABLE "RatePlan"
  ADD CONSTRAINT "RatePlan_basePrice_check"
  CHECK ("basePrice" > 0);
