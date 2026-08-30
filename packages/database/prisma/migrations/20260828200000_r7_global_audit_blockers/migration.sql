-- Book 152 (CR-R7-GLOBAL-FIX-152): B-IM-01 published report immutability (defense-in-depth).
-- B-RLS-01: permissive USING(true) policies were superseded by 20260827180000_multi_tenant_rls;
-- live verification is enforced in rls.tenancy.e2e.spec.ts (count must be 0).

CREATE OR REPLACE FUNCTION app.guard_published_lab_report_version()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published lab report version is immutable'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' AND OLD.status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published lab report version cannot be deleted'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION app.guard_published_lab_result_line()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_status text;
  version_id uuid;
BEGIN
  version_id := COALESCE(OLD.lab_report_version_id, NEW.lab_report_version_id);
  SELECT v.status
    INTO version_status
    FROM lab_report_versions v
   WHERE v.id = version_id;
  IF version_status = 'PUBLISHED' THEN
    RAISE EXCEPTION 'published lab result line is immutable'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_lab_report_versions_guard_published ON lab_report_versions;
CREATE TRIGGER tr_lab_report_versions_guard_published
  BEFORE UPDATE OR DELETE ON lab_report_versions
  FOR EACH ROW
  EXECUTE FUNCTION app.guard_published_lab_report_version();

DROP TRIGGER IF EXISTS tr_lab_result_lines_guard_published ON lab_result_lines;
CREATE TRIGGER tr_lab_result_lines_guard_published
  BEFORE UPDATE OR DELETE ON lab_result_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.guard_published_lab_result_line();

GRANT EXECUTE ON FUNCTION app.guard_published_lab_report_version() TO worldpharma_app;
GRANT EXECUTE ON FUNCTION app.guard_published_lab_result_line() TO worldpharma_app;
