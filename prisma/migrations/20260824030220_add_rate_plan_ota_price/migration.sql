-- AlterTable
ALTER TABLE "RatePlan" ADD COLUMN     "otaPrice" DECIMAL(10,2);

-- The OTA-marked-up listing price drives the agency's actual revenue margin —
-- an unconstrained zero/negative value would ship silently, matching this
-- project's established "DB constraint is the real backstop" convention
-- (same pattern as RatePlan_basePrice_check).
ALTER TABLE "RatePlan"
  ADD CONSTRAINT "RatePlan_otaPrice_check"
  CHECK ("otaPrice" IS NULL OR "otaPrice" > 0);
