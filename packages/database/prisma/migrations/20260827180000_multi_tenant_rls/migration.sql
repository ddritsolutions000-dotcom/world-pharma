-- CR-RLS-96-IMPL: worldpharma_app (NOBYPASSRLS) + fail-closed tenant policies.
-- Application queries must SET LOCAL ROLE worldpharma_app and SET LOCAL tenant GUCs.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'worldpharma_app') THEN
    CREATE ROLE worldpharma_app LOGIN PASSWORD 'worldpharma_app'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS NOREPLICATION;
  ELSE
    ALTER ROLE worldpharma_app WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO worldpharma_app', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO worldpharma_app;
GRANT worldpharma_app TO CURRENT_USER;

CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO worldpharma_app;

CREATE OR REPLACE FUNCTION app.guc(p_key text)
RETURNS text LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting(p_key, true), '');
$$;

CREATE OR REPLACE FUNCTION app.actor_kind()
RETURNS text LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(app.guc('app.actor_kind'), '');
$$;

CREATE OR REPLACE FUNCTION app.company_scope()
RETURNS text LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(app.guc('app.company_scope'), 'none');
$$;

CREATE OR REPLACE FUNCTION app.person_id()
RETURNS uuid LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(app.guc('app.person_id'), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.uuid_array(p_key text)
RETURNS uuid[] LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
    ARRAY(
      SELECT NULLIF(btrim(x), '')::uuid
      FROM unnest(string_to_array(COALESCE(app.guc(p_key), ''), ',')) AS x
      WHERE NULLIF(btrim(x), '') IS NOT NULL
    ),
    '{}'::uuid[]
  );
$$;

CREATE OR REPLACE FUNCTION app.org_ids() RETURNS uuid[] LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT app.uuid_array('app.org_ids'); $$;
CREATE OR REPLACE FUNCTION app.location_ids() RETURNS uuid[] LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT app.uuid_array('app.location_ids'); $$;
CREATE OR REPLACE FUNCTION app.country_ids() RETURNS uuid[] LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT app.uuid_array('app.country_ids'); $$;
CREATE OR REPLACE FUNCTION app.region_ids() RETURNS uuid[] LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT app.uuid_array('app.region_ids'); $$;
CREATE OR REPLACE FUNCTION app.legal_entity_ids() RETURNS uuid[] LANGUAGE sql STABLE PARALLEL SAFE AS $$ SELECT app.uuid_array('app.legal_entity_ids'); $$;

CREATE OR REPLACE FUNCTION app.actor_present()
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT app.actor_kind() IN ('user','auth','worker','webhook','system');
$$;

CREATE OR REPLACE FUNCTION app.is_platform()
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT app.actor_present() AND app.company_scope() = 'platform';
$$;

CREATE OR REPLACE FUNCTION app.is_worker()
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT app.actor_kind() IN ('worker','webhook','system');
$$;

CREATE OR REPLACE FUNCTION app.can_person(p uuid)
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT app.actor_present() AND p IS NOT NULL AND (app.is_platform() OR p = app.person_id());
$$;

CREATE OR REPLACE FUNCTION app.can_org(p uuid)
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT app.actor_present() AND p IS NOT NULL AND (app.is_platform() OR p = ANY (app.org_ids()));
$$;

CREATE OR REPLACE FUNCTION app.can_country(p uuid)
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT app.actor_present() AND p IS NOT NULL AND (app.is_platform() OR p = ANY (app.country_ids()));
$$;

CREATE OR REPLACE FUNCTION app.can_location(p uuid)
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT app.actor_present() AND p IS NOT NULL AND (
    app.is_platform()
    OR p = ANY (app.location_ids())
    OR app.can_org((SELECT l.organization_id FROM locations l WHERE l.id = p))
  );
$$;

CREATE OR REPLACE FUNCTION app.read_org_country(p_org uuid, p_country uuid)
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT app.actor_present() AND (
    app.is_platform()
    OR (p_org IS NOT NULL AND p_org = ANY (app.org_ids()))
    OR (
      app.company_scope() IN ('country','region','legal_entity')
      AND p_country IS NOT NULL
      AND p_country = ANY (app.country_ids())
    )
  );
$$;

CREATE OR REPLACE FUNCTION app.write_org(p uuid)
RETURNS boolean LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT app.actor_present()
    AND app.actor_kind() IN ('user','worker','system')
    AND (app.is_platform() OR (p IS NOT NULL AND p = ANY (app.org_ids())));
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO worldpharma_app;

