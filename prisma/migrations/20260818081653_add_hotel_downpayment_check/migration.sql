ALTER TABLE "Hotel" ADD CONSTRAINT "downpayment_percent_range" CHECK ("downpaymentPercent" >= 0 AND "downpaymentPercent" <= 100);
