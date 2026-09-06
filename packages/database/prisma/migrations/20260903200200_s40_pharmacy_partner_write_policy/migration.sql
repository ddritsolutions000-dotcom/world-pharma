-- Sprint 40: Add partner self-service write/read policies for pharmacy_licences.
-- Vendors (partner_applicant audience) can insert/update/select their own partner's licence.

DROP POLICY IF EXISTS "pharmacy_licences_partner_read" ON "pharmacy_licences";
DROP POLICY IF EXISTS "pharmacy_licences_partner_write" ON "pharmacy_licences";
DROP POLICY IF EXISTS "pharmacy_licences_partner_update" ON "pharmacy_licences";

CREATE POLICY "pharmacy_licences_partner_write" ON "pharmacy_licences"
  AS PERMISSIVE FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.actor_present()
    AND app.actor_kind() = 'user'
    AND EXISTS (
      SELECT 1 FROM partners p
      WHERE p.id = "partner_id"
        AND p.person_id = app.person_id()
    )
  );

CREATE POLICY "pharmacy_licences_partner_update" ON "pharmacy_licences"
  AS PERMISSIVE FOR UPDATE TO worldpharma_app
  USING (
    app.actor_present()
    AND app.actor_kind() = 'user'
    AND EXISTS (
      SELECT 1 FROM partners p
      WHERE p.id = "partner_id"
        AND p.person_id = app.person_id()
    )
  )
  WITH CHECK (
    app.actor_present()
    AND app.actor_kind() = 'user'
    AND EXISTS (
      SELECT 1 FROM partners p
      WHERE p.id = "partner_id"
        AND p.person_id = app.person_id()
    )
  );

CREATE POLICY "pharmacy_licences_partner_read" ON "pharmacy_licences"
  AS PERMISSIVE FOR SELECT TO worldpharma_app
  USING (
    app.actor_present()
    AND app.actor_kind() = 'user'
    AND EXISTS (
      SELECT 1 FROM partners p
      WHERE p.id = "partner_id"
        AND p.person_id = app.person_id()
    )
  );
