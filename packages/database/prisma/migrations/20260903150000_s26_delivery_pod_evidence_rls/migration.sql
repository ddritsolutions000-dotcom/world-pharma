ALTER TABLE "proofs_of_delivery" ADD COLUMN IF NOT EXISTS "object_key" TEXT;
ALTER TABLE "proofs_of_delivery" ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "proofs_of_delivery" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "proofs_of_delivery_idempotency_key_key" ON "proofs_of_delivery"("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "proofs_of_delivery_shipment_id_kind_idx" ON "proofs_of_delivery"("shipment_id", "kind");

ALTER TABLE "proofs_of_delivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "proofs_of_delivery" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proofs_of_delivery_select" ON "proofs_of_delivery";
CREATE POLICY "proofs_of_delivery_select" ON "proofs_of_delivery" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = proofs_of_delivery.shipment_id
        AND (
          app.can_person(s.customer_person_id)
          OR app.read_org_country(s.seller_org_id, s.country_id)
          OR app.is_worker()
          OR app.is_platform()
        )
    )
  );

DROP POLICY IF EXISTS "proofs_of_delivery_insert" ON "proofs_of_delivery";
CREATE POLICY "proofs_of_delivery_insert" ON "proofs_of_delivery" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_worker() OR app.is_platform() OR app.actor_present());

DROP POLICY IF EXISTS "proofs_of_delivery_update" ON "proofs_of_delivery";
CREATE POLICY "proofs_of_delivery_update" ON "proofs_of_delivery" FOR UPDATE TO worldpharma_app
  USING (app.is_worker() OR app.is_platform())
  WITH CHECK (app.is_worker() OR app.is_platform());

ALTER TABLE "delivery_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "delivery_attempts" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_attempts_select" ON "delivery_attempts";
CREATE POLICY "delivery_attempts_select" ON "delivery_attempts" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = delivery_attempts.shipment_id
        AND (
          app.can_person(s.customer_person_id)
          OR app.read_org_country(s.seller_org_id, s.country_id)
          OR app.is_worker()
          OR app.is_platform()
        )
    )
  );

DROP POLICY IF EXISTS "delivery_attempts_insert" ON "delivery_attempts";
CREATE POLICY "delivery_attempts_insert" ON "delivery_attempts" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_worker() OR app.is_platform());

DROP POLICY IF EXISTS "logistics_job_events_app_all" ON "logistics_job_events";
DROP POLICY IF EXISTS "logistics_job_events_access" ON "logistics_job_events";

CREATE POLICY "logistics_job_events_access" ON "logistics_job_events" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM logistics_jobs j
      LEFT JOIN shipments s ON s.id = j.shipment_id
      WHERE j.id = logistics_job_events.job_id
        AND (
          (app.person_id() IS NOT NULL AND j.assignee_id = app.person_id())
          OR (
            s.id IS NOT NULL
            AND (
              app.can_person(s.customer_person_id)
              OR app.read_org_country(s.seller_org_id, s.country_id)
            )
          )
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR (
      app.person_id() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM logistics_jobs j
        WHERE j.id = logistics_job_events.job_id
          AND j.assignee_id = app.person_id()
      )
    )
  );
