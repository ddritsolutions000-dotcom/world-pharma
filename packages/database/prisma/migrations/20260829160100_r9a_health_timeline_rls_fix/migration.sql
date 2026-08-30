-- R9-A: align timeline RLS with health_artifacts worker/org publication paths

DROP POLICY IF EXISTS health_timeline_events_select ON "health_timeline_events";
DROP POLICY IF EXISTS health_timeline_events_insert ON "health_timeline_events";

CREATE POLICY health_timeline_events_select ON "health_timeline_events" FOR SELECT TO worldpharma_app
  USING (
    app.can_person("person_id")
    OR app.is_platform()
    OR app.is_worker()
    OR app.can_country("country_id")
  );

CREATE POLICY health_timeline_events_insert ON "health_timeline_events" FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.can_country("country_id")
    OR EXISTS (
      SELECT 1 FROM health_artifacts ha
      WHERE ha.id = health_timeline_events.artifact_id
      AND (
        EXISTS (
          SELECT 1 FROM lab_bookings b
          WHERE b.id = ha.lab_booking_id AND app.write_org(b.lab_org_id)
        )
        OR EXISTS (
          SELECT 1 FROM imaging_bookings b
          WHERE b.id = ha.imaging_booking_id AND app.write_org(b.imaging_org_id)
        )
      )
    )
  );
