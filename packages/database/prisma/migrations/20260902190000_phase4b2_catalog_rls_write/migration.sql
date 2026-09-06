-- Write policies for phase 4B-2 control-plane catalog tables (RLS was SELECT-only).

CREATE POLICY "health_packages_insert" ON "health_packages"
  FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY "health_packages_update" ON "health_packages"
  FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.actor_kind() IN ('user', 'worker'))
  WITH CHECK (app.is_platform() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY "health_packages_delete" ON "health_packages"
  FOR DELETE TO worldpharma_app
  USING (app.is_platform());

CREATE POLICY "care_plan_definitions_insert" ON "care_plan_definitions"
  FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY "care_plan_definitions_update" ON "care_plan_definitions"
  FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.actor_kind() IN ('user', 'worker'))
  WITH CHECK (app.is_platform() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY "care_plan_definitions_delete" ON "care_plan_definitions"
  FOR DELETE TO worldpharma_app
  USING (app.is_platform());

CREATE POLICY "serviceability_zones_insert" ON "serviceability_zones"
  FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY "serviceability_zones_update" ON "serviceability_zones"
  FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.actor_kind() IN ('user', 'worker'))
  WITH CHECK (app.is_platform() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY "serviceability_zones_delete" ON "serviceability_zones"
  FOR DELETE TO worldpharma_app
  USING (app.is_platform());

CREATE POLICY "medicine_substitute_edges_insert" ON "medicine_substitute_edges"
  FOR INSERT TO worldpharma_app
  WITH CHECK (app.is_platform() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY "medicine_substitute_edges_update" ON "medicine_substitute_edges"
  FOR UPDATE TO worldpharma_app
  USING (app.is_platform() OR app.actor_kind() IN ('user', 'worker'))
  WITH CHECK (app.is_platform() OR app.actor_kind() IN ('user', 'worker'));

CREATE POLICY "medicine_substitute_edges_delete" ON "medicine_substitute_edges"
  FOR DELETE TO worldpharma_app
  USING (app.is_platform());