CREATE OR REPLACE FUNCTION app.drop_all_policies(p_table text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = p_table
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, p_table);
  END LOOP;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    PERFORM app.drop_all_policies(t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO worldpharma_app', t);
  END LOOP;
END
$$;

-- Reference catalogs
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'countries','partner_types','roles','permissions','role_permissions',
    'payment_methods','payment_gateways','payment_gateway_accounts','payment_gateway_capabilities',
    'payment_routing_rules','carriers','carrier_accounts','carrier_capabilities','carrier_services',
    'carrier_coverages','carrier_health'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO worldpharma_app USING (app.actor_present())', t||'_sel', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO worldpharma_app WITH CHECK (app.is_platform() OR app.is_worker())', t||'_ins', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO worldpharma_app USING (app.is_platform() OR app.is_worker()) WITH CHECK (app.is_platform() OR app.is_worker())', t||'_upd', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO worldpharma_app USING (app.is_platform())', t||'_del', t);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['outbox_events','inbox_receipts','payment_webhook_events','video_webhook_receipts']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I TO worldpharma_app USING (app.is_worker() OR app.is_platform()) WITH CHECK (app.is_worker() OR app.is_platform())',
        t||'_worker', t
      );
    END IF;
  END LOOP;
END $$;

CREATE POLICY persons_access ON persons TO worldpharma_app
  USING (app.can_person(id) OR app.actor_kind() = 'auth')
  WITH CHECK (app.can_person(id) OR app.actor_kind() IN ('auth','user'));

CREATE POLICY accounts_access ON accounts TO worldpharma_app
  USING (app.can_person("person_id") OR app.actor_kind() = 'auth')
  WITH CHECK (app.can_person("person_id") OR app.actor_kind() IN ('auth','user'));

CREATE POLICY account_identifiers_access ON account_identifiers TO worldpharma_app
  USING (app.can_person("person_id") OR app.actor_kind() = 'auth')
  WITH CHECK (app.can_person("person_id") OR app.actor_kind() = 'auth');

CREATE POLICY otp_challenges_access ON otp_challenges TO worldpharma_app
  USING (app.actor_kind() IN ('auth','user') AND ("person_id" IS NULL OR app.can_person("person_id") OR app.actor_kind() = 'auth'))
  WITH CHECK (app.actor_kind() IN ('auth','user'));

CREATE POLICY devices_access ON devices TO worldpharma_app
  USING (app.can_person("person_id")) WITH CHECK (app.can_person("person_id"));

CREATE POLICY sessions_access ON sessions TO worldpharma_app
  USING (app.can_person("person_id") OR app.actor_kind() = 'auth')
  WITH CHECK (app.can_person("person_id") OR app.actor_kind() IN ('auth','user'));

CREATE POLICY refresh_tokens_access ON refresh_tokens TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM sessions s WHERE s.id = refresh_tokens.session_id AND (app.can_person(s.person_id) OR app.actor_kind() = 'auth')))
  WITH CHECK (EXISTS (SELECT 1 FROM sessions s WHERE s.id = refresh_tokens.session_id AND (app.can_person(s.person_id) OR app.actor_kind() = 'auth')));

CREATE POLICY totp_secrets_access ON totp_secrets TO worldpharma_app
  USING (app.can_person("person_id")) WITH CHECK (app.can_person("person_id"));
CREATE POLICY recovery_codes_access ON recovery_codes TO worldpharma_app
  USING (app.can_person("person_id")) WITH CHECK (app.can_person("person_id"));

CREATE POLICY memberships_access ON memberships TO worldpharma_app
  USING (app.can_person("person_id") OR app.read_org_country("organization_id", "country_id") OR app.is_platform())
  WITH CHECK (app.is_platform() OR (app.actor_kind() IN ('user','auth') AND app.can_person("person_id")));

CREATE POLICY security_events_select ON security_events FOR SELECT TO worldpharma_app
  USING (app.can_person("person_id") OR app.is_platform() OR app.is_worker());
CREATE POLICY security_events_insert ON security_events FOR INSERT TO worldpharma_app
  WITH CHECK (app.actor_present());
CREATE POLICY security_events_no_update ON security_events FOR UPDATE TO worldpharma_app USING (false) WITH CHECK (false);
CREATE POLICY security_events_no_delete ON security_events FOR DELETE TO worldpharma_app USING (false);

CREATE POLICY organizations_access ON organizations TO worldpharma_app
  USING (
    app.can_org(id)
    OR app.is_worker()
    OR app.is_platform()
    OR (app.company_scope() IN ('country','region','legal_entity') AND app.can_country("country_id"))
    OR app.actor_kind() = 'auth'
  )
  WITH CHECK (app.write_org(id) OR app.is_platform());

