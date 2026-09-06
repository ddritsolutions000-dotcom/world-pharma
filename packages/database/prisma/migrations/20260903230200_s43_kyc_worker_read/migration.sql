-- Sprint 43: worker must evaluate KYC gate during marketplace purchasability checks
DROP POLICY IF EXISTS "kyc_cases_worker_read" ON "kyc_cases";
CREATE POLICY "kyc_cases_worker_read" ON "kyc_cases"
  AS PERMISSIVE FOR SELECT TO worldpharma_app
  USING (app.is_worker());
