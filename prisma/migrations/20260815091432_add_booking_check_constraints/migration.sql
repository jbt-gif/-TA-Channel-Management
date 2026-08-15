-- CHECK constraints for the Booking/BookingItem/Payment models added in Phase 1 Plan 03.
-- Same rationale as 20260815085414_add_inventory_check_constraints: Prisma's schema DSL
-- cannot reliably express multi-column/cross-field CHECK constraints, so these are applied
-- via raw SQL as the real database-level backstop against invalid financial/date data.

ALTER TABLE "BookingItem" ADD CONSTRAINT "BookingItem_dates_quantity_price_check"
  CHECK ("checkOutDate" > "checkInDate" AND "quantity" > 0 AND "totalPriceSnapshot" > 0);

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_check"
  CHECK ("amount" > 0);

-- Allows NULL (not yet computed by Phase 2) but rejects a zero/negative total once set.
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_totalAmount_check"
  CHECK ("totalAmount" IS NULL OR "totalAmount" > 0);
