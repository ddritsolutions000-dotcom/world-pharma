-- R8-F: sandbox imaging payable fact kind (separate txn for PG enum safety).

ALTER TYPE "FinancialFactKind" ADD VALUE IF NOT EXISTS 'IMAGING_PAYABLE';
