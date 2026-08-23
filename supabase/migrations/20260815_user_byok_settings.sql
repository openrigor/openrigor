-- BYOK: per-user OpenAI-compatible provider settings (encrypted API key at rest).
create table if not exists public.user_byok_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  base_url text not null,
  model text not null,
  api_key_enc text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_byok_settings enable row level security;

create policy "user_byok_settings_select_own"
  on public.user_byok_settings
  for select
  using (auth.uid() = user_id);

create policy "user_byok_settings_insert_own"
  on public.user_byok_settings
  for insert
  with check (auth.uid() = user_id);

create policy "user_byok_settings_update_own"
  on public.user_byok_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_byok_settings_delete_own"
  on public.user_byok_settings
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_byok_settings to authenticated;