CREATE POLICY locations_access ON locations TO worldpharma_app
  USING (app.can_location(id) OR app.read_org_country("organization_id", "country_id"))
  WITH CHECK (app.write_org("organization_id"));

CREATE POLICY partners_access ON partners TO worldpharma_app
  USING (app.can_person("person_id") OR app.read_org_country("organization_id", "country_id"))
  WITH CHECK (app.can_person("person_id") OR app.write_org("organization_id") OR app.is_platform());

CREATE POLICY partner_applications_access ON partner_applications TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM partners p WHERE p.id = partner_applications.partner_id AND (app.can_person(p.person_id) OR app.read_org_country(p.organization_id, p.country_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM partners p WHERE p.id = partner_applications.partner_id AND (app.can_person(p.person_id) OR app.write_org(p.organization_id) OR app.is_platform())));

CREATE POLICY kyc_cases_access ON kyc_cases TO worldpharma_app
  USING (app.is_platform() OR EXISTS (SELECT 1 FROM partners p WHERE p.id = kyc_cases.partner_id AND app.can_person(p.person_id)))
  WITH CHECK (app.is_platform() OR app.actor_kind() IN ('user','auth'));

CREATE POLICY partner_documents_access ON partner_documents TO worldpharma_app
  USING (app.is_platform() OR EXISTS (
    SELECT 1 FROM kyc_cases k
    JOIN partners p ON p.id = k.partner_id
    WHERE k.id = partner_documents.kyc_case_id AND app.can_person(p.person_id)
  ))
  WITH CHECK (app.is_platform() OR app.actor_kind() IN ('user','auth'));

CREATE POLICY policy_packs_select ON policy_packs FOR SELECT TO worldpharma_app USING (app.actor_present());
CREATE POLICY policy_packs_write ON policy_packs FOR ALL TO worldpharma_app
  USING (app.is_platform()) WITH CHECK (app.is_platform());

CREATE POLICY catalog_items_select ON catalog_items FOR SELECT TO worldpharma_app USING (app.actor_present());
CREATE POLICY catalog_items_insert ON catalog_items FOR INSERT TO worldpharma_app
  WITH CHECK (app.write_org("created_by_org_id") OR app.is_platform() OR "created_by_org_id" IS NULL);
CREATE POLICY catalog_items_update ON catalog_items FOR UPDATE TO worldpharma_app
  USING (app.write_org("created_by_org_id") OR app.is_platform()) WITH CHECK (app.write_org("created_by_org_id") OR app.is_platform());
CREATE POLICY catalog_items_delete ON catalog_items FOR DELETE TO worldpharma_app USING (app.is_platform());

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'catalog_brands','catalog_categories','catalog_category_i18n','catalog_item_i18n',
    'catalog_assets','catalog_item_countries','catalog_variants','catalog_search_documents'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename=t) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO worldpharma_app USING (app.actor_present())', t||'_sel', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO worldpharma_app WITH CHECK (app.is_platform() OR app.actor_kind() IN (''user'',''worker''))', t||'_ins', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO worldpharma_app USING (app.is_platform() OR app.actor_kind() = ''user'') WITH CHECK (app.is_platform() OR app.actor_kind() = ''user'')', t||'_upd', t);
      EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO worldpharma_app USING (app.is_platform())', t||'_del', t);
    END IF;
  END LOOP;
END $$;

CREATE POLICY catalog_offers_select ON catalog_offers FOR SELECT TO worldpharma_app
  USING (app.actor_present() AND (app.can_country("country_id") OR app.can_org("seller_org_id") OR app.actor_kind() IN ('auth','user')));
CREATE POLICY catalog_offers_insert ON catalog_offers FOR INSERT TO worldpharma_app WITH CHECK (app.write_org("seller_org_id"));
CREATE POLICY catalog_offers_update ON catalog_offers FOR UPDATE TO worldpharma_app
  USING (app.write_org("seller_org_id")) WITH CHECK (app.write_org("seller_org_id"));
CREATE POLICY catalog_offers_delete ON catalog_offers FOR DELETE TO worldpharma_app
  USING (app.write_org("seller_org_id") OR app.is_platform());

CREATE POLICY price_versions_select ON price_versions FOR SELECT TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM catalog_offers o WHERE o.id = price_versions.offer_id));
CREATE POLICY price_versions_write ON price_versions FOR ALL TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM catalog_offers o WHERE o.id = price_versions.offer_id AND app.write_org(o.seller_org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM catalog_offers o WHERE o.id = price_versions.offer_id AND app.write_org(o.seller_org_id)));

