-- Sprint 43: pharmacy partner operations audit trails

CREATE TABLE "pharmacy_licence_events" (
    "id"          UUID NOT NULL,
    "licence_id"  UUID NOT NULL,
    "partner_id"  UUID NOT NULL,
    "country_id"  UUID NOT NULL,
    "action"      TEXT NOT NULL,
    "from_status" TEXT,
    "to_status"   TEXT,
    "actor_id"    UUID,
    "reason"      TEXT,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "pharmacy_licence_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pharmacy_licence_events_licence_id_created_at_idx"
  ON "pharmacy_licence_events"("licence_id", "created_at");
CREATE INDEX "pharmacy_licence_events_partner_id_created_at_idx"
  ON "pharmacy_licence_events"("partner_id", "created_at");
ALTER TABLE "pharmacy_licence_events"
  ADD CONSTRAINT "pharmacy_licence_events_licence_id_fkey"
  FOREIGN KEY ("licence_id") REFERENCES "pharmacy_licences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "partner_commercial_approval_events" (
    "id"          UUID NOT NULL,
    "approval_id" UUID NOT NULL,
    "partner_id"  UUID NOT NULL,
    "country_id"  UUID NOT NULL,
    "action"      TEXT NOT NULL,
    "approved"    BOOLEAN,
    "actor_id"    UUID,
    "reason"      TEXT,
    "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "partner_commercial_approval_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "partner_commercial_approval_events_approval_id_created_at_idx"
  ON "partner_commercial_approval_events"("approval_id", "created_at");
CREATE INDEX "partner_commercial_approval_events_partner_id_created_at_idx"
  ON "partner_commercial_approval_events"("partner_id", "created_at");
ALTER TABLE "partner_commercial_approval_events"
  ADD CONSTRAINT "partner_commercial_approval_events_approval_id_fkey"
  FOREIGN KEY ("approval_id") REFERENCES "partner_commercial_approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
