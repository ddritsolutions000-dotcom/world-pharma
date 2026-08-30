-- R5-C: store pharmacists in same country can see unassigned QUEUED cases (OD-R5C-04 claim flow).

DROP POLICY IF EXISTS dispensing_cases_access ON "dispensing_cases";

CREATE POLICY dispensing_cases_access ON "dispensing_cases"
  FOR ALL TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (organization_id IS NOT NULL AND app.can_org(organization_id))
    OR (
      status = 'QUEUED'
      AND organization_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM memberships m
        JOIN organizations o ON o.id = m.organization_id
        WHERE m.person_id = app.person_id()
          AND m.status = 'ACTIVE'
          AND m.deleted_at IS NULL
          AND o.kind = 'PHARMACY_OWNED'
          AND o.country_id = dispensing_cases.country_id
      )
    )
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
