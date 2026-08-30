-- R5-C: allow enqueue of dispensing_cases without organization (OD-R5C-04).
-- Doctor/worker may insert QUEUED cases tied to their prescription.

DROP POLICY IF EXISTS dispensing_cases_access ON "dispensing_cases";

CREATE POLICY dispensing_cases_access ON "dispensing_cases"
  FOR ALL TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (organization_id IS NOT NULL AND app.can_org(organization_id))
    OR EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE p.id = prescription_id
        AND (
          p.patient_person_id = app.person_id()
          OR EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = p.doctor_profile_id AND dp.person_id = app.person_id()
          )
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR (organization_id IS NOT NULL AND app.can_org(organization_id))
    OR EXISTS (
      SELECT 1 FROM prescriptions p
      WHERE p.id = prescription_id
        AND (
          p.created_by_person_id = app.person_id()
          OR EXISTS (
            SELECT 1 FROM doctor_profiles dp
            WHERE dp.id = p.doctor_profile_id AND dp.person_id = app.person_id()
          )
        )
    )
  );
