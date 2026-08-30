-- Align shopper visibility with reservation bucket math (ignore drifted available column).
CREATE OR REPLACE FUNCTION app.available_qty(p_variant uuid, p_org uuid, p_country uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    SUM(b.on_hand - b.reserved - b.damaged - b.expired - b.quarantined - b.returned),
    0
  )::integer
  FROM inventory_balances b
  JOIN inventory_lots l ON l.id = b.lot_id
  WHERE l.variant_id = p_variant
    AND l.owner_org_id = p_org
    AND l.country_id = p_country
    AND l.status = 'ACTIVE'
    AND (l.expires_on IS NULL OR l.expires_on >= CURRENT_DATE);
$$;

REVOKE ALL ON FUNCTION app.available_qty(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.available_qty(uuid, uuid, uuid) TO worldpharma_app;
