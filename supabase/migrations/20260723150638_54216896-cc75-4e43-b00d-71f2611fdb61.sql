
-- Add username to profiles + RPC to resolve email by username (login by username)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

-- Store lowercase & unique when set (case-insensitive login by username)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_profiles_normalize_username()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NOT NULL THEN
    NEW.username := lower(btrim(NEW.username));
    IF NEW.username = '' THEN NEW.username := NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_normalize_username ON public.profiles;
CREATE TRIGGER trg_profiles_normalize_username
BEFORE INSERT OR UPDATE OF username ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_normalize_username();

-- Only admins may change the username (mirrors cargo/titulo protection triggers)
CREATE OR REPLACE FUNCTION public.tg_profiles_protect_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.username := OLD.username;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_protect_username ON public.profiles;
CREATE TRIGGER trg_profiles_protect_username
BEFORE UPDATE OF username ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_profiles_protect_username();

-- RPC: resolve email by username. Callable by anon so the login page can
-- translate username -> email before signInWithPassword. Returns NULL when
-- the username is unknown or the profile is blocked.
CREATE OR REPLACE FUNCTION public.resolve_email_by_username(_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email
  FROM public.profiles
  WHERE username = lower(btrim(_username))
    AND status <> 'bloqueado'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_email_by_username(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_email_by_username(text) TO anon, authenticated;
