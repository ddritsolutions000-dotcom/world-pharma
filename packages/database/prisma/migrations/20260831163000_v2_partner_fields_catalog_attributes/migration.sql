-- Partner application structured field capture + catalog product attributes (country-scoped)
ALTER TABLE partner_applications
  ADD COLUMN IF NOT EXISTS application_fields JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requested_fields JSONB NOT NULL DEFAULT '[]';

ALTER TABLE catalog_item_countries
  ADD COLUMN IF NOT EXISTS attributes JSONB NOT NULL DEFAULT '{}';
