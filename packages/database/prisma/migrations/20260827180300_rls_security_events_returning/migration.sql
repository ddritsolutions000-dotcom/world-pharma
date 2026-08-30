DROP POLICY IF EXISTS security_events_select ON security_events;
CREATE POLICY security_events_select ON security_events FOR SELECT
  USING (
    app.is_platform()
    OR app.is_worker()
    OR app.actor_kind() = 'auth'
    OR app.can_person(person_id)
  );
