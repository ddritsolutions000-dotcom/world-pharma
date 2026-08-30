CREATE OR REPLACE FUNCTION app.get_balance_for_update(p_lot uuid)
RETURNS TABLE(
  on_hand integer,
  reserved integer,
  damaged integer,
  expired integer,
  quarantined integer,
  returned integer,
  in_transit integer,
  available integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT b.on_hand, b.reserved, b.damaged, b.expired, b.quarantined, b.returned, b.in_transit, b.available
  FROM inventory_balances b
  WHERE b.lot_id = p_lot
  FOR UPDATE;
$$;

REVOKE ALL ON FUNCTION app.get_balance_for_update(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.get_balance_for_update(uuid) TO worldpharma_app;
