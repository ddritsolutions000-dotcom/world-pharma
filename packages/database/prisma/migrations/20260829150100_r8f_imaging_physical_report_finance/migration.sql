-- R8-F: imaging physical report request lifecycle + REPORT_DELIVERY logistics link.

CREATE TABLE "imaging_physical_report_requests" (
    "id" UUID NOT NULL,
    "imaging_report_id" UUID NOT NULL,
    "imaging_report_version_id" UUID NOT NULL,
    "imaging_booking_id" UUID NOT NULL,
    "imaging_org_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "customer_person_id" UUID NOT NULL,
    "customer_address_id" UUID,
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
    CONSTRAINT "imaging_physical_report_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "logistics_jobs" ADD COLUMN "imaging_physical_report_request_id" UUID;

CREATE UNIQUE INDEX "imaging_physical_report_requests_imaging_booking_id_key"
  ON "imaging_physical_report_requests"("imaging_booking_id");
CREATE UNIQUE INDEX "imaging_physical_report_requests_idempotency_key_key"
  ON "imaging_physical_report_requests"("idempotency_key");
CREATE INDEX "imaging_physical_report_requests_imaging_org_id_status_idx"
  ON "imaging_physical_report_requests"("imaging_org_id", "status");
CREATE INDEX "imaging_physical_report_requests_customer_person_id_status_idx"
  ON "imaging_physical_report_requests"("customer_person_id", "status");

CREATE UNIQUE INDEX "logistics_jobs_imaging_physical_report_request_id_job_type_key"
  ON "logistics_jobs"("imaging_physical_report_request_id", "job_type");
CREATE INDEX "logistics_jobs_imaging_physical_report_request_id_idx"
  ON "logistics_jobs"("imaging_physical_report_request_id");

ALTER TABLE "imaging_physical_report_requests" ADD CONSTRAINT "imaging_physical_report_requests_imaging_report_id_fkey"
  FOREIGN KEY ("imaging_report_id") REFERENCES "imaging_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_physical_report_requests" ADD CONSTRAINT "imaging_physical_report_requests_imaging_report_version_id_fkey"
  FOREIGN KEY ("imaging_report_version_id") REFERENCES "imaging_report_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_physical_report_requests" ADD CONSTRAINT "imaging_physical_report_requests_imaging_booking_id_fkey"
  FOREIGN KEY ("imaging_booking_id") REFERENCES "imaging_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_physical_report_requests" ADD CONSTRAINT "imaging_physical_report_requests_imaging_org_id_fkey"
  FOREIGN KEY ("imaging_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_physical_report_requests" ADD CONSTRAINT "imaging_physical_report_requests_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_physical_report_requests" ADD CONSTRAINT "imaging_physical_report_requests_customer_person_id_fkey"
  FOREIGN KEY ("customer_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "imaging_physical_report_requests" ADD CONSTRAINT "imaging_physical_report_requests_customer_address_id_fkey"
  FOREIGN KEY ("customer_address_id") REFERENCES "customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "logistics_jobs" ADD CONSTRAINT "logistics_jobs_imaging_physical_report_request_id_fkey"
  FOREIGN KEY ("imaging_physical_report_request_id") REFERENCES "imaging_physical_report_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "imaging_physical_report_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "imaging_physical_report_requests" FORCE ROW LEVEL SECURITY;

CREATE POLICY imaging_physical_report_requests_access ON "imaging_physical_report_requests" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_org("imaging_org_id")
    OR app.can_person("customer_person_id")
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.write_org("imaging_org_id")
    OR app.can_person("customer_person_id")
  );

GRANT SELECT, INSERT, UPDATE ON "imaging_physical_report_requests" TO worldpharma_app;