CREATE POLICY commercial_rules_access ON commercial_rules TO worldpharma_app
  USING (app.actor_present() AND (app.can_country("country_id") OR app.can_org("seller_org_id") OR "seller_org_id" IS NULL))
  WITH CHECK (app.write_org("seller_org_id") OR app.is_platform() OR "seller_org_id" IS NULL);

CREATE POLICY inventory_lots_access ON inventory_lots TO worldpharma_app
  USING (app.can_org("owner_org_id") OR app.can_location("location_id") OR (app.can_country("country_id") AND app.company_scope() IN ('platform','country','region','legal_entity')))
  WITH CHECK (app.write_org("owner_org_id"));

CREATE POLICY inventory_balances_access ON inventory_balances TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM inventory_lots l WHERE l.id = inventory_balances.lot_id AND app.can_org(l.owner_org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM inventory_lots l WHERE l.id = inventory_balances.lot_id AND app.write_org(l.owner_org_id)));

CREATE POLICY inventory_movements_access ON inventory_movements TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM inventory_lots l WHERE l.id = inventory_movements.lot_id AND app.can_org(l.owner_org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM inventory_lots l WHERE l.id = inventory_movements.lot_id AND app.write_org(l.owner_org_id)));

CREATE POLICY inventory_reservations_access ON inventory_reservations TO worldpharma_app
  USING (app.can_org("owner_org_id") OR app.is_platform())
  WITH CHECK (app.write_org("owner_org_id"));

CREATE POLICY goods_receipts_access ON goods_receipts TO worldpharma_app
  USING (app.can_org("owner_org_id")) WITH CHECK (app.write_org("owner_org_id"));

CREATE POLICY goods_receipt_lines_access ON goods_receipt_lines TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM goods_receipts g WHERE g.id = goods_receipt_lines.receipt_id AND app.can_org(g.owner_org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM goods_receipts g WHERE g.id = goods_receipt_lines.receipt_id AND app.write_org(g.owner_org_id)));

CREATE POLICY warehouse_profiles_access ON warehouse_profiles TO worldpharma_app
  USING (app.can_org("organization_id")) WITH CHECK (app.write_org("organization_id"));

CREATE POLICY stock_transfers_access ON stock_transfers TO worldpharma_app
  USING (app.can_org("owner_org_id")) WITH CHECK (app.write_org("owner_org_id"));

CREATE POLICY stock_transfer_lines_access ON stock_transfer_lines TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM stock_transfers s WHERE s.id = stock_transfer_lines.transfer_id AND app.can_org(s.owner_org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM stock_transfers s WHERE s.id = stock_transfer_lines.transfer_id AND app.write_org(s.owner_org_id)));

CREATE POLICY carts_access ON carts TO worldpharma_app
  USING (app.can_person("customer_person_id") OR app.can_org("seller_org_id") OR app.is_platform())
  WITH CHECK (app.can_person("customer_person_id") OR app.write_org("seller_org_id"));

CREATE POLICY cart_items_access ON cart_items TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM carts c WHERE c.id = cart_items.cart_id AND (app.can_person(c.customer_person_id) OR app.can_org(c.seller_org_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM carts c WHERE c.id = cart_items.cart_id AND (app.can_person(c.customer_person_id) OR app.write_org(c.seller_org_id))));

CREATE POLICY cart_quotes_access ON cart_quotes TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM carts c WHERE c.id = cart_quotes.cart_id AND app.can_person(c.customer_person_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM carts c WHERE c.id = cart_quotes.cart_id AND app.can_person(c.customer_person_id)));

CREATE POLICY customer_addresses_access ON customer_addresses TO worldpharma_app
  USING (app.can_person("customer_person_id")) WITH CHECK (app.can_person("customer_person_id"));

CREATE POLICY checkout_sessions_access ON checkout_sessions TO worldpharma_app
  USING (app.can_person("customer_person_id") OR app.is_platform() OR app.is_worker())
  WITH CHECK (app.can_person("customer_person_id") OR app.is_worker());

CREATE POLICY checkout_quotes_access ON checkout_quotes TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM checkout_sessions s WHERE s.id = checkout_quotes.session_id AND (app.can_person(s.customer_person_id) OR app.is_worker())))
  WITH CHECK (EXISTS (SELECT 1 FROM checkout_sessions s WHERE s.id = checkout_quotes.session_id AND (app.can_person(s.customer_person_id) OR app.is_worker())));

CREATE POLICY idempotency_records_access ON idempotency_records TO worldpharma_app
  USING (app.can_person("person_id") OR app.is_worker())
  WITH CHECK (app.can_person("person_id") OR app.is_worker());

