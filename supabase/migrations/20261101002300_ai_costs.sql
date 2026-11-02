-- =============================================================================
-- AI cost logging and monthly caps (low-cost AI architecture, items 8–9).
--
-- Review before applying. Adds a column, a table and two function
-- overloads; nothing is deleted and the existing functions keep working.
--
--   * ai_usage.cost_microusd — the server's estimate of each request's cost
--     (millionths of a US dollar), from the token counts and the model's
--     published price. Rows hold the feature, model, token counts and cost
--     only — never prompts, answers, recipes or anything typed.
--   * ai_spend_months — running estimated spend per calendar month for the
--     whole app (server bookkeeping; nobody signed in can read or change it).
--   * reserve_ai_request(feature, daily_limit, monthly_limit, monthly_budget)
--     — as before, plus: no slot when the person has used their AI requests
--     for the month, or when the app's estimated spend this month has
--     reached the budget. The app then uses its normal (non-AI) features.
--   * finish_ai_request(…, cost) — records the cost and adds it to the month.
--
-- Fails safe: the cap can only switch AI off early, never let spend run on.
-- In-flight requests are counted when they finish, so the month can end a
-- few requests over the cap; each request's recorded cost is capped at
-- $0.10, so a tampered call can't record more than that.
-- =============================================================================

alter table public.ai_usage
  add column if not exists cost_microusd bigint not null default 0 check (cost_microusd between 0 and 100000);
create index if not exists ai_usage_user_month_idx on public.ai_usage (user_id, created_at desc);

create table public.ai_spend_months (
  month date primary key,
  cost_microusd bigint not null default 0 check (cost_microusd >= 0),
  requests integer not null default 0 check (requests >= 0),
  updated_at timestamptz not null default now()
);
alter table public.ai_spend_months enable row level security;
revoke all on public.ai_spend_months from anon, authenticated;

create or replace function public.reserve_ai_request(feature_name text, daily_limit integer, monthly_limit integer, monthly_budget_microusd bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  month_start timestamptz := date_trunc('month', now());
  spent bigint;
  used integer;
begin
  if uid is null then
    raise exception 'Please sign in again.' using errcode = 'insufficient_privilege';
  end if;
  -- The app's spending cap for this month.
  if monthly_budget_microusd is not null then
    select coalesce(sum(cost_microusd), 0) into spent from public.ai_spend_months where month = month_start::date;
    if spent >= greatest(monthly_budget_microusd, 0) then
      return null;
    end if;
  end if;
  -- This person's AI requests this month, all features together.
  if monthly_limit is not null then
    perform pg_advisory_xact_lock(hashtextextended('ai_usage_month:' || uid::text, 0));
    select count(*)::integer into used from public.ai_usage
    where user_id = uid and created_at >= month_start and outcome in ('ok', 'fallback', 'reserved');
    if used >= greatest(monthly_limit, 0) then
      return null;
    end if;
  end if;
  -- Then the per-feature daily limits, exactly as before.
  return public.reserve_ai_request(feature_name, daily_limit);
end;
$$;
revoke all on function public.reserve_ai_request(text, integer, integer, bigint) from public, anon;
grant execute on function public.reserve_ai_request(text, integer, integer, bigint) to authenticated;

create or replace function public.finish_ai_request(request_id uuid, final_outcome text, model_name text, tokens_in integer, tokens_out integer, cost_microusd bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cost bigint := least(greatest(coalesce(cost_microusd, 0), 0), 100000);
  changed integer;
begin
  if final_outcome not in ('ok', 'fallback', 'cached', 'unused') then
    raise exception 'Unknown outcome' using errcode = 'check_violation';
  end if;
  update public.ai_usage u
  set outcome = final_outcome,
      model = left(model_name, 80),
      input_tokens = least(greatest(coalesce(tokens_in, 0), 0), 10000000),
      output_tokens = least(greatest(coalesce(tokens_out, 0), 0), 10000000),
      cost_microusd = case when final_outcome in ('ok', 'fallback') then cost else 0 end
  where u.id = request_id and u.user_id = (select auth.uid()) and u.outcome = 'reserved';
  get diagnostics changed = row_count;
  if changed = 1 and final_outcome in ('ok', 'fallback') then
    insert into public.ai_spend_months as m (month, cost_microusd, requests)
    values (date_trunc('month', now())::date, cost, 1)
    on conflict (month) do update set cost_microusd = m.cost_microusd + excluded.cost_microusd, requests = m.requests + 1, updated_at = now();
  end if;
end;
$$;
revoke all on function public.finish_ai_request(uuid, text, text, integer, integer, bigint) from public, anon;
grant execute on function public.finish_ai_request(uuid, text, text, integer, integer, bigint) to authenticated;

-- The scheduled weekly-drafts job runs as the server (service role), not a
-- signed-in person: it reads the month's spend and adds its own requests here.
create or replace function public.ai_month_spend(add_microusd bigint default 0)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  total bigint;
  add bigint := least(greatest(coalesce(add_microusd, 0), 0), 100000);
begin
  if not public.cart_is_server() then
    raise exception 'Only the server can read AI spend' using errcode = 'insufficient_privilege';
  end if;
  if add > 0 then
    insert into public.ai_spend_months as m (month, cost_microusd, requests)
    values (date_trunc('month', now())::date, add, 1)
    on conflict (month) do update set cost_microusd = m.cost_microusd + excluded.cost_microusd, requests = m.requests + 1, updated_at = now();
  end if;
  select coalesce(sum(cost_microusd), 0) into total from public.ai_spend_months where month = date_trunc('month', now())::date;
  return total;
end;
$$;
revoke all on function public.ai_month_spend(bigint) from public, anon, authenticated;
grant execute on function public.ai_month_spend(bigint) to service_role;
