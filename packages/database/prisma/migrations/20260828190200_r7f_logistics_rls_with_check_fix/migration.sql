-- R7-F fix: restore SAMPLE_COLLECTION/TRANSPORT rider WITH CHECK from R7-D + REPORT_DELIVERY worker writes.

DROP POLICY IF EXISTS logistics_jobs_access ON logistics_jobs;

CREATE POLICY logistics_jobs_access ON logistics_jobs TO worldpharma_app
  USING (
    app.is_worker() OR app.is_platform()
    OR (app.person_id() IS NOT NULL AND "assignee_id" = app.person_id())
    OR EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = logistics_jobs.shipment_id
        AND (app.can_person(s.customer_person_id) OR app.can_org(s.seller_org_id))
    )
    OR (
      "job_type" = 'SAMPLE_COLLECTION'
      AND "lab_sample_id" IS NOT NULL
      AND (
        app.is_worker()
        OR (
          app.person_id() IS NOT NULL
          AND ("assignee_id" IS NULL OR "assignee_id" = app.person_id())
          AND EXISTS (
            SELECT 1 FROM lab_samples s
            WHERE s.id = logistics_jobs.lab_sample_id
              AND (
                app.can_org(s.lab_org_id)
                OR (s.assignee_person_id IS NOT NULL AND app.can_person(s.assignee_person_id))
              )
          )
        )
      )
    )
    OR (
      "job_type" = 'SAMPLE_TRANSPORT'
      AND "lab_sample_id" IS NOT NULL
      AND (
        app.is_worker()
        OR (
          app.person_id() IS NOT NULL
          AND ("assignee_id" IS NULL OR "assignee_id" = app.person_id())
        )
        OR EXISTS (
          SELECT 1 FROM lab_samples s
          WHERE s.id = logistics_jobs.lab_sample_id
            AND app.can_org(s.lab_org_id)
        )
      )
    )
    OR (
      "job_type" = 'REPORT_DELIVERY'
      AND "physical_report_request_id" IS NOT NULL
      AND (
        app.is_worker()
        OR (
          app.person_id() IS NOT NULL
          AND ("assignee_id" IS NULL OR "assignee_id" = app.person_id())
        )
        OR EXISTS (
          SELECT 1 FROM physical_report_requests pr
          WHERE pr.id = logistics_jobs.physical_report_request_id
            AND (
              app.can_org(pr.lab_org_id)
              OR app.can_person(pr.customer_person_id)
            )
        )
      )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR (app.person_id() IS NOT NULL AND "assignee_id" = app.person_id())
    OR EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = logistics_jobs.shipment_id
        AND app.write_org(s.seller_org_id)
    )
    OR (
      "job_type" = 'SAMPLE_COLLECTION'
      AND "lab_sample_id" IS NOT NULL
      AND app.person_id() IS NOT NULL
      AND "assignee_id" = app.person_id()
    )
    OR (
      "job_type" = 'SAMPLE_TRANSPORT'
      AND "lab_sample_id" IS NOT NULL
      AND app.person_id() IS NOT NULL
      AND "assignee_id" = app.person_id()
    )
    OR (
      "job_type" = 'REPORT_DELIVERY'
      AND "physical_report_request_id" IS NOT NULL
      AND app.person_id() IS NOT NULL
      AND "assignee_id" = app.person_id()
    )
  );
