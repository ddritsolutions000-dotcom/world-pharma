-- R13-E: worker-scoped personalization retention purge (closes TD-R12F-02)

DROP POLICY IF EXISTS personalization_events_no_delete ON "personalization_events";

CREATE POLICY personalization_events_worker_delete ON "personalization_events" FOR DELETE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );
