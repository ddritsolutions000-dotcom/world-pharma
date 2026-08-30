DROP POLICY IF EXISTS partner_status_history_access ON partner_status_history;
DROP POLICY IF EXISTS partner_status_history_auto ON partner_status_history;
CREATE POLICY partner_status_history_access ON partner_status_history TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM partners p
      WHERE p.id = partner_status_history.partner_id
        AND (app.can_person(p.person_id) OR app.read_org_country(p.organization_id, p.country_id))
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM partners p
      WHERE p.id = partner_status_history.partner_id
        AND (app.can_person(p.person_id) OR app.write_org(p.organization_id) OR app.actor_kind() IN ('user', 'auth'))
    )
  );
