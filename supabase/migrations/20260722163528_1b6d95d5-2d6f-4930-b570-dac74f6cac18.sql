
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _is_seed_admin boolean;
  _domain text;
BEGIN
  _domain := lower(split_part(NEW.email, '@', 2));
  IF _domain <> 'suportesolos.com.br' THEN
    RAISE EXCEPTION 'Cadastro permitido apenas para emails @suportesolos.com.br'
      USING ERRCODE = 'P0001';
  END IF;

  _is_seed_admin := (lower(NEW.email) = 'cleitton.pereira@suportesolos.com.br');

  INSERT INTO public.profiles (id, email, nome, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    CASE WHEN _is_seed_admin THEN 'ativo'::public.profile_status ELSE 'pendente'::public.profile_status END
  )
  ON CONFLICT (id) DO NOTHING;

  IF _is_seed_admin THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
