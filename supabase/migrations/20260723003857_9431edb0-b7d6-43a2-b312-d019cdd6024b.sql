
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['amostras','ensaios','equipamentos','programacoes','programacao_historico','tipos_ensaio','tipos_ensaio_dependencias']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS amostras_all ON public.amostras;
CREATE POLICY amostras_auth_select ON public.amostras FOR SELECT TO authenticated USING (true);
CREATE POLICY amostras_auth_insert ON public.amostras FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY amostras_auth_update ON public.amostras FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY amostras_admin_delete ON public.amostras FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS ensaios_all ON public.ensaios;
CREATE POLICY ensaios_auth_select ON public.ensaios FOR SELECT TO authenticated USING (true);
CREATE POLICY ensaios_auth_insert ON public.ensaios FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY ensaios_auth_update ON public.ensaios FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY ensaios_admin_delete ON public.ensaios FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS equipamentos_all ON public.equipamentos;
CREATE POLICY equipamentos_auth_select ON public.equipamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY equipamentos_auth_insert ON public.equipamentos FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY equipamentos_auth_update ON public.equipamentos FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY equipamentos_admin_delete ON public.equipamentos FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS programacoes_all ON public.programacoes;
CREATE POLICY programacoes_auth_select ON public.programacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY programacoes_auth_insert ON public.programacoes FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY programacoes_auth_update ON public.programacoes FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY programacoes_admin_delete ON public.programacoes FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS prog_hist_all ON public.programacao_historico;
CREATE POLICY prog_hist_auth_select ON public.programacao_historico FOR SELECT TO authenticated USING (true);
CREATE POLICY prog_hist_auth_insert ON public.programacao_historico FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY prog_hist_admin_delete ON public.programacao_historico FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS tipos_ensaio_all ON public.tipos_ensaio;
CREATE POLICY tipos_ensaio_auth_select ON public.tipos_ensaio FOR SELECT TO authenticated USING (true);
CREATE POLICY tipos_ensaio_admin_insert ON public.tipos_ensaio FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY tipos_ensaio_admin_update ON public.tipos_ensaio FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY tipos_ensaio_admin_delete ON public.tipos_ensaio FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS tipos_ensaio_dep_all ON public.tipos_ensaio_dependencias;
CREATE POLICY tipos_ensaio_dep_auth_select ON public.tipos_ensaio_dependencias FOR SELECT TO authenticated USING (true);
CREATE POLICY tipos_ensaio_dep_admin_insert ON public.tipos_ensaio_dependencias FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY tipos_ensaio_dep_admin_update ON public.tipos_ensaio_dependencias FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY tipos_ensaio_dep_admin_delete ON public.tipos_ensaio_dependencias FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Auth read lab index" ON public.lab_index;
CREATE POLICY "Lab roles read lab_index" ON public.lab_index FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.lab_report_role IS NOT NULL)
);

DROP POLICY IF EXISTS "auth read approvals" ON public.lab_report_approvals;
CREATE POLICY "Lab roles read approvals" ON public.lab_report_approvals FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR requested_by = auth.uid()
  OR decided_by = auth.uid()
  OR verified_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.lab_report_role IN ('aprovador','verificador'))
);

DROP POLICY IF EXISTS "auth read comments" ON public.lab_report_approval_comments;
CREATE POLICY "Lab roles read comments" ON public.lab_report_approval_comments FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR author_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.lab_report_role IN ('aprovador','verificador','digitador'))
);

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
