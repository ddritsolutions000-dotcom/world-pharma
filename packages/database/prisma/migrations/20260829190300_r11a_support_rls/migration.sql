-- R11-A: Support desk FORCE RLS (no USING(true))

ALTER TABLE "support_queues" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_queues" FORCE ROW LEVEL SECURITY;

CREATE POLICY support_queues_select ON "support_queues" FOR SELECT TO worldpharma_app
  USING (
    app.can_country("country_id")
    OR app.is_worker()
    OR app.is_platform()
  );

CREATE POLICY support_queues_insert ON "support_queues" FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_worker() OR app.is_platform());

CREATE POLICY support_queues_update ON "support_queues" FOR UPDATE TO worldpharma_app
  USING (app.is_worker() OR app.is_platform())
  WITH CHECK (app.is_worker() OR app.is_platform());

CREATE POLICY support_queues_no_delete ON "support_queues" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "support_tickets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_tickets" FORCE ROW LEVEL SECURITY;

CREATE POLICY support_tickets_select ON "support_tickets" FOR SELECT TO worldpharma_app
  USING (
    app.can_person("person_id")
    OR (
      (app.is_worker() OR app.is_platform())
      AND app.can_country("country_id")
    )
  );

CREATE POLICY support_tickets_insert ON "support_tickets" FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.can_person("person_id")
    OR (
      (app.is_worker() OR app.is_platform())
      AND app.can_country("country_id")
    )
  );

CREATE POLICY support_tickets_update ON "support_tickets" FOR UPDATE TO worldpharma_app
  USING (
    app.can_person("person_id")
    OR (
      (app.is_worker() OR app.is_platform())
      AND app.can_country("country_id")
    )
  )
  WITH CHECK (
    app.can_person("person_id")
    OR (
      (app.is_worker() OR app.is_platform())
      AND app.can_country("country_id")
    )
  );

CREATE POLICY support_tickets_no_delete ON "support_tickets" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "support_ticket_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_ticket_messages" FORCE ROW LEVEL SECURITY;

CREATE POLICY support_ticket_messages_select ON "support_ticket_messages" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM "support_tickets" t
      WHERE t.id = ticket_id
        AND (
          (
            app.can_person(t.person_id)
            AND visibility = 'CUSTOMER'
          )
          OR (
            (app.is_worker() OR app.is_platform())
            AND app.can_country(t.country_id)
          )
        )
    )
  );

CREATE POLICY support_ticket_messages_insert ON "support_ticket_messages" FOR INSERT TO worldpharma_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "support_tickets" t
      WHERE t.id = ticket_id
        AND (
          app.can_person(t.person_id)
          OR (
            (app.is_worker() OR app.is_platform())
            AND app.can_country(t.country_id)
          )
        )
    )
  );

CREATE POLICY support_ticket_messages_no_update ON "support_ticket_messages" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY support_ticket_messages_no_delete ON "support_ticket_messages" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "support_ticket_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_ticket_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY support_ticket_events_select ON "support_ticket_events" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM "support_tickets" t
      WHERE t.id = ticket_id
        AND (
          app.can_person(t.person_id)
          OR (
            (app.is_worker() OR app.is_platform())
            AND app.can_country(t.country_id)
          )
        )
    )
  );

CREATE POLICY support_ticket_events_insert ON "support_ticket_events" FOR INSERT TO worldpharma_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "support_tickets" t
      WHERE t.id = ticket_id
        AND (
          app.can_person(t.person_id)
          OR (
            (app.is_worker() OR app.is_platform())
            AND app.can_country(t.country_id)
          )
        )
    )
    OR app.actor_present()
  );

CREATE POLICY support_ticket_events_no_update ON "support_ticket_events" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY support_ticket_events_no_delete ON "support_ticket_events" FOR DELETE TO worldpharma_app
  USING (false);

ALTER TABLE "support_ticket_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "support_ticket_attachments" FORCE ROW LEVEL SECURITY;

CREATE POLICY support_ticket_attachments_select ON "support_ticket_attachments" FOR SELECT TO worldpharma_app
  USING (
    EXISTS (
      SELECT 1 FROM "support_tickets" t
      WHERE t.id = ticket_id
        AND (
          app.can_person(t.person_id)
          OR (
            (app.is_worker() OR app.is_platform())
            AND app.can_country(t.country_id)
          )
        )
    )
  );

CREATE POLICY support_ticket_attachments_insert ON "support_ticket_attachments" FOR INSERT TO worldpharma_app
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "support_tickets" t
      WHERE t.id = ticket_id
        AND (
          app.can_person(t.person_id)
          OR (
            (app.is_worker() OR app.is_platform())
            AND app.can_country(t.country_id)
          )
        )
    )
  );

CREATE POLICY support_ticket_attachments_no_update ON "support_ticket_attachments" FOR UPDATE TO worldpharma_app
  USING (false) WITH CHECK (false);

CREATE POLICY support_ticket_attachments_no_delete ON "support_ticket_attachments" FOR DELETE TO worldpharma_app
  USING (false);

GRANT SELECT, INSERT, UPDATE ON "support_queues" TO worldpharma_app;
GRANT SELECT, INSERT, UPDATE ON "support_tickets" TO worldpharma_app;
GRANT SELECT, INSERT ON "support_ticket_messages" TO worldpharma_app;
GRANT SELECT, INSERT ON "support_ticket_events" TO worldpharma_app;
GRANT SELECT, INSERT ON "support_ticket_attachments" TO worldpharma_app;
