-- R5-F fix: grant app role access to prescription_erx_submissions (RLS still enforced).

GRANT SELECT, INSERT, UPDATE ON "prescription_erx_submissions" TO worldpharma_app;
