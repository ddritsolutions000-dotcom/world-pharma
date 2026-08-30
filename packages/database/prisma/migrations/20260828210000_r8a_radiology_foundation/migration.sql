-- R8-A: additive radiology foundation enums (one catalog kernel; no booking/study/report tables).
-- No USING(true). No new RLS tables (enum-only; catalog offers use existing seller_org RLS).

ALTER TYPE "OrganizationKind" ADD VALUE IF NOT EXISTS 'IMAGING_CENTER';
ALTER TYPE "CatalogItemKind" ADD VALUE IF NOT EXISTS 'IMAGING_STUDY';
ALTER TYPE "OfferOwnership" ADD VALUE IF NOT EXISTS 'IMAGING_OWNED';
