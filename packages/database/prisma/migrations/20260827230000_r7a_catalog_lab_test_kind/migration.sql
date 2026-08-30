-- R7-A: additive catalog enums for lab diagnostic offerings (one catalog kernel).
-- No new tables; no booking/CoC/pathology aggregates.

ALTER TYPE "CatalogItemKind" ADD VALUE IF NOT EXISTS 'LAB_TEST';
ALTER TYPE "OfferOwnership" ADD VALUE IF NOT EXISTS 'LAB_OWNED';
