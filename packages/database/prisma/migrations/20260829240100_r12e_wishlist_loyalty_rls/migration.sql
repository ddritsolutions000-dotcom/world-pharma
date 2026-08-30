-- R12-E: FORCE RLS on wishlist + loyalty tables

ALTER TABLE "wishlist_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "wishlist_items" FORCE ROW LEVEL SECURITY;

CREATE POLICY wishlist_items_select ON "wishlist_items" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("person_id")
    OR app.can_country("country_id")
  );

CREATE POLICY wishlist_items_insert ON "wishlist_items" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY wishlist_items_delete ON "wishlist_items" FOR DELETE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform() OR app.can_person("person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY wishlist_items_no_update ON "wishlist_items" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

ALTER TABLE "loyalty_programs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_programs" FORCE ROW LEVEL SECURITY;

CREATE POLICY loyalty_programs_select ON "loyalty_programs" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_country("country_id")
  );

CREATE POLICY loyalty_programs_insert ON "loyalty_programs" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY loyalty_programs_update ON "loyalty_programs" FOR UPDATE TO worldpharma_app
  USING (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  )
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY loyalty_programs_no_delete ON "loyalty_programs" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "loyalty_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_accounts" FORCE ROW LEVEL SECURITY;

CREATE POLICY loyalty_accounts_select ON "loyalty_accounts" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("person_id")
    OR app.can_country("country_id")
  );

CREATE POLICY loyalty_accounts_insert ON "loyalty_accounts" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform() OR app.can_person("person_id"))
    AND app.can_country("country_id")
  );

CREATE POLICY loyalty_accounts_no_update ON "loyalty_accounts" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY loyalty_accounts_no_delete ON "loyalty_accounts" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "loyalty_ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "loyalty_ledger_entries" FORCE ROW LEVEL SECURITY;

CREATE POLICY loyalty_ledger_entries_select ON "loyalty_ledger_entries" FOR SELECT TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_country("country_id")
    OR EXISTS (
      SELECT 1 FROM loyalty_accounts la
      WHERE la.id = loyalty_ledger_entries.account_id
        AND app.can_person(la.person_id)
    )
  );

CREATE POLICY loyalty_ledger_entries_insert ON "loyalty_ledger_entries" FOR INSERT TO worldpharma_app
  WITH CHECK (
    (app.is_worker() OR app.is_platform())
    AND app.can_country("country_id")
  );

CREATE POLICY loyalty_ledger_entries_no_update ON "loyalty_ledger_entries" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY loyalty_ledger_entries_no_delete ON "loyalty_ledger_entries" FOR DELETE TO worldpharma_app
  USING (false);
