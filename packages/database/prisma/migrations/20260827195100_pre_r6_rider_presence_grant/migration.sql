-- CR-PRE-R6-REPAIR-123 P1-1 follow-up: rider_presence had RLS policy TO worldpharma_app
-- but never received table DML GRANT (gap vs 80000 retrofit GRANT loop).
-- Additive only. Does not alter policies or role attributes.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "rider_presence" TO worldpharma_app;
