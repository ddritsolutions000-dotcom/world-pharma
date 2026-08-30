DROP POLICY IF EXISTS security_events_insert ON security_events;
CREATE POLICY security_events_insert ON security_events FOR INSERT TO worldpharma_app
  WITH CHECK (
    app.actor_present()
    AND (
      person_id IS NULL
      OR app.can_person(person_id)
      OR app.is_worker()
      OR app.is_platform()
    )
  );

DROP POLICY IF EXISTS security_events_select ON security_events;
CREATE POLICY security_events_select ON security_events FOR SELECT TO worldpharma_app
  USING (
    app.is_platform()
    OR app.is_worker()
    OR app.actor_kind() = 'auth'
    OR app.can_person(person_id)
    OR (person_id IS NULL AND app.actor_present())
  );

DROP POLICY IF EXISTS video_join_audits_access ON video_join_audits;
DROP POLICY IF EXISTS video_join_audits_auto ON video_join_audits;
CREATE POLICY video_join_audits_access ON video_join_audits TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person(actor_person_id)
    OR EXISTS (
      SELECT 1
      FROM video_sessions vs
      JOIN appointments a ON a.id = vs.appointment_id
      WHERE vs.id = video_join_audits.session_id
        AND (
          app.can_person(a.customer_person_id)
          OR EXISTS (
            SELECT 1 FROM doctor_profiles d
            WHERE d.id = a.doctor_profile_id AND app.can_person(d.person_id)
          )
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.can_person(actor_person_id)
  );
