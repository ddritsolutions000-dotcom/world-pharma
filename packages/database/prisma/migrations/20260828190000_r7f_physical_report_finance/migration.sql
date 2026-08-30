-- R7-F: physical report request lifecycle + sandbox finance fact kinds + REPORT_DELIVERY logistics link.

ALTER TYPE "FinancialFactKind" ADD VALUE IF NOT EXISTS 'LAB_PAYABLE';
ALTER TYPE "FinancialFactKind" ADD VALUE IF NOT EXISTS 'REPORT_DELIVERY_FEE';

CREATE TYPE "PhysicalReportRequestStatus" AS ENUM (
  'REQUESTED',
  'ACCEPTED',
  'PREPARING',
  'PACKED',
  'DISPATCHED',
  'DELIVERED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "physical_report_requests" (
    "id" UUID NOT NULL,
    "lab_report_id" UUID NOT NULL,
    "lab_report_version_id" UUID NOT NULL,
    "lab_booking_id" UUID NOT NULL,
    "lab_org_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "customer_person_id" UUID NOT NULL,
    "status" "PhysicalReportRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "sealed_package_id" TEXT,
    "delivery_address_snapshot" JSONB,
    "failure_reason" TEXT,
    "failure_code" TEXT,
    "cancel_reason" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "physical_report_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "logistics_jobs" ADD COLUMN "physical_report_request_id" UUID;

CREATE UNIQUE INDEX "physical_report_requests_lab_booking_id_key" ON "physical_report_requests"("lab_booking_id");
CREATE UNIQUE INDEX "physical_report_requests_idempotency_key_key" ON "physical_report_requests"("idempotency_key");
CREATE INDEX "physical_report_requests_lab_org_id_status_idx" ON "physical_report_requests"("lab_org_id", "status");
CREATE INDEX "physical_report_requests_customer_person_id_status_idx" ON "physical_report_requests"("customer_person_id", "status");

CREATE UNIQUE INDEX "logistics_jobs_physical_report_request_id_job_type_key"
  ON "logistics_jobs"("physical_report_request_id", "job_type");
CREATE INDEX "logistics_jobs_physical_report_request_id_idx" ON "logistics_jobs"("physical_report_request_id");

ALTER TABLE "physical_report_requests" ADD CONSTRAINT "physical_report_requests_lab_report_id_fkey"
  FOREIGN KEY ("lab_report_id") REFERENCES "lab_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "physical_report_requests" ADD CONSTRAINT "physical_report_requests_lab_report_version_id_fkey"
  FOREIGN KEY ("lab_report_version_id") REFERENCES "lab_report_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "physical_report_requests" ADD CONSTRAINT "physical_report_requests_lab_booking_id_fkey"
  FOREIGN KEY ("lab_booking_id") REFERENCES "lab_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "physical_report_requests" ADD CONSTRAINT "physical_report_requests_lab_org_id_fkey"
  FOREIGN KEY ("lab_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "physical_report_requests" ADD CONSTRAINT "physical_report_requests_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "physical_report_requests" ADD CONSTRAINT "physical_report_requests_customer_person_id_fkey"
  FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "logistics_jobs" ADD CONSTRAINT "logistics_jobs_physical_report_request_id_fkey"
  FOREIGN KEY ("physical_report_request_id") REFERENCES "physical_report_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "physical_report_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "physical_report_requests" FORCE ROW LEVEL SECURITY;

CREATE POLICY physical_report_requests_access ON "physical_report_requests" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_org("lab_org_id")
    OR app.can_person("customer_person_id")
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.write_org("lab_org_id")
    OR app.can_person("customer_person_id")
  );

GRANT SELECT, INSERT, UPDATE ON "physical_report_requests" TO worldpharma_app;
