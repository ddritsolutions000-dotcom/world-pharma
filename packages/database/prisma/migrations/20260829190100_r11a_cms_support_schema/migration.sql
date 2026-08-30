-- R11-A: CMS + Support kernel schema

CREATE TABLE "cms_content_items" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "content_type" "CmsContentType" NOT NULL,
    "slug" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "status" "CmsContentStatus" NOT NULL DEFAULT 'DRAFT',
    "category_slug" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "author_person_id" UUID NOT NULL,
    "published_version" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cms_content_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cms_content_revisions" (
    "id" UUID NOT NULL,
    "content_item_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "created_by_person_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_content_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cms_content_publications" (
    "id" UUID NOT NULL,
    "content_item_id" UUID NOT NULL,
    "publication_version" INTEGER NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "published_by_person_id" UUID NOT NULL,
    "idempotency_key" TEXT,
    "published_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_content_publications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cms_content_assets" (
    "id" UUID NOT NULL,
    "content_item_id" UUID,
    "country_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "created_by_person_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_content_assets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cms_content_search_documents" (
    "id" UUID NOT NULL,
    "content_item_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content_type" "CmsContentType" NOT NULL,
    "category_slug" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "published" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cms_content_search_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cms_content_audits" (
    "id" UUID NOT NULL,
    "content_item_id" UUID NOT NULL,
    "actor_person_id" UUID,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cms_content_audits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_queues" (
    "id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_queues_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "country_id" UUID NOT NULL,
    "queue_id" UUID NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "assignee_person_id" UUID,
    "idempotency_key" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "resolved_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_messages" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_person_id" UUID NOT NULL,
    "visibility" "SupportMessageVisibility" NOT NULL,
    "body" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_events" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "actor_person_id" UUID,
    "action" TEXT NOT NULL,
    "from_status" "SupportTicketStatus",
    "to_status" "SupportTicketStatus",
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_ticket_attachments" (
    "id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "message_id" UUID,
    "object_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "created_by_person_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cms_content_items_country_id_slug_locale_key" ON "cms_content_items"("country_id", "slug", "locale");
CREATE INDEX "cms_content_items_country_id_status_idx" ON "cms_content_items"("country_id", "status");
CREATE INDEX "cms_content_items_country_id_content_type_category_slug_idx" ON "cms_content_items"("country_id", "content_type", "category_slug");

CREATE UNIQUE INDEX "cms_content_revisions_content_item_id_revision_number_key" ON "cms_content_revisions"("content_item_id", "revision_number");

CREATE UNIQUE INDEX "cms_content_publications_content_item_id_publication_version_key" ON "cms_content_publications"("content_item_id", "publication_version");
CREATE UNIQUE INDEX "cms_content_publications_content_item_id_idempotency_key_key" ON "cms_content_publications"("content_item_id", "idempotency_key");

CREATE INDEX "cms_content_assets_content_item_id_idx" ON "cms_content_assets"("content_item_id");

CREATE UNIQUE INDEX "cms_content_search_documents_content_item_id_key" ON "cms_content_search_documents"("content_item_id");
CREATE INDEX "cms_content_search_documents_country_id_locale_published_idx" ON "cms_content_search_documents"("country_id", "locale", "published");

CREATE INDEX "cms_content_audits_content_item_id_created_at_idx" ON "cms_content_audits"("content_item_id", "created_at");

CREATE UNIQUE INDEX "support_queues_country_id_code_key" ON "support_queues"("country_id", "code");

CREATE UNIQUE INDEX "support_tickets_person_id_idempotency_key_key" ON "support_tickets"("person_id", "idempotency_key");
CREATE INDEX "support_tickets_person_id_created_at_idx" ON "support_tickets"("person_id", "created_at" DESC);
CREATE INDEX "support_tickets_country_id_status_idx" ON "support_tickets"("country_id", "status");
CREATE INDEX "support_tickets_queue_id_status_idx" ON "support_tickets"("queue_id", "status");

CREATE UNIQUE INDEX "support_ticket_messages_ticket_id_idempotency_key_key" ON "support_ticket_messages"("ticket_id", "idempotency_key");
CREATE INDEX "support_ticket_messages_ticket_id_created_at_idx" ON "support_ticket_messages"("ticket_id", "created_at");

CREATE INDEX "support_ticket_events_ticket_id_created_at_idx" ON "support_ticket_events"("ticket_id", "created_at");

CREATE INDEX "support_ticket_attachments_ticket_id_idx" ON "support_ticket_attachments"("ticket_id");

ALTER TABLE "cms_content_items" ADD CONSTRAINT "cms_content_items_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cms_content_items" ADD CONSTRAINT "cms_content_items_author_person_id_fkey" FOREIGN KEY ("author_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cms_content_revisions" ADD CONSTRAINT "cms_content_revisions_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "cms_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cms_content_revisions" ADD CONSTRAINT "cms_content_revisions_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cms_content_publications" ADD CONSTRAINT "cms_content_publications_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "cms_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cms_content_publications" ADD CONSTRAINT "cms_content_publications_published_by_person_id_fkey" FOREIGN KEY ("published_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cms_content_assets" ADD CONSTRAINT "cms_content_assets_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "cms_content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "cms_content_assets" ADD CONSTRAINT "cms_content_assets_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cms_content_assets" ADD CONSTRAINT "cms_content_assets_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cms_content_search_documents" ADD CONSTRAINT "cms_content_search_documents_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "cms_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cms_content_search_documents" ADD CONSTRAINT "cms_content_search_documents_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cms_content_audits" ADD CONSTRAINT "cms_content_audits_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "cms_content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cms_content_audits" ADD CONSTRAINT "cms_content_audits_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_queues" ADD CONSTRAINT "support_queues_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_queue_id_fkey" FOREIGN KEY ("queue_id") REFERENCES "support_queues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignee_person_id_fkey" FOREIGN KEY ("assignee_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_messages" ADD CONSTRAINT "support_ticket_messages_author_person_id_fkey" FOREIGN KEY ("author_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_actor_person_id_fkey" FOREIGN KEY ("actor_person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "support_ticket_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "support_ticket_attachments" ADD CONSTRAINT "support_ticket_attachments_created_by_person_id_fkey" FOREIGN KEY ("created_by_person_id") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
