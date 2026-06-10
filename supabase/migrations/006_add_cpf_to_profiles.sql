-- Migration 006: Add cpf to profiles and populate from auth.users raw_user_meta_data
-- Run this in Supabase SQL Editor

-- 1) Add column
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf text;

-- 2) Update trigger function to populate cpf on user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, cpf)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', ''),
    COALESCE(new.raw_user_meta_data->>'cpf', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$;

-- 3) Populate existing profiles from auth.users raw_user_meta_data when available
UPDATE public.profiles p
SET cpf = u.raw_user_meta_data->>'cpf'
FROM auth.users u
WHERE p.id = u.id
  AND (p.cpf IS NULL OR p.cpf = '')
  AND (u.raw_user_meta_data->>'cpf') IS NOT NULL;

-- 4) Optional: ensure index on cpf for quick lookup
CREATE INDEX IF NOT EXISTS profiles_cpf_idx ON public.profiles ((cpf));

-- Notes:
-- After running this migration, the frontend should include `cpf` in the
-- signUp meta (we've added that) so new users will have the cpf saved automatically.
