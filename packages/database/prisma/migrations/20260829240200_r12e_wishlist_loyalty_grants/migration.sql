-- R12-E: wishlist + loyalty grants

GRANT SELECT, INSERT, DELETE ON "wishlist_items" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE ON "loyalty_programs" TO worldpharma_app;
GRANT SELECT, INSERT ON "loyalty_accounts" TO worldpharma_app;
GRANT SELECT, INSERT ON "loyalty_ledger_entries" TO worldpharma_app;
