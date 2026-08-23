-- Atomic BYOK assignment-share append: locks the owner's settings row so
-- concurrent launches/revocations cannot drop each other's grants.
create or replace function public.byok_append_share(
  p_user_id uuid,
  p_item_id uuid
) returns void
language plpgsql
as $$
declare
  r record;
begin
  if p_user_id is distinct from auth.uid() then
    raise exception 'byok_append_share: caller may only update their own settings';
  end if;

  select * into r
  from public.user_byok_settings
  where user_id = p_user_id
  for update;

  if not found or not r.enabled then
    return;
  end if;
  if r.share_mode = 'all_assignments' then
    return;
  end if;

  update public.user_byok_settings
  set share_mode = 'specific_items',
      shared_item_ids = (
        select array_agg(distinct x order by x)
        from unnest(
          case
            when r.shared_item_ids is null or cardinality(r.shared_item_ids) = 0
              then array[p_item_id]
            else r.shared_item_ids || p_item_id
          end
        ) as t(x)
      ),
      updated_at = now()
  where user_id = p_user_id;
end;
$$;

-- Server-only executor surfaces: anonymous clients must never invoke it.
-- PUBLIC has a default EXECUTE grant on new functions; revoke it and re-grant
-- explicitly to the authenticated role the session-scoped client runs as.
revoke execute on function public.byok_append_share(uuid, uuid) from public;
grant execute on function public.byok_append_share(uuid, uuid) to authenticated;
