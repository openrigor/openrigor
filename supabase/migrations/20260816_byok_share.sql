-- BYOK sharing: owner-controlled grants on the encrypted per-user settings row.
alter table public.user_byok_settings
  add column if not exists share_mode text not null default 'none'
    check (share_mode in ('none', 'all_assignments', 'specific_items'));

alter table public.user_byok_settings
  add column if not exists shared_item_ids text[] not null default '{}';
