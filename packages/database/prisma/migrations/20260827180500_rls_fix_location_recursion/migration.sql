CREATE OR REPLACE FUNCTION app.can_location(p uuid)
RETURNS boolean LANGUAGE sql VOLATILE PARALLEL SAFE AS $$
  SELECT app.actor_present() AND p IS NOT NULL AND (
    app.is_platform()
    OR p = ANY (app.location_ids())
  );
$$;

DROP POLICY IF EXISTS doctor_availability_windows_auto ON doctor_availability_windows;
CREATE POLICY doctor_availability_windows_access ON doctor_availability_windows TO worldpharma_app
  USING (
    app.is_platform()
    OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM doctor_profiles d
      WHERE d.id = doctor_availability_windows.doctor_profile_id AND app.can_person(d.person_id)
    )
  )
  WITH CHECK (
    app.is_platform()
    OR EXISTS (
      SELECT 1 FROM doctor_profiles d
      WHERE d.id = doctor_availability_windows.doctor_profile_id AND app.can_person(d.person_id)
    )
  );

DROP POLICY IF EXISTS doctor_availability_exceptions_auto ON doctor_availability_exceptions;
CREATE POLICY doctor_availability_exceptions_access ON doctor_availability_exceptions TO worldpharma_app
  USING (
    app.is_platform()
    OR app.is_worker()
    OR EXISTS (
      SELECT 1 FROM doctor_profiles d
      WHERE d.id = doctor_availability_exceptions.doctor_profile_id AND app.can_person(d.person_id)
    )
  )
  WITH CHECK (
    app.is_platform()
    OR EXISTS (
      SELECT 1 FROM doctor_profiles d
      WHERE d.id = doctor_availability_exceptions.doctor_profile_id AND app.can_person(d.person_id)
    )
  );