CREATE POLICY orders_access ON orders TO worldpharma_app
  USING (app.can_person("customer_person_id") OR app.read_org_country("seller_org_id", "country_id") OR app.is_worker())
  WITH CHECK (app.can_person("customer_person_id") OR app.write_org("seller_org_id") OR app.is_worker());

CREATE POLICY order_items_access ON order_items TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND (app.can_person(o.customer_person_id) OR app.can_org(o.seller_org_id) OR app.is_worker())))
  WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND (app.can_person(o.customer_person_id) OR app.write_org(o.seller_org_id) OR app.is_worker())));

CREATE POLICY fulfillment_groups_access ON fulfillment_groups TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM orders o WHERE o.id = fulfillment_groups.order_id AND (app.can_person(o.customer_person_id) OR app.can_org(o.seller_org_id) OR app.is_worker())))
  WITH CHECK (EXISTS (SELECT 1 FROM orders o WHERE o.id = fulfillment_groups.order_id AND (app.write_org(o.seller_org_id) OR app.is_worker())));

CREATE POLICY fulfillment_items_access ON fulfillment_items TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM fulfillment_groups g JOIN orders o ON o.id = g.order_id WHERE g.id = fulfillment_items.group_id AND (app.can_person(o.customer_person_id) OR app.can_org(o.seller_org_id) OR app.is_worker())))
  WITH CHECK (EXISTS (SELECT 1 FROM fulfillment_groups g JOIN orders o ON o.id = g.order_id WHERE g.id = fulfillment_items.group_id AND (app.write_org(o.seller_org_id) OR app.is_worker())));

CREATE POLICY pick_tasks_access ON pick_tasks TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM fulfillment_groups g JOIN orders o ON o.id = g.order_id WHERE g.id = pick_tasks.group_id AND (app.can_org(o.seller_org_id) OR app.is_worker())))
  WITH CHECK (EXISTS (SELECT 1 FROM fulfillment_groups g JOIN orders o ON o.id = g.order_id WHERE g.id = pick_tasks.group_id AND (app.write_org(o.seller_org_id) OR app.is_worker())));

CREATE POLICY pack_tasks_access ON pack_tasks TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM fulfillment_groups g JOIN orders o ON o.id = g.order_id WHERE g.id = pack_tasks.group_id AND (app.can_org(o.seller_org_id) OR app.is_worker())))
  WITH CHECK (EXISTS (SELECT 1 FROM fulfillment_groups g JOIN orders o ON o.id = g.order_id WHERE g.id = pack_tasks.group_id AND (app.write_org(o.seller_org_id) OR app.is_worker())));

CREATE POLICY payment_intents_access ON payment_intents TO worldpharma_app
  USING (app.can_person("customer_person_id") OR app.is_platform() OR app.is_worker())
  WITH CHECK (app.can_person("customer_person_id") OR app.is_worker());

CREATE POLICY payment_attempts_access ON payment_attempts TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM payment_intents i WHERE i.id = payment_attempts.intent_id AND (app.can_person(i.customer_person_id) OR app.is_worker())))
  WITH CHECK (EXISTS (SELECT 1 FROM payment_intents i WHERE i.id = payment_attempts.intent_id AND (app.can_person(i.customer_person_id) OR app.is_worker())));

CREATE POLICY refunds_access ON refunds TO worldpharma_app
  USING (EXISTS (SELECT 1 FROM payment_intents i WHERE i.id = refunds.intent_id AND (app.can_person(i.customer_person_id) OR app.is_platform() OR app.is_worker())))
  WITH CHECK (app.is_platform() OR app.is_worker() OR EXISTS (SELECT 1 FROM payment_intents i WHERE i.id = refunds.intent_id AND app.can_person(i.customer_person_id)));

CREATE POLICY shipments_access ON shipments TO worldpharma_app
  USING (app.can_person("customer_person_id") OR app.read_org_country("seller_org_id", "country_id") OR app.is_worker())
  WITH CHECK (app.write_org("seller_org_id") OR app.can_person("customer_person_id") OR app.is_worker());

CREATE POLICY logistics_jobs_access ON logistics_jobs TO worldpharma_app
  USING (
    app.is_worker() OR app.is_platform()
    OR (app.person_id() IS NOT NULL AND "assignee_id" = app.person_id())
    OR EXISTS (SELECT 1 FROM shipments s WHERE s.id = logistics_jobs.shipment_id AND (app.can_person(s.customer_person_id) OR app.can_org(s.seller_org_id)))
  )
  WITH CHECK (
    app.is_worker()
    OR (app.person_id() IS NOT NULL AND "assignee_id" = app.person_id())
    OR EXISTS (SELECT 1 FROM shipments s WHERE s.id = logistics_jobs.shipment_id AND app.write_org(s.seller_org_id))
  );

