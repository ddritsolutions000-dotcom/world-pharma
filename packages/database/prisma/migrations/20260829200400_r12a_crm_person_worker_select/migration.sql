-- R12-A: worker/platform SELECT on persons + accounts for masked CRM 360 profile projection.

CREATE POLICY persons_worker_select ON persons FOR SELECT TO worldpharma_app
  USING (app.is_worker() OR app.is_platform());

CREATE POLICY accounts_worker_select ON accounts FOR SELECT TO worldpharma_app
  USING (app.is_worker() OR app.is_platform());
