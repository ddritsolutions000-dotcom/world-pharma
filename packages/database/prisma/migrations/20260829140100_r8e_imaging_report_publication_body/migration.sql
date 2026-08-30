-- R8-E (step 2): health artifact imaging columns, RLS, immutability triggers.

ALTER TABLE "health_artifacts" ALTER COLUMN "lab_report_version_id" DROP NOT NULL;
ALTER TABLE "health_artifacts" ALTER COLUMN "lab_booking_id" DROP NOT NULL;

ALTER TABLE "health_artifacts" ADD COLUMN IF NOT EXISTS "imaging_report_version_id" UUID;
ALTER TABLE "health_artifacts" ADD COLUMN IF NOT EXISTS "imaging_booking_id" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "health_artifacts_imaging_report_version_id_key"
  ON "health_artifacts"("imaging_report_version_id")
  WHERE "imaging_report_version_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "health_artifacts_imaging_booking_id_idx" ON "health_artifacts"("imaging_booking_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'health_artifacts_imaging_report_version_id_fkey'
  ) THEN
    ALTER TABLE "health_artifacts" ADD CONSTRAINT "health_artifacts_imaging_report_version_id_fkey"
      FOREIGN KEY ("imaging_report_version_id") REFERENCES "imaging_report_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'health_artifacts_imaging_booking_id_fkey'
  ) THEN
    ALTER TABLE "health_artifacts" ADD CONSTRAINT "health_artifacts_imaging_booking_id_fkey"
      FOREIGN KEY ("imaging_booking_id") REFERENCES "imaging_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "health_artifacts" DROP CONSTRAINT IF EXISTS "health_artifacts_type_payload_check";
ALTER TABLE "health_artifacts" ADD CONSTRAINT "health_artifacts_type_payload_check" CHECK (
  (
    "artifact_type" = 'LAB_REPORT'
    AND "lab_report_version_id" IS NOT NULL
    AND "lab_booking_id" IS NOT NULL
    AND "imaging_report_version_id" IS NULL
    AND "imaging_booking_id" IS NULL
  )
  OR (
    "artifact_type" = 'IMAGING_REPORT'
    AND "imaging_report_version_id" IS NOT NULL
    AND "imaging_booking_id" IS NOT NULL
    AND "lab_report_version_id" IS NULL
    AND "lab_booking_id" IS NULL
  )
);

DROP POLICY IF EXISTS health_artifacts_access ON "health_artifacts";

CREATE POLICY health_artifacts_access ON "health_artifacts" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("person_id")
    OR EXISTS (
      SELECT 1 FROM lab_bookings b
      WHERE b.id = health_artifacts.lab_booking_id AND app.can_org(b.lab_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = health_artifacts.imaging_booking_id AND app.can_org(b.imaging_org_id)
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM lab_bookings b
      WHERE b.id = health_artifacts.lab_booking_id AND app.write_org(b.lab_org_id)
    )
    OR EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = health_artifacts.imaging_booking_id AND app.write_org(b.imaging_org_id)
    )
  );

CREATE OR REPLACE FUNCTION app.guard_published_imaging_report_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published imaging report version is immutable'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published imaging report version cannot be deleted'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION app.guard_published_imaging_finding_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status text;
  version_id uuid;
BEGIN
  version_id := COALESCE(OLD.imaging_report_version_id, NEW.imaging_report_version_id);
  SELECT v.status
    INTO version_status
    FROM imaging_report_versions v
   WHERE v.id = version_id;
  IF version_status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published imaging finding line is immutable'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_imaging_report_versions_guard_published ON imaging_report_versions;
CREATE TRIGGER tr_imaging_report_versions_guard_published
  BEFORE UPDATE OR DELETE ON imaging_report_versions
  FOR EACH ROW
  EXECUTE FUNCTION app.guard_published_imaging_report_version();

DROP TRIGGER IF EXISTS tr_imaging_finding_lines_guard_published ON imaging_finding_lines;
CREATE TRIGGER tr_imaging_finding_lines_guard_published
  BEFORE UPDATE OR DELETE ON imaging_finding_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.guard_published_imaging_finding_line();

GRANT EXECUTE ON FUNCTION app.guard_published_imaging_report_version() TO worldpharma_app;
GRANT EXECUTE ON FUNCTION app.guard_published_imaging_finding_line() TO worldpharma_app;
