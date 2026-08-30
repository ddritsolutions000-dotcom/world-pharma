-- R8-E: customer read access to published imaging reports (mirror R7-E lab policies).

DROP POLICY IF EXISTS imaging_reports_access ON "imaging_reports";

CREATE POLICY imaging_reports_access ON "imaging_reports" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR app.can_org("imaging_org_id")
    OR (
      assigned_radiologist_person_id IS NOT NULL
      AND app.can_person(assigned_radiologist_person_id)
    )
    OR EXISTS (
      SELECT 1 FROM imaging_bookings b
      WHERE b.id = imaging_reports.imaging_booking_id
        AND app.can_person(b.customer_person_id)
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR app.write_org("imaging_org_id")
    OR (
      assigned_radiologist_person_id IS NOT NULL
      AND app.can_person(assigned_radiologist_person_id)
    )
  );

DROP POLICY IF EXISTS imaging_report_versions_access ON "imaging_report_versions";

CREATE POLICY imaging_report_versions_access ON "imaging_report_versions" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM imaging_reports r
      WHERE r.id = imaging_report_versions.imaging_report_id
        AND (
          app.can_org(r.imaging_org_id)
          OR (
            r.assigned_radiologist_person_id IS NOT NULL
            AND app.can_person(r.assigned_radiologist_person_id)
          )
          OR (
            imaging_report_versions.status = 'PUBLISHED'
            AND EXISTS (
              SELECT 1 FROM imaging_bookings b
              WHERE b.id = r.imaging_booking_id AND app.can_person(b.customer_person_id)
            )
          )
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM imaging_reports r
      WHERE r.id = imaging_report_versions.imaging_report_id
        AND (
          app.write_org(r.imaging_org_id)
          OR (
            r.assigned_radiologist_person_id IS NOT NULL
            AND app.can_person(r.assigned_radiologist_person_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS imaging_finding_lines_access ON "imaging_finding_lines";

CREATE POLICY imaging_finding_lines_access ON "imaging_finding_lines" TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM imaging_report_versions v
      JOIN imaging_reports r ON r.id = v.imaging_report_id
      WHERE v.id = imaging_finding_lines.imaging_report_version_id
        AND (
          app.can_org(r.imaging_org_id)
          OR (
            r.assigned_radiologist_person_id IS NOT NULL
            AND app.can_person(r.assigned_radiologist_person_id)
          )
          OR (
            v.status = 'PUBLISHED'
            AND EXISTS (
              SELECT 1 FROM imaging_bookings b
              WHERE b.id = r.imaging_booking_id AND app.can_person(b.customer_person_id)
            )
          )
        )
    )
  )
  WITH CHECK (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM imaging_report_versions v
      JOIN imaging_reports r ON r.id = v.imaging_report_id
      WHERE v.id = imaging_finding_lines.imaging_report_version_id
        AND (
          app.write_org(r.imaging_org_id)
          OR (
            r.assigned_radiologist_person_id IS NOT NULL
            AND app.can_person(r.assigned_radiologist_person_id)
          )
        )
        AND v.status IN ('DRAFT', 'PENDING_VERIFY')
    )
  );
