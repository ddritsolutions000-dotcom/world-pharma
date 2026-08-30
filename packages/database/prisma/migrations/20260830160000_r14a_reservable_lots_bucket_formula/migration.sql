-- Use bucket formula for reservable stock (stored available column can drift in long-lived test DBs).
CREATE OR REPLACE FUNCTION app.reservable_lots(
  p_variant uuid,
  p_location uuid,
  p_org uuid,
  p_country uuid
)
RETURNS TABLE(lot_id uuid, available integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    (b.on_hand - b.reserved - b.damaged - b.expired - b.quarantined - b.returned)::integer AS available
  FROM inventory_lots l
  JOIN inventory_balances b ON b.lot_id = l.id
  WHERE l.variant_id = p_variant
    AND l.location_id = p_location
    AND l.owner_org_id = p_org
    AND l.country_id = p_country
    AND l.status = 'ACTIVE'
    AND (b.on_hand - b.reserved - b.damaged - b.expired - b.quarantined - b.returned) > 0
    AND (l.expires_on IS NULL OR l.expires_on >= CURRENT_DATE)
  ORDER BY l.expires_on NULLS FIRST, l.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION app.reservable_lot_for_checkout(
  p_variant uuid,
  p_org uuid,
  p_country uuid
)
RETURNS TABLE(lot_id uuid, location_id uuid, available integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.location_id,
    (b.on_hand - b.reserved - b.damaged - b.expired - b.quarantined - b.returned)::integer AS available
  FROM inventory_lots l
  JOIN inventory_balances b ON b.lot_id = l.id
  WHERE l.variant_id = p_variant
    AND l.owner_org_id = p_org
    AND l.country_id = p_country
    AND l.status = 'ACTIVE'
    AND (b.on_hand - b.reserved - b.damaged - b.expired - b.quarantined - b.returned) > 0
    AND (l.expires_on IS NULL OR l.expires_on >= CURRENT_DATE)
  ORDER BY l.expires_on NULLS FIRST, l.created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION app.reservable_lots(uuid, uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.reservable_lot_for_checkout(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.reservable_lots(uuid, uuid, uuid, uuid) TO worldpharma_app;
GRANT EXECUTE ON FUNCTION app.reservable_lot_for_checkout(uuid, uuid, uuid) TO worldpharma_app;
