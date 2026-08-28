-- V09-09/V09-10: the per-user mode authorization record. BYOK provider keys
-- remain in user_byok_settings; this table stores only mode and consent state.
-- The version is copied from SHARED_MODEL_NOTICE_VERSION at acceptance time.
create table if not exists public.user_ai_consent (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mode text check (mode is null or mode in ('byok', 'shared_model', 'markdown_only')),
  privacy_notice_version text,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

-- V09-09 may already have been applied with only privacy_notice_version. Keep
-- this migration safe for that database while extending the same table.
alter table public.user_ai_consent
  add column if not exists mode text;
alter table public.user_ai_consent
  add column if not exists revoked_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_ai_consent_mode_check'
      and conrelid = 'public.user_ai_consent'::regclass
  ) then
    alter table public.user_ai_consent
      add constraint user_ai_consent_mode_check
      check (mode is null or mode in ('byok', 'shared_model', 'markdown_only'));
  end if;
end $$;

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
