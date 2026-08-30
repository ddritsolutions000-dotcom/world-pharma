-- R12-F: product reviews, Q&A, personalization events

CREATE TYPE "ProductReviewStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');
CREATE TYPE "ProductQuestionStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');
CREATE TYPE "PersonalizationEventKind" AS ENUM (
  'PRODUCT_VIEWED',
  'PRODUCT_ADDED_TO_WISHLIST',
  'PRODUCT_ADDED_TO_CART',
  'PRODUCT_REVIEWED',
  'PRODUCT_QUESTION_ASKED',
  'ORDER_PLACED'
);

CREATE TABLE "product_reviews" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "catalog_item_id" UUID NOT NULL,
  "author_person_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "body" TEXT NOT NULL,
  "status" "ProductReviewStatus" NOT NULL DEFAULT 'SUBMITTED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_review_responses" (
  "id" UUID NOT NULL,
  "review_id" UUID NOT NULL,
  "responder_person_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_review_responses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_questions" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "catalog_item_id" UUID NOT NULL,
  "author_person_id" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "answer_body" TEXT,
  "status" "ProductQuestionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "personalization_events" (
  "id" UUID NOT NULL,
  "country_id" UUID NOT NULL,
  "person_id" UUID,
  "catalog_item_id" UUID,
  "catalog_offer_id" UUID,
  "order_id" UUID,
  "source" TEXT NOT NULL,
  "source_key" TEXT NOT NULL,
  "event_kind" "PersonalizationEventKind" NOT NULL,
  "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "personalization_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_reviews_catalog_item_id_author_person_id_country_id_key"
  ON "product_reviews"("catalog_item_id", "author_person_id", "country_id");
CREATE INDEX "product_reviews_country_id_catalog_item_id_status_created_at_idx"
  ON "product_reviews"("country_id", "catalog_item_id", "status", "created_at");
CREATE INDEX "product_reviews_author_person_id_country_id_idx"
  ON "product_reviews"("author_person_id", "country_id");

CREATE INDEX "product_review_responses_review_id_created_at_idx"
  ON "product_review_responses"("review_id", "created_at");

CREATE INDEX "product_questions_country_id_catalog_item_id_status_created_at_idx"
  ON "product_questions"("country_id", "catalog_item_id", "status", "created_at");
CREATE INDEX "product_questions_author_person_id_country_id_idx"
  ON "product_questions"("author_person_id", "country_id");

CREATE UNIQUE INDEX "personalization_events_source_source_key_event_kind_key"
  ON "personalization_events"("source", "source_key", "event_kind");
CREATE INDEX "personalization_events_country_id_person_id_occurred_at_idx"
  ON "personalization_events"("country_id", "person_id", "occurred_at");
CREATE INDEX "personalization_events_catalog_item_id_occurred_at_idx"
  ON "personalization_events"("catalog_item_id", "occurred_at");

ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_catalog_item_id_fkey"
  FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_author_person_id_fkey"
  FOREIGN KEY ("author_person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_reviews" ADD CONSTRAINT "product_reviews_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_review_responses" ADD CONSTRAINT "product_review_responses_review_id_fkey"
  FOREIGN KEY ("review_id") REFERENCES "product_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_review_responses" ADD CONSTRAINT "product_review_responses_responder_person_id_fkey"
  FOREIGN KEY ("responder_person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_questions" ADD CONSTRAINT "product_questions_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_questions" ADD CONSTRAINT "product_questions_catalog_item_id_fkey"
  FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_questions" ADD CONSTRAINT "product_questions_author_person_id_fkey"
  FOREIGN KEY ("author_person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personalization_events" ADD CONSTRAINT "personalization_events_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "personalization_events" ADD CONSTRAINT "personalization_events_person_id_fkey"
  FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "personalization_events" ADD CONSTRAINT "personalization_events_catalog_item_id_fkey"
  FOREIGN KEY ("catalog_item_id") REFERENCES "catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
