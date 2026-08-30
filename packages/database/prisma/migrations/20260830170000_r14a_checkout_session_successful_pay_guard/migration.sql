-- R14-A: at most one successful checkout payment per checkout session (CAPTURED / AUTHORIZED_COD).
-- Dedupe legacy sandbox/test rows that violated this invariant before adding the partial unique index.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY checkout_session_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM payment_intents
  WHERE checkout_session_id IS NOT NULL
    AND status IN ('CAPTURED', 'AUTHORIZED_COD')
)
UPDATE payment_intents AS pi
SET status = 'FAILED'
FROM ranked AS r
WHERE pi.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX "payment_intents_checkout_session_successful_pay_key"
  ON "payment_intents" ("checkout_session_id")
  WHERE "checkout_session_id" IS NOT NULL
    AND "status" IN ('CAPTURED', 'AUTHORIZED_COD');