CREATE POLICY ledger_accounts_access ON ledger_accounts TO worldpharma_app
  USING (app.company_scope() IN ('platform','legal_entity','country','region') OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY journals_access ON journals TO worldpharma_app
  USING (app.is_platform() OR app.is_worker() OR (app.can_country("country_id") AND app.company_scope() IN ('country','region','legal_entity','platform')))
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY vendor_payables_access ON vendor_payables TO worldpharma_app
  USING (app.can_org("seller_org_id") OR (app.can_country("country_id") AND app.company_scope() IN ('platform','country','legal_entity','region')))
  WITH CHECK (app.write_org("seller_org_id") OR app.is_platform() OR app.is_worker());

CREATE POLICY affiliate_liabilities_access ON affiliate_liabilities TO worldpharma_app
  USING (app.is_platform() OR app.can_person((SELECT o.customer_person_id FROM orders o WHERE o.id = affiliate_liabilities.order_id)))
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY payouts_access ON payouts TO worldpharma_app
  USING (app.is_platform() OR app.company_scope() IN ('legal_entity','country','region') OR app.is_worker())
  WITH CHECK (app.is_platform() OR app.is_worker());

CREATE POLICY doctor_profiles_access ON doctor_profiles TO worldpharma_app
  USING (app.can_person("person_id") OR app.can_country("country_id") OR app.actor_kind() IN ('user','auth'))
  WITH CHECK (app.can_person("person_id") OR app.is_platform());

CREATE POLICY appointments_access ON appointments TO worldpharma_app
  USING (
    app.can_person("customer_person_id")
    OR EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.id = appointments.doctor_profile_id AND app.can_person(d.person_id))
    OR app.read_org_country("organization_id", "country_id")
    OR app.is_worker()
  )
  WITH CHECK (
    app.can_person("customer_person_id")
    OR EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.id = appointments.doctor_profile_id AND app.can_person(d.person_id))
    OR app.write_org("organization_id")
    OR app.is_worker()
  );

CREATE POLICY consent_grants_access ON consent_grants TO worldpharma_app
  USING (app.can_person("subject_person_id") OR app.can_person("granted_by_person_id") OR app.read_org_country("organization_id", "country_id"))
  WITH CHECK (app.can_person("subject_person_id") OR app.can_person("granted_by_person_id") OR app.is_platform());

CREATE POLICY clinical_relationships_access ON clinical_relationships TO worldpharma_app
  USING (app.can_person("patient_person_id") OR app.read_org_country("organization_id", "country_id"))
  WITH CHECK (app.can_person("patient_person_id") OR app.write_org("organization_id") OR app.is_platform());

CREATE POLICY clinical_access_audits_select ON clinical_access_audits FOR SELECT TO worldpharma_app
  USING (app.is_platform() OR app.can_person("actor_person_id"));
CREATE POLICY clinical_access_audits_insert ON clinical_access_audits FOR INSERT TO worldpharma_app
  WITH CHECK (app.actor_present());
CREATE POLICY clinical_access_audits_no_update ON clinical_access_audits FOR UPDATE TO worldpharma_app USING (false) WITH CHECK (false);

CREATE POLICY encounters_access ON encounters TO worldpharma_app
  USING (EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.id = encounters.appointment_id
      AND (
        app.can_person(a.customer_person_id)
        OR EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.id = a.doctor_profile_id AND app.can_person(d.person_id))
        OR app.is_worker()
      )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.id = encounters.appointment_id
      AND (
        app.can_person(a.customer_person_id)
        OR EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.id = a.doctor_profile_id AND app.can_person(d.person_id))
        OR app.is_worker()
      )
  ));

CREATE POLICY video_sessions_access ON video_sessions TO worldpharma_app
  USING (EXISTS (
    SELECT 1 FROM appointments a WHERE a.id = video_sessions.appointment_id
      AND (app.can_person(a.customer_person_id) OR EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.id = a.doctor_profile_id AND app.can_person(d.person_id)) OR app.is_worker())
  ))
  WITH CHECK (app.is_worker() OR EXISTS (
    SELECT 1 FROM appointments a WHERE a.id = video_sessions.appointment_id
      AND (app.can_person(a.customer_person_id) OR EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.id = a.doctor_profile_id AND app.can_person(d.person_id)))
  ));

DO $$
DECLARE
  r record;
  cols text[];
  parts_use text[];
  parts_chk text[];
