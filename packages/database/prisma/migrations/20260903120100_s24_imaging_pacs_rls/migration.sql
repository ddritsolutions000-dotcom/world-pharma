-- S24: RLS for imaging study series/instances (mirrors imaging_studies access).

ALTER TABLE "imaging_study_series" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imaging_study_series" FORCE ROW LEVEL SECURITY;
ALTER TABLE "imaging_study_instances" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imaging_study_instances" FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON "imaging_study_series" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "imaging_study_instances" TO worldpharma_app;

CREATE POLICY imaging_study_series_access ON "imaging_study_series" TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM imaging_studies s
      JOIN imaging_bookings b ON b.id = s.imaging_booking_id
      WHERE s.id = imaging_study_series.imaging_study_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.can_org(s.imaging_org_id)
          OR (s.assignee_person_id IS NOT NULL AND app.can_person(s.assignee_person_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM imaging_studies s
      WHERE s.id = imaging_study_series.imaging_study_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.write_org(s.imaging_org_id)
          OR (s.assignee_person_id IS NOT NULL AND app.can_person(s.assignee_person_id))
        )
    )
  );

CREATE POLICY imaging_study_instances_access ON "imaging_study_instances" TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM imaging_study_series ser
      JOIN imaging_studies s ON s.id = ser.imaging_study_id
      JOIN imaging_bookings b ON b.id = s.imaging_booking_id
      WHERE ser.id = imaging_study_instances.imaging_series_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.can_person(b.customer_person_id)
          OR app.can_org(s.imaging_org_id)
          OR (s.assignee_person_id IS NOT NULL AND app.can_person(s.assignee_person_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM imaging_study_series ser
      JOIN imaging_studies s ON s.id = ser.imaging_study_id
      WHERE ser.id = imaging_study_instances.imaging_series_id
        AND (
          app.is_worker()
          OR app.is_platform()
          OR app.write_org(s.imaging_org_id)
          OR (s.assignee_person_id IS NOT NULL AND app.can_person(s.assignee_person_id))
        )
    )
  );
