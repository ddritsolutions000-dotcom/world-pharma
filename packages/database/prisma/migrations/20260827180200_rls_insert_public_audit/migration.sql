DROP POLICY IF EXISTS security_events_insert ON security_events;
CREATE POLICY security_events_insert ON security_events FOR INSERT
  WITH CHECK (true);
