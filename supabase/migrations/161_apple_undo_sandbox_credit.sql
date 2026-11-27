begin;

create table if not exists public.splove_apple_undo_sandbox_transactions (
  transaction_id text primary key
);

alter table public.splove_apple_undo_sandbox_transactions
  enable row level security;

revoke all on table public.splove_apple_undo_sandbox_transactions
from public, anon, authenticated;

create or replace function public.splove_grant_apple_undo_sandbox(
  p_user_id uuid,
  p_transaction_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_transaction_id text := nullif(btrim(p_transaction_id), '');
  v_previous_credits integer;
  v_new_credits integer;
begin
  if p_user_id is null or v_transaction_id is null then
    raise exception 'missing_apple_purchase_fields';
  end if;

  insert into public.splove_apple_undo_sandbox_transactions (transaction_id)
  values (v_transaction_id)
  on conflict (transaction_id) do nothing;

  if not found then
    return false;
  end if;

  select coalesce(p.undo_swipe_credits, 0)
  into v_previous_credits
  from public.profiles p
  where p.id = p_user_id
  for update;

  if not found then
    raise exception 'undo_profile_missing';
  end if;

  update public.profiles
  set undo_swipe_credits = v_previous_credits + 1
  where id = p_user_id
  returning undo_swipe_credits into v_new_credits;

  if v_new_credits is distinct from v_previous_credits + 1 then
    raise exception 'undo_credit_not_applied';
  end if;

  return true;
end;
$function$;

revoke execute on function public.splove_grant_apple_undo_sandbox(uuid, text)
from public, anon, authenticated;

grant execute on function public.splove_grant_apple_undo_sandbox(uuid, text)
to service_role;

commit;
