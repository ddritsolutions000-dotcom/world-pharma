ALTER TABLE "cms_content_assets" ADD COLUMN IF NOT EXISTS "folder" TEXT;

CREATE INDEX IF NOT EXISTS "cms_content_assets_country_id_folder_idx"
  ON "cms_content_assets" ("country_id", "folder");
