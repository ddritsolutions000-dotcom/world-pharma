CREATE TABLE "rider_presence" (
  "id" UUID NOT NULL,
  "person_id" UUID NOT NULL,
  "organization_id" UUID,
  "online" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "rider_presence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rider_presence_person_id_key" ON "rider_presence"("person_id");

ALTER TABLE "rider_presence"
  ADD CONSTRAINT "rider_presence_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rider_presence"
  ADD CONSTRAINT "rider_presence_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "rider_presence" ENABLE ROW LEVEL SECURITY;

CREATE POLICY rider_presence_access ON rider_presence TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR (app.person_id() IS NOT NULL AND person_id = app.person_id())
    OR (organization_id IS NOT NULL AND app.can_org(organization_id))
  )
  WITH CHECK (
    app.is_worker()
    OR (app.person_id() IS NOT NULL AND person_id = app.person_id())
  );
