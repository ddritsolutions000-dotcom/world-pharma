-- R9-E: align prescription health_artifact RLS with doctor_profiles (matches R5-A prescription policies).

DROP POLICY IF EXISTS health_artifacts_access ON "health_artifacts";

CREATE POLICY health_artifacts_access ON "health_artifacts" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("person_id")
    OR EXISTS (
      SELECT 1 FROM lab_bookings b
      WHERE b.id = health_artifacts.lab_booking_id AND app.can_org(b.lab_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = health_artifacts.imaging_booking_id AND app.can_org(b.imaging_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE p.id = health_artifacts.prescription_id
        AND app.can_person(p.patient_person_id)
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM lab_bookings b
      WHERE b.id = health_artifacts.lab_booking_id AND app.write_org(b.lab_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = health_artifacts.imaging_booking_id AND app.write_org(b.imaging_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE p.id = health_artifacts.prescription_id
        AND p.patient_person_id = health_artifacts.person_id
        AND app.person_id() IS NOT NULL
        AND (
          p.created_by_person_id = app.person_id()
          OR EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = p.doctor_profile_id AND dp.person_id = app.person_id()
          )
        )
    )
  );

DROP POLICY IF EXISTS health_timeline_events_insert ON "health_timeline_events";

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
        OR EXISTS (
          SELECT 1 FROM prescriptions p
          WHERE p.id = ha.prescription_id
            AND app.person_id() IS NOT NULL
            AND (
              p.created_by_person_id = app.person_id()
              OR EXISTS (
                SELECT 1 FROM doctor_profiles dp
                WHERE dp.id = p.doctor_profile_id AND dp.person_id = app.person_id()
              )
            )
        )
      )
    )
  );
