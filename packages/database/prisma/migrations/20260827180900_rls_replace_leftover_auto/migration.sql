DO $$
DECLARE
  r record;
  cols text[];
  use_pred text;
  chk_pred text;
BEGIN
  FOR r IN
    SELECT c.relname AS t
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname <> '_prisma_migrations'
      AND EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.policyname = c.relname || '_auto'
      )
  LOOP
    SELECT coalesce(array_agg(a.attname::text), ARRAY[]::text[])
      INTO cols
    FROM pg_attribute a
    WHERE a.attrelid = format('%I.%I', 'public', r.t)::regclass
      AND a.attnum > 0 AND NOT a.attisdropped;

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.t || '_auto', r.t);

    use_pred := 'app.is_worker() OR app.is_platform()';
    chk_pred := 'app.is_worker() OR app.is_platform()';

    IF 'order_id' = ANY (cols) THEN
      use_pred := use_pred || format(' OR EXISTS (SELECT 1 FROM orders o WHERE o.id = %I.order_id AND (app.can_person(o.customer_person_id) OR app.can_org(o.seller_org_id)))', r.t);
      chk_pred := chk_pred || format(' OR EXISTS (SELECT 1 FROM orders o WHERE o.id = %I.order_id AND (app.can_person(o.customer_person_id) OR app.write_org(o.seller_org_id)))', r.t);
    ELSIF 'shipment_id' = ANY (cols) THEN
      use_pred := use_pred || format(' OR EXISTS (SELECT 1 FROM shipments s WHERE s.id = %I.shipment_id AND (app.can_person(s.customer_person_id) OR app.can_org(s.seller_org_id) OR app.write_org(s.seller_org_id)))', r.t);
      chk_pred := chk_pred || format(' OR EXISTS (SELECT 1 FROM shipments s WHERE s.id = %I.shipment_id AND (app.write_org(s.seller_org_id) OR app.is_worker()))', r.t);
    ELSIF 'appointment_id' = ANY (cols) THEN
      use_pred := use_pred || format(' OR EXISTS (SELECT 1 FROM appointments a WHERE a.id = %I.appointment_id AND (app.can_person(a.customer_person_id) OR EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.id = a.doctor_profile_id AND app.can_person(d.person_id))))', r.t);
      chk_pred := use_pred;
    ELSIF 'intent_id' = ANY (cols) THEN
      use_pred := use_pred || format(' OR EXISTS (SELECT 1 FROM payment_intents i WHERE i.id = %I.intent_id AND app.can_person(i.customer_person_id))', r.t);
      chk_pred := use_pred;
    ELSIF 'person_id' = ANY (cols) THEN
      use_pred := use_pred || ' OR app.can_person(person_id)';
      chk_pred := chk_pred || ' OR app.can_person(person_id)';
    ELSIF 'profile_id' = ANY (cols) OR 'doctor_profile_id' = ANY (cols) THEN
      use_pred := use_pred || ' OR app.actor_kind() IN (''user'',''auth'')';
      chk_pred := chk_pred || ' OR app.actor_kind() = ''user''';
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON %I TO worldpharma_app USING (%s) WITH CHECK (%s)',
      r.t || '_access',
      r.t,
      use_pred,
      chk_pred
    );
  END LOOP;
END $$;
