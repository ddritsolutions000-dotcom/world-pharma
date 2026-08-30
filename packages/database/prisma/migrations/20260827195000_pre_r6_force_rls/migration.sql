-- CR-PRE-R6-REPAIR-123 P1-1: FORCE ROW LEVEL SECURITY on tables created after the
-- 20260827180000 retrofit wave (those migrations only ENABLE RLS).
-- Additive only. Does not alter policies, weaken predicates, or change worldpharma_app.

ALTER TABLE "rider_presence" FORCE ROW LEVEL SECURITY;

ALTER TABLE "prescriptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "prescription_versions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "prescription_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "prescription_status_history" FORCE ROW LEVEL SECURITY;

ALTER TABLE "dispensing_cases" FORCE ROW LEVEL SECURITY;
ALTER TABLE "dispense_events" FORCE ROW LEVEL SECURITY;
ALTER TABLE "dispense_line_mappings" FORCE ROW LEVEL SECURITY;

ALTER TABLE "rx_commerce_handoffs" FORCE ROW LEVEL SECURITY;

ALTER TABLE "refill_requests" FORCE ROW LEVEL SECURITY;
ALTER TABLE "refill_request_history" FORCE ROW LEVEL SECURITY;
ALTER TABLE "rx_subscriptions" FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE "prescriptions" IS 'R5-A; FORCE RLS applied CR-PRE-R6-REPAIR-123';
COMMENT ON TABLE "dispensing_cases" IS 'R5-C; FORCE RLS applied CR-PRE-R6-REPAIR-123';
COMMENT ON TABLE "rx_commerce_handoffs" IS 'R5-D; FORCE RLS applied CR-PRE-R6-REPAIR-123';
COMMENT ON TABLE "refill_requests" IS 'R5-E; FORCE RLS applied CR-PRE-R6-REPAIR-123';
COMMENT ON TABLE "rider_presence" IS 'R3 delivery; FORCE RLS applied CR-PRE-R6-REPAIR-123';
