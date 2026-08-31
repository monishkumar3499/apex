-- ============================================================================
-- APEX · demo user seed
-- ============================================================================
-- NEXT_PUBLIC_DEMO_MODE=true bypasses auth and pins every request to the fixed
-- UUID in frontend/lib/supabase/server.ts (DEMO_USER_ID). Every user-owned row
-- carries a user_id FK to auth.users, so that row must exist or the first
-- insert into public.plans fails on plans_user_id_fkey.
--
-- Run after database/schema.sql. Idempotent. Local development only.
-- ============================================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated', 'demo@apex.app',
  crypt('apex-demo-password', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Demo Learner"}'::jsonb,
  '', '', '', ''
)
on conflict (id) do nothing;

-- handle_new_user() fires on insert, so the profile normally already exists.
-- This covers the case where the user row predates the trigger.
insert into public.profiles (id, display_name)
values ('00000000-0000-0000-0000-000000000001', 'Demo Learner')
on conflict (id) do nothing;
