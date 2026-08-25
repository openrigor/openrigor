-- V09-09: schema only. Consent writes and inference guards land in V09-10.
-- The version is copied from SHARED_MODEL_NOTICE_VERSION at acceptance time.
create table if not exists public.user_ai_consent (
  user_id uuid primary key references auth.users (id) on delete cascade,
  privacy_notice_version text,
  updated_at timestamptz not null default now()
);

alter table public.user_ai_consent enable row level security;

create policy "user_ai_consent_select_own"
  on public.user_ai_consent
  for select
  using (auth.uid() = user_id);

create policy "user_ai_consent_insert_own"
  on public.user_ai_consent
  for insert
  with check (auth.uid() = user_id);

create policy "user_ai_consent_update_own"
  on public.user_ai_consent
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update on public.user_ai_consent to authenticated;
