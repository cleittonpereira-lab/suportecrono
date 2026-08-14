
-- Allow service-role/server-side updates (auth.uid() IS NULL) to change protected fields;
-- still block ordinary authenticated users from escalating their own profile.
CREATE OR REPLACE FUNCTION public.tg_profiles_protect_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.username := OLD.username;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_profiles_protect_cargo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.cargo IS DISTINCT FROM OLD.cargo
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.cargo := OLD.cargo;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_profiles_protect_lab_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.lab_report_role IS DISTINCT FROM OLD.lab_report_role
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.lab_report_role := OLD.lab_report_role;
  END IF;
  IF NEW.titulo IS DISTINCT FROM OLD.titulo
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.titulo := OLD.titulo;
  END IF;
  RETURN NEW;
END;
$function$;

-- Accept username input with or without a leading "@".
CREATE OR REPLACE FUNCTION public.resolve_email_by_username(_username text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT email
  FROM public.profiles
  WHERE username = lower(btrim(regexp_replace(coalesce(_username, ''), '^@+', '')))
    AND status <> 'bloqueado'
  LIMIT 1;
$function$;
