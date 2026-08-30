-- R7-E: allow draft result line replacement (delete + re-insert).

GRANT DELETE ON "lab_result_lines" TO worldpharma_app;

CREATE POLICY lab_result_lines_delete ON "lab_result_lines" FOR DELETE TO worldpharma_app
  USING (
    app.is_worker()
    OR app.is_platform()
    OR EXISTS (
      SELECT 1 FROM lab_report_versions v
      JOIN lab_reports r ON r.id = v.lab_report_id
      WHERE v.id = lab_result_lines.lab_report_version_id
        AND app.write_org(r.lab_org_id)
        AND v.status IN ('DRAFT', 'PENDING_VERIFY')
    )
  );
