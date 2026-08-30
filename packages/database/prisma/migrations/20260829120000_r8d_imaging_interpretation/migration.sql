-- R8-D: radiologist interpretation foundation. Stops before R8-E customer publication.
-- Additive only. No USING(true). No HealthArtifact / IMAGING_REPORT publication.

INSERT INTO "partner_types" ("id", "code", "name")
SELECT gen_random_uuid(), 'RADIOLOGIST', 'Radiologist'
WHERE NOT EXISTS (SELECT 1 FROM "partner_types" WHERE "code" = 'RADIOLOGIST');

CREATE TYPE "ImagingReportVersionStatus" AS ENUM (
  'DRAFT',
  'PENDING_VERIFY',
  'VERIFIED',
  'PUBLISHED'
);

CREATE TABLE "imaging_reports" (
    "id" UUID NOT NULL,
    "imaging_study_id" UUID NOT NULL,
    "imaging_booking_id" UUID NOT NULL,
    "imaging_org_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "assigned_radiologist_person_id" UUID,
    "current_version_id" UUID,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "imaging_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "imaging_report_versions" (
    "id" UUID NOT NULL,
    "imaging_report_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "ImagingReportVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,
    "object_key" TEXT,
    "entered_by_person_id" UUID NOT NULL,
    "verified_by_person_id" UUID,
    "published_by_person_id" UUID,
    "amends_version_id" UUID,
    "amendment_reason" TEXT,
    "published_at" TIMESTAMPTZ,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "imaging_report_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "imaging_finding_lines" (
    "id" UUID NOT NULL,
    "imaging_report_version_id" UUID NOT NULL,
    "finding_code" TEXT NOT NULL,
    "finding_text" TEXT NOT NULL,
    "body_region_code" TEXT,
    "severity_code" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "entered_by_person_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imaging_finding_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "imaging_reports_imaging_study_id_key" ON "imaging_reports"("imaging_study_id");
CREATE UNIQUE INDEX "imaging_reports_imaging_booking_id_key" ON "imaging_reports"("imaging_booking_id");
CREATE UNIQUE INDEX "imaging_reports_current_version_id_key" ON "imaging_reports"("current_version_id");
CREATE INDEX "imaging_reports_imaging_org_id_created_at_idx" ON "imaging_reports"("imaging_org_id", "created_at");

CREATE UNIQUE INDEX "imaging_report_versions_imaging_report_id_version_number_key"
  ON "imaging_report_versions"("imaging_report_id", "version_number");
CREATE INDEX "imaging_report_versions_imaging_report_id_status_idx"
  ON "imaging_report_versions"("imaging_report_id", "status");

CREATE INDEX "imaging_finding_lines_imaging_report_version_id_idx"
  ON "imaging_finding_lines"("imaging_report_version_id");

ALTER TABLE "imaging_reports" ADD CONSTRAINT "imaging_reports_imaging_study_id_fkey"
  FOREIGN KEY ("imaging_study_id") REFERENCES "imaging_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imaging_reports" ADD CONSTRAINT "imaging_reports_imaging_booking_id_fkey"
  FOREIGN KEY ("imaging_booking_id") REFERENCES "imaging_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imaging_reports" ADD CONSTRAINT "imaging_reports_imaging_org_id_fkey"
  FOREIGN KEY ("imaging_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_reports" ADD CONSTRAINT "imaging_reports_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_reports" ADD CONSTRAINT "imaging_reports_assigned_radiologist_person_id_fkey"
  FOREIGN KEY ("assigned_radiologist_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "imaging_reports" ADD CONSTRAINT "imaging_reports_current_version_id_fkey"
  FOREIGN KEY ("current_version_id") REFERENCES "imaging_report_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "imaging_report_versions" ADD CONSTRAINT "imaging_report_versions_imaging_report_id_fkey"
  FOREIGN KEY ("imaging_report_id") REFERENCES "imaging_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imaging_report_versions" ADD CONSTRAINT "imaging_report_versions_entered_by_person_id_fkey"
  FOREIGN KEY ("entered_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_report_versions" ADD CONSTRAINT "imaging_report_versions_verified_by_person_id_fkey"
  FOREIGN KEY ("verified_by_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "imaging_report_versions" ADD CONSTRAINT "imaging_report_versions_published_by_person_id_fkey"
  FOREIGN KEY ("published_by_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "imaging_report_versions" ADD CONSTRAINT "imaging_report_versions_amends_version_id_fkey"
  FOREIGN KEY ("amends_version_id") REFERENCES "imaging_report_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "imaging_finding_lines" ADD CONSTRAINT "imaging_finding_lines_imaging_report_version_id_fkey"
  FOREIGN KEY ("imaging_report_version_id") REFERENCES "imaging_report_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "imaging_finding_lines" ADD CONSTRAINT "imaging_finding_lines_entered_by_person_id_fkey"
  FOREIGN KEY ("entered_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "imaging_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imaging_reports" FORCE ROW LEVEL SECURITY;
ALTER TABLE "imaging_report_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imaging_report_versions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "imaging_finding_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imaging_finding_lines" FORCE ROW LEVEL SECURITY;

CREATE POLICY imaging_reports_access ON "imaging_reports" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_org("imaging_org_id")
    OR (
      assigned_radiologist_person_id IS NOT NULL
      AND app.can_person(assigned_radiologist_person_id)
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.write_org("imaging_org_id")
    OR (
      assigned_radiologist_person_id IS NOT NULL
      AND app.can_person(assigned_radiologist_person_id)
    )
  );

CREATE POLICY imaging_report_versions_access ON "imaging_report_versions" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM imaging_reports r
      WHERE r.id = imaging_report_versions.imaging_report_id
        AND (
          app.can_org(r.imaging_org_id)
          OR (
            r.assigned_radiologist_person_id IS NOT NULL
            AND app.can_person(r.assigned_radiologist_person_id)
          )
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM imaging_reports r
      WHERE r.id = imaging_report_versions.imaging_report_id
        AND (
          app.write_org(r.imaging_org_id)
          OR (
            r.assigned_radiologist_person_id IS NOT NULL
            AND app.can_person(r.assigned_radiologist_person_id)
          )
        )
    )
  );

CREATE POLICY imaging_finding_lines_access ON "imaging_finding_lines" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM imaging_report_versions v
      JOIN imaging_reports r ON r.id = v.imaging_report_id
      WHERE v.id = imaging_finding_lines.imaging_report_version_id
        AND (
          app.can_org(r.imaging_org_id)
          OR (
            r.assigned_radiologist_person_id IS NOT NULL
            AND app.can_person(r.assigned_radiologist_person_id)
          )
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM imaging_report_versions v
      JOIN imaging_reports r ON r.id = v.imaging_report_id
      WHERE v.id = imaging_finding_lines.imaging_report_version_id
        AND (
          app.write_org(r.imaging_org_id)
          OR (
            r.assigned_radiologist_person_id IS NOT NULL
            AND app.can_person(r.assigned_radiologist_person_id)
          )
        )
        AND v.status IN ('DRAFT', 'PENDING_VERIFY')
    )
  );

GRANT SELECT, INSERT, UPDATE ON "imaging_reports" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE ON "imaging_report_versions" TO worldpharma_app;
GRANT SELECT, INSERT, DELETE ON "imaging_finding_lines" TO worldpharma_app;
