-- Repair: shopper stock visibility without exposing lots; doctor partner reads; shipment labels.
CREATE OR REPLACE FUNCTION app.available_qty(p_variant uuid, p_org uuid, p_country uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(b.available), 0)::integer
  FROM inventory_balances b
  JOIN inventory_lots l ON l.id = b.lot_id
  WHERE l.variant_id = p_variant
    AND l.owner_org_id = p_org
    AND l.country_id = p_country
    AND l.status = 'ACTIVE';
$$;

REVOKE ALL ON FUNCTION app.available_qty(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.available_qty(uuid, uuid, uuid) TO worldpharma_app;

DROP POLICY IF EXISTS partners_access ON partners;
CREATE POLICY partners_select ON partners FOR SELECT TO worldpharma_app
  USING (
    app.can_person("person_id")
    OR app.read_org_country("organization_id", "country_id")
    OR app.is_worker()
    OR app.is_platform()
    OR (
      app.actor_present()
      AND EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.partner_id = partners.id)
    )
  );
CREATE POLICY partners_insert ON partners FOR INSERT TO worldpharma_app
  WITH CHECK (app.can_person("person_id") OR app.write_org("organization_id") OR app.is_platform());
CREATE POLICY partners_update ON partners FOR UPDATE TO worldpharma_app
  USING (app.can_person("person_id") OR app.write_org("organization_id") OR app.is_platform())
  WITH CHECK (app.can_person("person_id") OR app.write_org("organization_id") OR app.is_platform());
CREATE POLICY partners_delete ON partners FOR DELETE TO worldpharma_app
  USING (app.is_platform());

DROP POLICY IF EXISTS inventory_reservations_access ON inventory_reservations;
CREATE POLICY inventory_reservations_access ON inventory_reservations TO worldpharma_app
  USING (
    app.can_org("owner_org_id")
    OR app.is_platform()
    OR app.is_worker()
    OR app.actor_kind() IN ('user', 'auth')
  )
  WITH CHECK (
    app.write_org("owner_org_id")
    OR app.is_worker()
    OR app.is_platform()
    OR app.actor_kind() = 'user'
  );

DROP POLICY IF EXISTS shipment_labels_auto ON shipment_labels;
CREATE POLICY shipment_labels_access ON shipment_labels TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = shipment_labels.shipment_id
        AND (app.can_person(s.customer_person_id) OR app.can_org(s.seller_org_id) OR app.is_worker())
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM shipments s
      WHERE s.id = shipment_labels.shipment_id
        AND (app.write_org(s.seller_org_id) OR app.is_worker())
    )
  );
