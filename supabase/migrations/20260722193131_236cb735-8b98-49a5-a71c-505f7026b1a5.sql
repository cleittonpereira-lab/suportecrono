
-- Admin management of tab_permissions
CREATE POLICY "admin tabs insert" ON public.tab_permissions FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin tabs delete" ON public.tab_permissions FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin tabs update" ON public.tab_permissions FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin management of user_roles
CREATE POLICY "admin roles insert" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin roles delete" ON public.user_roles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin roles update" ON public.user_roles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Prevent non-admins from editing their own cargo (admins-only field)
CREATE OR REPLACE FUNCTION public.tg_profiles_protect_cargo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.cargo IS DISTINCT FROM OLD.cargo AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.cargo := OLD.cargo;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS profiles_protect_cargo ON public.profiles;
CREATE TRIGGER profiles_protect_cargo BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_protect_cargo();
