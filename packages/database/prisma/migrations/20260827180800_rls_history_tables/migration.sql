DROP POLICY IF EXISTS appointment_status_history_failclosed ON appointment_status_history;
DROP POLICY IF EXISTS appointment_status_history_auto ON appointment_status_history;
CREATE POLICY appointment_status_history_access ON appointment_status_history TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = appointment_status_history.appointment_id
        AND (
          app.can_person(a.customer_person_id)
          OR EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.id = a.doctor_profile_id AND app.can_person(d.person_id))
          OR app.write_org(a.organization_id)
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = appointment_status_history.appointment_id
        AND (
          app.can_person(a.customer_person_id)
          OR EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.id = a.doctor_profile_id AND app.can_person(d.person_id))
          OR app.write_org(a.organization_id)
        )
    )
  );

DROP POLICY IF EXISTS appointment_schedule_revisions_failclosed ON appointment_schedule_revisions;
DROP POLICY IF EXISTS appointment_schedule_revisions_auto ON appointment_schedule_revisions;
CREATE POLICY appointment_schedule_revisions_access ON appointment_schedule_revisions TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = appointment_schedule_revisions.appointment_id
        AND (
          app.can_person(a.customer_person_id)
          OR EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.id = a.doctor_profile_id AND app.can_person(d.person_id))
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.id = appointment_schedule_revisions.appointment_id
        AND (
          app.can_person(a.customer_person_id)
          OR EXISTS (SELECT 1 FROM doctor_profiles d WHERE d.id = a.doctor_profile_id AND app.can_person(d.person_id))
        )
    )
  );

DROP POLICY IF EXISTS order_status_history_failclosed ON order_status_history;
DROP POLICY IF EXISTS order_status_history_auto ON order_status_history;
CREATE POLICY order_status_history_access ON order_status_history TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_status_history.order_id
        AND (app.can_person(o.customer_person_id) OR app.can_org(o.seller_org_id))
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_status_history.order_id
        AND (app.can_person(o.customer_person_id) OR app.write_org(o.seller_org_id) OR app.actor_kind() = 'user')
    )
  );
