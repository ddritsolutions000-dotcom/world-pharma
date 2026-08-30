DROP POLICY IF EXISTS clinical_relationships_access ON clinical_relationships;
CREATE POLICY clinical_relationships_access ON clinical_relationships TO worldpharma_app
  USING (
    app.can_person("patient_person_id")
    OR app.read_org_country("organization_id", "country_id")
    OR app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM partners p
      WHERE p.id = clinical_relationships.doctor_partner_id AND app.can_person(p.person_id)
    )
  )
  WITH CHECK (
    app.can_person("patient_person_id")
    OR app.write_org("organization_id")
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM partners p
      WHERE p.id = clinical_relationships.doctor_partner_id AND app.can_person(p.person_id)
    )
  );

DROP POLICY IF EXISTS consent_grants_access ON consent_grants;
CREATE POLICY consent_grants_access ON consent_grants TO worldpharma_app
  USING (
    app.can_person("subject_person_id")
    OR app.can_person("granted_by_person_id")
    OR app.read_org_country("organization_id", "country_id")
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM partners p
      WHERE p.id = consent_grants.recipient_partner_id AND app.can_person(p.person_id)
    )
  )
  WITH CHECK (
    app.can_person("subject_person_id")
    OR app.can_person("granted_by_person_id")
    OR app.is_platform()
  );

DROP POLICY IF EXISTS doctor_availability_windows_access ON doctor_availability_windows;
DROP POLICY IF EXISTS doctor_availability_windows_auto ON doctor_availability_windows;
CREATE POLICY doctor_availability_windows_access ON doctor_availability_windows TO worldpharma_app
  USING (
    app.actor_present()
    AND (
      app.is_platform()
      OR app.is_worker()
      OR app.actor_kind() IN ('user', 'auth')
      OR EXISTS (
        SELECT 1 FROM doctor_profiles d
        WHERE d.id = doctor_availability_windows.doctor_profile_id AND app.can_person(d.person_id)
      )
    )
  )
  WITH CHECK (
    app.is_platform()
    OR EXISTS (
      SELECT 1 FROM doctor_profiles d
      WHERE d.id = doctor_availability_windows.doctor_profile_id AND app.can_person(d.person_id)
    )
  );

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename = 'shipment_labels'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON shipment_labels', r.policyname);
  END LOOP;
END $$;

CREATE POLICY shipment_labels_access ON shipment_labels TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = shipment_labels.shipment_id
        AND (app.can_person(s.customer_person_id) OR app.can_org(s.seller_org_id))
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = shipment_labels.shipment_id AND app.write_org(s.seller_org_id)
    )
  );
