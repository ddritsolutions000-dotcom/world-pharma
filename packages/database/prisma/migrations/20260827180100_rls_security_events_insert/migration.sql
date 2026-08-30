-- Audit rows may be written at the start of a request after SET LOCAL ROLE.
-- INSERT is append-only; SELECT remains person/platform/worker scoped.
DROP POLICY IF EXISTS security_events_insert ON security_events;
CREATE POLICY security_events_insert ON security_events FOR INSERT TO worldpharma_app
  WITH CHECK (true);

ALTER FUNCTION app.actor_kind() VOLATILE;
ALTER FUNCTION app.actor_present() VOLATILE;
ALTER FUNCTION app.company_scope() VOLATILE;
ALTER FUNCTION app.person_id() VOLATILE;
ALTER FUNCTION app.guc(text) VOLATILE;
