-- R14-A DEV/DEMO gate configuration store. Seeded PLACEHOLDER values are not Book-263 evidence.

CREATE TYPE "R14AGateCode" AS ENUM (
  'NAMED_PSP',
  'PRODUCTION_COUNTRY',
  'LEGAL_ENTITY',
  'MERCHANT_OF_RECORD',
  'PSP_CONTRACT',
  'VAULT_PATH',
  'PCI_SAQ'
);

CREATE TYPE "R14AGateEvidenceClass" AS ENUM (
  'PLACEHOLDER',
  'OWNER_EVIDENCED'
);

CREATE TABLE "r14a_human_gates" (
  "gate_code" "R14AGateCode" NOT NULL,
  "value_text" TEXT NOT NULL,
  "evidence_class" "R14AGateEvidenceClass" NOT NULL,
  "evidence_ref" TEXT,
  "updated_by_person_id" UUID,
  "verified_by_person_id" UUID,
  "verified_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "r14a_human_gates_pkey" PRIMARY KEY ("gate_code")
);

CREATE TABLE "r14a_human_gate_revisions" (
  "id" UUID NOT NULL,
  "gate_code" "R14AGateCode" NOT NULL,
  "previous_value_text" TEXT NOT NULL,
  "new_value_text" TEXT NOT NULL,
  "previous_evidence_class" "R14AGateEvidenceClass" NOT NULL,
  "new_evidence_class" "R14AGateEvidenceClass" NOT NULL,
  "actor_person_id" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "r14a_human_gate_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "r14a_human_gate_revisions_gate_code_created_at_idx"
  ON "r14a_human_gate_revisions"("gate_code", "created_at");

ALTER TABLE "r14a_human_gate_revisions"
  ADD CONSTRAINT "r14a_human_gate_revisions_gate_code_fkey"
  FOREIGN KEY ("gate_code") REFERENCES "r14a_human_gates"("gate_code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "r14a_human_gates"
  ADD CONSTRAINT "r14a_gates_placeholder_not_owner_evidenced"
  CHECK (
    "evidence_class" <> 'OWNER_EVIDENCED'
    OR (
      "value_text" NOT ILIKE '%PLACEHOLDER%'
      AND "value_text" NOT ILIKE 'DEV\_%' ESCAPE '\'
      AND "value_text" NOT ILIKE '%DEMO%'
      AND upper("value_text") NOT IN ('ZZ', 'XX', 'TQ', 'PQ', 'TC')
    )
  );

INSERT INTO "r14a_human_gates" (
  "gate_code", "value_text", "evidence_class", "evidence_ref"
) VALUES
  ('NAMED_PSP', 'DEV_PLACEHOLDER_PSP', 'PLACEHOLDER', 'DEV_PLACEHOLDER_NOT_BOOK_263_EVIDENCE'),
  ('PRODUCTION_COUNTRY', 'ZZ', 'PLACEHOLDER', 'DEV_PLACEHOLDER_NOT_BOOK_263_EVIDENCE'),
  ('LEGAL_ENTITY', 'DEV_PLACEHOLDER_ENTITY', 'PLACEHOLDER', 'DEV_PLACEHOLDER_NOT_BOOK_263_EVIDENCE'),
  ('MERCHANT_OF_RECORD', 'DEV_PLACEHOLDER_MOR', 'PLACEHOLDER', 'DEV_PLACEHOLDER_NOT_BOOK_263_EVIDENCE'),
  ('PSP_CONTRACT', 'DEV_PLACEHOLDER_CONTRACT', 'PLACEHOLDER', 'DEV_PLACEHOLDER_NOT_BOOK_263_EVIDENCE'),
  ('VAULT_PATH', 'DEV_PLACEHOLDER_VAULT_PATH', 'PLACEHOLDER', 'DEV_PLACEHOLDER_NOT_BOOK_263_EVIDENCE'),
  ('PCI_SAQ', 'DEV_PLACEHOLDER_SAQ', 'PLACEHOLDER', 'DEV_PLACEHOLDER_NOT_BOOK_263_EVIDENCE');