BEGIN
  FOR r IN
    SELECT c.relname AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname)
  LOOP
    SELECT coalesce(array_agg(a.attname::text), ARRAY[]::text[])
      INTO cols
    FROM pg_attribute a
    WHERE a.attrelid = format('%I.%I', 'public', r.t)::regclass
      AND a.attnum > 0 AND NOT a.attisdropped;

    parts_use := ARRAY['app.is_worker()', 'app.is_platform()'];
    parts_chk := ARRAY['app.is_worker()', 'app.is_platform()'];

    IF 'customer_person_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY['app.can_person(customer_person_id)'];
      parts_chk := parts_chk || ARRAY['app.can_person(customer_person_id)'];
    END IF;
    IF 'person_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY['app.can_person(person_id)'];
      parts_chk := parts_chk || ARRAY['app.can_person(person_id)'];
    END IF;
    IF 'seller_org_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY['app.can_org(seller_org_id)'];
      parts_chk := parts_chk || ARRAY['app.write_org(seller_org_id)'];
    END IF;
    IF 'owner_org_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY['app.can_org(owner_org_id)'];
      parts_chk := parts_chk || ARRAY['app.write_org(owner_org_id)'];
    END IF;
    IF 'organization_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY['app.can_org(organization_id)'];
      parts_chk := parts_chk || ARRAY['app.write_org(organization_id)'];
    END IF;
    IF 'country_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY['(app.can_country(country_id) AND app.company_scope() IN (''country'',''region'',''legal_entity'',''platform''))'];
    END IF;
    IF 'order_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY[format('EXISTS (SELECT 1 FROM orders o WHERE o.id = %I.order_id AND (app.can_person(o.customer_person_id) OR app.can_org(o.seller_org_id) OR app.is_worker()))', r.t)];
      parts_chk := parts_chk || ARRAY[format('EXISTS (SELECT 1 FROM orders o WHERE o.id = %I.order_id AND (app.can_person(o.customer_person_id) OR app.write_org(o.seller_org_id) OR app.is_worker()))', r.t)];
    END IF;
    IF 'shipment_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY[format('EXISTS (SELECT 1 FROM shipments s WHERE s.id = %I.shipment_id AND (app.can_person(s.customer_person_id) OR app.can_org(s.seller_org_id) OR app.is_worker()))', r.t)];
      parts_chk := parts_chk || ARRAY[format('EXISTS (SELECT 1 FROM shipments s WHERE s.id = %I.shipment_id AND (app.write_org(s.seller_org_id) OR app.is_worker()))', r.t)];
    END IF;
    IF 'intent_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY[format('EXISTS (SELECT 1 FROM payment_intents i WHERE i.id = %I.intent_id AND (app.can_person(i.customer_person_id) OR app.is_worker()))', r.t)];
      parts_chk := parts_chk || ARRAY[format('EXISTS (SELECT 1 FROM payment_intents i WHERE i.id = %I.intent_id AND (app.can_person(i.customer_person_id) OR app.is_worker()))', r.t)];
    END IF;
    IF 'cart_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY[format('EXISTS (SELECT 1 FROM carts c WHERE c.id = %I.cart_id AND (app.can_person(c.customer_person_id) OR app.can_org(c.seller_org_id)))', r.t)];
      parts_chk := parts_chk || ARRAY[format('EXISTS (SELECT 1 FROM carts c WHERE c.id = %I.cart_id AND (app.can_person(c.customer_person_id) OR app.write_org(c.seller_org_id)))', r.t)];
    END IF;
    IF 'appointment_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY[format('EXISTS (SELECT 1 FROM appointments a WHERE a.id = %I.appointment_id AND (app.can_person(a.customer_person_id) OR app.is_worker()))', r.t)];
      parts_chk := parts_chk || ARRAY[format('EXISTS (SELECT 1 FROM appointments a WHERE a.id = %I.appointment_id AND (app.can_person(a.customer_person_id) OR app.is_worker()))', r.t)];
    END IF;
    IF 'lot_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY[format('EXISTS (SELECT 1 FROM inventory_lots l WHERE l.id = %I.lot_id AND app.can_org(l.owner_org_id))', r.t)];
      parts_chk := parts_chk || ARRAY[format('EXISTS (SELECT 1 FROM inventory_lots l WHERE l.id = %I.lot_id AND app.write_org(l.owner_org_id))', r.t)];
    END IF;
    IF 'offer_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY[format('EXISTS (SELECT 1 FROM catalog_offers o WHERE o.id = %I.offer_id)', r.t)];
      parts_chk := parts_chk || ARRAY[format('EXISTS (SELECT 1 FROM catalog_offers o WHERE o.id = %I.offer_id AND app.write_org(o.seller_org_id))', r.t)];
    END IF;
    IF 'partner_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY[format('EXISTS (SELECT 1 FROM partners p WHERE p.id = %I.partner_id AND (app.can_person(p.person_id) OR app.can_org(p.organization_id) OR app.is_platform()))', r.t)];
      parts_chk := parts_chk || ARRAY[format('EXISTS (SELECT 1 FROM partners p WHERE p.id = %I.partner_id AND (app.can_person(p.person_id) OR app.write_org(p.organization_id) OR app.is_platform()))', r.t)];
    END IF;
    IF 'profile_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY[format('EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.id = %I.profile_id AND (app.can_person(d.person_id) OR app.is_platform()))', r.t)];
      parts_chk := parts_chk || ARRAY[format('EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.id = %I.profile_id AND (app.can_person(d.person_id) OR app.is_platform()))', r.t)];
    END IF;
    IF 'receipt_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY[format('EXISTS (SELECT 1 FROM goods_receipts g WHERE g.id = %I.receipt_id AND app.can_org(g.owner_org_id))', r.t)];
      parts_chk := parts_chk || ARRAY[format('EXISTS (SELECT 1 FROM goods_receipts g WHERE g.id = %I.receipt_id AND app.write_org(g.owner_org_id))', r.t)];
    END IF;
    IF 'transfer_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY[format('EXISTS (SELECT 1 FROM stock_transfers s WHERE s.id = %I.transfer_id AND app.can_org(s.owner_org_id))', r.t)];
      parts_chk := parts_chk || ARRAY[format('EXISTS (SELECT 1 FROM stock_transfers s WHERE s.id = %I.transfer_id AND app.write_org(s.owner_org_id))', r.t)];
    END IF;
    IF 'journal_id' = ANY (cols) THEN
      parts_use := parts_use || ARRAY[format('EXISTS (SELECT 1 FROM journals j WHERE j.id = %I.journal_id AND (app.is_worker() OR app.is_platform() OR (app.can_country(j.country_id) AND app.company_scope() IN (''country'',''region'',''legal_entity'',''platform''))))', r.t)];
      parts_chk := parts_chk || ARRAY['(app.is_worker() OR app.is_platform())'];
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON %I TO worldpharma_app USING (%s) WITH CHECK (%s)',
      r.t || '_auto',
      r.t,
      array_to_string(parts_use, ' OR '),
      array_to_string(parts_chk, ' OR ')
    );
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS inventory_lots_owner_org_idx ON inventory_lots (owner_org_id);
CREATE INDEX IF NOT EXISTS catalog_offers_seller_org_idx ON catalog_offers (seller_org_id);
CREATE INDEX IF NOT EXISTS orders_seller_org_idx ON orders (seller_org_id);
CREATE INDEX IF NOT EXISTS orders_customer_person_idx ON orders (customer_person_id);
CREATE INDEX IF NOT EXISTS carts_customer_person_idx ON carts (customer_person_id);
CREATE INDEX IF NOT EXISTS shipments_seller_org_idx ON shipments (seller_org_id);
CREATE INDEX IF NOT EXISTS logistics_jobs_assignee_idx ON logistics_jobs (assignee_id);
CREATE INDEX IF NOT EXISTS memberships_person_idx ON memberships (person_id);
CREATE INDEX IF NOT EXISTS appointments_customer_idx ON appointments (customer_person_id);
CREATE INDEX IF NOT EXISTS appointments_org_idx ON appointments (organization_id);

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO worldpharma_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO worldpharma_app;

CREATE TABLE IF NOT EXISTS app.rls_ownership_gaps (
  table_name text NOT NULL,
  issue text NOT NULL,
  row_count bigint NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app.rls_ownership_gaps (table_name, issue, row_count)
SELECT src.table_name, src.issue, src.row_count
FROM (
  SELECT 'orders'::text AS table_name, 'null_seller_org_id'::text AS issue, count(*)::bigint AS row_count
  FROM orders WHERE seller_org_id IS NULL
  UNION ALL
  SELECT 'inventory_lots', 'null_owner_org_id', count(*) FROM inventory_lots WHERE owner_org_id IS NULL
  UNION ALL
  SELECT 'carts', 'null_customer_person_id', count(*) FROM carts WHERE customer_person_id IS NULL
  UNION ALL
  SELECT 'payment_intents', 'null_customer_person_id', count(*) FROM payment_intents WHERE customer_person_id IS NULL
) src
WHERE src.row_count > 0;

COMMENT ON ROLE worldpharma_app IS 'Runtime application role; NOBYPASSRLS; tenant GUCs required';
