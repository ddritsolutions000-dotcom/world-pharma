-- CR-R5-E-IMPL-120: allow prescribing doctor to read/update refill requests for re-auth.

DROP POLICY IF EXISTS refill_requests_access ON "refill_requests";

CREATE POLICY refill_requests_access ON "refill_requests"
  FOR ALL TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR customer_person_id = app.person_id()
    OR decided_by_person_id = app.person_id()
    OR EXISTS (
      SELECT 1
      FROM prescriptions p
      JOIN doctor_profiles dp ON dp.id = p.doctor_profile_id
      WHERE p.id = prescription_id
        AND dp.person_id = app.person_id()
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR customer_person_id = app.person_id()
    OR EXISTS (
      SELECT 1
      FROM prescriptions p
      JOIN doctor_profiles dp ON dp.id = p.doctor_profile_id
      WHERE p.id = prescription_id
        AND dp.person_id = app.person_id()
    )
  );

DROP POLICY IF EXISTS refill_request_history_access ON "refill_request_history";

CREATE POLICY refill_request_history_access ON "refill_request_history"
  FOR ALL TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR actor_person_id = app.person_id()
    OR EXISTS (
      SELECT 1 FROM refill_requests r
      JOIN prescriptions p ON p.id = r.prescription_id
      JOIN doctor_profiles dp ON dp.id = p.doctor_profile_id
      WHERE r.id = request_id
        AND (
          r.customer_person_id = app.person_id()
          OR dp.person_id = app.person_id()
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR actor_person_id = app.person_id()
  );
