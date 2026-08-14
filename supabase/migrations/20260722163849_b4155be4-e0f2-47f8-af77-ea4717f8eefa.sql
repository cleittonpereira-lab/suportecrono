
CREATE TABLE public.guest_permissions (
  tab_key text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.guest_permissions TO anon, authenticated;
GRANT ALL ON public.guest_permissions TO service_role;
GRANT INSERT, DELETE ON public.guest_permissions TO authenticated;

ALTER TABLE public.guest_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read guest permissions"
  ON public.guest_permissions FOR SELECT
  USING (true);

CREATE POLICY "Only admins can insert guest permissions"
  ON public.guest_permissions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete guest permissions"
  ON public.guest_permissions FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
