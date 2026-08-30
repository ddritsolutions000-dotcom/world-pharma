DROP POLICY IF EXISTS outbox_events_worker ON outbox_events;
CREATE POLICY outbox_events_access ON outbox_events TO worldpharma_app
  USING (app.is_worker() OR app.is_platform() OR app.actor_kind() IN ('auth','user'))
  WITH CHECK (app.is_worker() OR app.is_platform() OR app.actor_kind() IN ('auth','user','worker'));

DROP POLICY IF EXISTS inbox_receipts_worker ON inbox_receipts;
CREATE POLICY inbox_receipts_access ON inbox_receipts TO worldpharma_app
  USING (app.is_worker() OR app.is_platform() OR app.actor_kind() IN ('auth','user'))
  WITH CHECK (app.is_worker() OR app.is_platform() OR app.actor_kind() IN ('auth','user','worker'));
