-- R12-A: allow worker/platform SELECT on account_identifiers for masked CRM 360 projection.
-- Writes remain restricted to owner/auth paths on account_identifiers_access.

CREATE POLICY account_identifiers_worker_select ON account_identifiers FOR SELECT TO worldpharma_app
  USING (app.is_worker() OR app.is_platform());
