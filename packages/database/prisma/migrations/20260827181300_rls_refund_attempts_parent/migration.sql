DROP POLICY IF EXISTS refund_attempts_access ON refund_attempts;
CREATE POLICY refund_attempts_access ON refund_attempts TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1
      FROM refunds r
      JOIN payment_intents i ON i.id = r.intent_id
      WHERE r.id = refund_attempts.refund_id
        AND app.can_person(i.customer_person_id)
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1
      FROM refunds r
      JOIN payment_intents i ON i.id = r.intent_id
      WHERE r.id = refund_attempts.refund_id
        AND app.can_person(i.customer_person_id)
    )
  );
