-- R7-E: pathology result entry + versioned digital report + health artifact pointer.

CREATE TYPE "LabReportVersionStatus" AS ENUM ('DRAFT', 'PENDING_VERIFY', 'VERIFIED', 'PUBLISHED');
CREATE TYPE "HealthArtifactType" AS ENUM ('LAB_REPORT');

CREATE TABLE "lab_reports" (
    "id" UUID NOT NULL,
    "lab_accession_id" UUID NOT NULL,
    "lab_sample_id" UUID NOT NULL,
    "lab_booking_id" UUID NOT NULL,
    "lab_org_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "assigned_pathologist_person_id" UUID,
    "current_version_id" UUID,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "lab_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lab_report_versions" (
    "id" UUID NOT NULL,
    "lab_report_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "LabReportVersionStatus" NOT NULL DEFAULT 'DRAFT',
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
    CONSTRAINT "lab_report_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lab_result_lines" (
    "id" UUID NOT NULL,
    "lab_report_version_id" UUID NOT NULL,
    "analyte_code" TEXT NOT NULL,
    "analyte_name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "reference_range" TEXT,
    "entered_by_person_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lab_result_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "health_artifacts" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "artifact_type" "HealthArtifactType" NOT NULL,
    "lab_report_version_id" UUID NOT NULL,
    "lab_booking_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ NOT NULL,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "health_artifacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lab_reports_lab_accession_id_key" ON "lab_reports"("lab_accession_id");
CREATE UNIQUE INDEX "lab_reports_lab_sample_id_key" ON "lab_reports"("lab_sample_id");
CREATE UNIQUE INDEX "lab_reports_lab_booking_id_key" ON "lab_reports"("lab_booking_id");
CREATE UNIQUE INDEX "lab_reports_current_version_id_key" ON "lab_reports"("current_version_id");
CREATE INDEX "lab_reports_lab_org_id_created_at_idx" ON "lab_reports"("lab_org_id", "created_at");

CREATE UNIQUE INDEX "lab_report_versions_lab_report_id_version_number_key" ON "lab_report_versions"("lab_report_id", "version_number");
CREATE INDEX "lab_report_versions_lab_report_id_status_idx" ON "lab_report_versions"("lab_report_id", "status");

CREATE INDEX "lab_result_lines_lab_report_version_id_idx" ON "lab_result_lines"("lab_report_version_id");

CREATE UNIQUE INDEX "health_artifacts_lab_report_version_id_key" ON "health_artifacts"("lab_report_version_id");
CREATE INDEX "health_artifacts_person_id_published_at_idx" ON "health_artifacts"("person_id", "published_at");

ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_lab_accession_id_fkey"
  FOREIGN KEY ("lab_accession_id") REFERENCES "lab_accessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_lab_sample_id_fkey"
  FOREIGN KEY ("lab_sample_id") REFERENCES "lab_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_lab_booking_id_fkey"
  FOREIGN KEY ("lab_booking_id") REFERENCES "lab_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_lab_org_id_fkey"
  FOREIGN KEY ("lab_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_assigned_pathologist_person_id_fkey"
  FOREIGN KEY ("assigned_pathologist_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lab_reports" ADD CONSTRAINT "lab_reports_current_version_id_fkey"
  FOREIGN KEY ("current_version_id") REFERENCES "lab_report_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lab_report_versions" ADD CONSTRAINT "lab_report_versions_lab_report_id_fkey"
  FOREIGN KEY ("lab_report_id") REFERENCES "lab_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_report_versions" ADD CONSTRAINT "lab_report_versions_entered_by_person_id_fkey"
  FOREIGN KEY ("entered_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lab_report_versions" ADD CONSTRAINT "lab_report_versions_verified_by_person_id_fkey"
  FOREIGN KEY ("verified_by_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lab_report_versions" ADD CONSTRAINT "lab_report_versions_published_by_person_id_fkey"
  FOREIGN KEY ("published_by_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lab_report_versions" ADD CONSTRAINT "lab_report_versions_amends_version_id_fkey"
  FOREIGN KEY ("amends_version_id") REFERENCES "lab_report_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lab_result_lines" ADD CONSTRAINT "lab_result_lines_lab_report_version_id_fkey"
  FOREIGN KEY ("lab_report_version_id") REFERENCES "lab_report_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lab_result_lines" ADD CONSTRAINT "lab_result_lines_entered_by_person_id_fkey"
  FOREIGN KEY ("entered_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "health_artifacts" ADD CONSTRAINT "health_artifacts_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "health_artifacts" ADD CONSTRAINT "health_artifacts_lab_report_version_id_fkey"
  FOREIGN KEY ("lab_report_version_id") REFERENCES "lab_report_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "health_artifacts" ADD CONSTRAINT "health_artifacts_lab_booking_id_fkey"
  FOREIGN KEY ("lab_booking_id") REFERENCES "lab_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lab_reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_reports" FORCE ROW LEVEL SECURITY;
ALTER TABLE "lab_report_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_report_versions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "lab_result_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lab_result_lines" FORCE ROW LEVEL SECURITY;
ALTER TABLE "health_artifacts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "health_artifacts" FORCE ROW LEVEL SECURITY;

CREATE POLICY lab_reports_access ON "lab_reports" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_org("lab_org_id")
    OR EXISTS (
      SELECT 1 FROM lab_bookings b
      WHERE b.id = lab_reports.lab_booking_id
        AND app.can_person(b.customer_person_id)
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.write_org("lab_org_id")
  );

CREATE POLICY lab_report_versions_access ON "lab_report_versions" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM lab_reports r
      WHERE r.id = lab_report_versions.lab_report_id
        AND (
          app.can_org(r.lab_org_id)
          OR (
            lab_report_versions.status = 'PUBLISHED'
            AND EXISTS (
              SELECT 1 FROM lab_bookings b
              WHERE b.id = r.lab_booking_id AND app.can_person(b.customer_person_id)
            )
          )
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM lab_reports r
      WHERE r.id = lab_report_versions.lab_report_id AND app.write_org(r.lab_org_id)
    )
  );

CREATE POLICY lab_result_lines_access ON "lab_result_lines" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM lab_report_versions v
      JOIN lab_reports r ON r.id = v.lab_report_id
      WHERE v.id = lab_result_lines.lab_report_version_id
        AND (
          app.can_org(r.lab_org_id)
          OR (
            v.status = 'PUBLISHED'
            AND EXISTS (
              SELECT 1 FROM lab_bookings b
              WHERE b.id = r.lab_booking_id AND app.can_person(b.customer_person_id)
            )
          )
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM lab_report_versions v
      JOIN lab_reports r ON r.id = v.lab_report_id
      WHERE v.id = lab_result_lines.lab_report_version_id
        AND app.write_org(r.lab_org_id)
        AND v.status IN ('DRAFT', 'PENDING_VERIFY')
    )
  );

CREATE POLICY health_artifacts_access ON "health_artifacts" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person("person_id")
    OR EXISTS (
      SELECT 1 FROM lab_bookings b
      WHERE b.id = health_artifacts.lab_booking_id AND app.can_org(b.lab_org_id)
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM lab_bookings b
      WHERE b.id = health_artifacts.lab_booking_id AND app.write_org(b.lab_org_id)
    )
  );

GRANT SELECT, INSERT, UPDATE ON "lab_reports" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE ON "lab_report_versions" TO worldpharma_app;
GRANT SELECT, INSERT, DELETE ON "lab_result_lines" TO worldpharma_app;
GRANT SELECT, INSERT ON "health_artifacts" TO worldpharma_app;
