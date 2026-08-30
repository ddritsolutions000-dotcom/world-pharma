-- R13-C: least-privilege grants for provider search documents

GRANT SELECT, INSERT, UPDATE ON "provider_doctor_search_documents" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE ON "provider_lab_search_documents" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE ON "provider_test_search_documents" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE ON "provider_pharmacy_search_documents" TO worldpharma_app;
