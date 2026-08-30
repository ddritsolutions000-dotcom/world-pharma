-- R8-D: allow radiologist verify transition (VERIFIED) under RLS WITH CHECK.

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
