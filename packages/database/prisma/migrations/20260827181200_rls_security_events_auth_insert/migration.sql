-- Auth login/OTP emits security_events with person_id before user GUCs are bound.
-- Actor kind auth is server-side only; customers still cannot insert others' events.
DROP POLICY IF EXISTS security_events_insert ON security_events;
CREATE POLICY security_events_insert ON security_events FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.actor_present()
    AND (
      person_id IS NULL
      OR app.can_person(person_id)
      OR app.is_worker()
      OR app.is_platform()
      OR app.actor_kind() = 'auth'
    )
  );

-- Worker inventory consumption must satisfy child WITH CHECK (write_org plus worker).
DROP POLICY IF EXISTS inventory_balances_access ON inventory_balances;
CREATE POLICY inventory_balances_access ON inventory_balances TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM inventory_lots l
      WHERE l.id = inventory_balances.lot_id
        AND (app.can_org(l.owner_org_id) OR app.write_org(l.owner_org_id))
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM inventory_lots l
      WHERE l.id = inventory_balances.lot_id AND app.write_org(l.owner_org_id)
    )
  );

DROP POLICY IF EXISTS inventory_movements_access ON inventory_movements;
CREATE POLICY inventory_movements_access ON inventory_movements TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM inventory_lots l
      WHERE l.id = inventory_movements.lot_id
        AND (app.can_org(l.owner_org_id) OR app.write_org(l.owner_org_id))
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM inventory_lots l
      WHERE l.id = inventory_movements.lot_id AND app.write_org(l.owner_org_id)
    )
  );

DROP POLICY IF EXISTS journal_lines_access ON journal_lines;
CREATE POLICY journal_lines_access ON journal_lines TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM journals j
      WHERE j.id = journal_lines.journal_id
        AND (app.can_country(j.country_id) OR app.is_worker() OR app.is_platform())
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM journals j
      WHERE j.id = journal_lines.journal_id
        AND (app.is_worker() OR app.is_platform() OR app.can_country(j.country_id))
    )
  );
