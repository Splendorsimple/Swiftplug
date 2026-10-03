-- ============================================================
-- PATCH 001 — run ONCE in Supabase SQL Editor if you already ran the first schema.sql.
-- Fixes: (1) users could make themselves admin / give themselves money,
--        (2) buyers could read your buy_cost, (3) money functions callable from the browser,
--        (4) double-crediting of Paystack payments, (5) adds wallet history + SMS dedupe.
-- Safe to re-run.
-- ============================================================

-- (1) no self-update of profiles
drop policy if exists "profiles_update_own" on profiles;

-- (2) pricing = admin only; buyers use the catalog view
drop policy if exists "pricing_select_active" on pricing;
create or replace view catalog as
select id, country_id, service_id, number_type, sell_price, plan_duration,
       max_quantity_per_purchase, is_active
from pricing where is_active = true;
grant select on catalog to anon, authenticated;

-- public reference data (needed by the public landing page)
drop policy if exists "countries_select_all" on countries;
create policy "countries_select_all" on countries for select using (true);
drop policy if exists "services_select_active" on services;
create policy "services_select_active" on services for select using (is_active);
drop policy if exists "discounts_select_active" on discounts;
create policy "discounts_select_active" on discounts for select using (is_active);

-- (5) ledger + SMS dedupe
create table if not exists wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount numeric not null,
  type text not null check (type in ('topup','purchase','refund','renewal','adjustment')),
  reference text unique,
  note text,
  created_at timestamptz default now()
);
alter table wallet_transactions enable row level security;
drop policy if exists "wallet_tx_own_or_admin" on wallet_transactions;
create policy "wallet_tx_own_or_admin" on wallet_transactions for select
  using (auth.uid() = user_id or is_admin());

alter table messages add column if not exists external_id text;
do $$ begin
  alter table messages add constraint messages_number_ext_uniq unique (number_id, external_id);
exception when duplicate_object then null; end $$;

-- (3)+(4) replace the old money functions (drop old signatures first to avoid ambiguity)
drop function if exists increment_wallet(uuid, numeric);
drop function if exists decrement_wallet(uuid, numeric);

create or replace function credit_wallet_once(uid uuid, amt numeric, ref text)
returns boolean as $$
declare inserted_id uuid;
begin
  insert into wallet_transactions (user_id, amount, type, reference, note)
  values (uid, amt, 'topup', ref, 'Paystack top-up')
  on conflict (reference) do nothing
  returning id into inserted_id;
  if inserted_id is null then return false; end if;
  update profiles set wallet_balance = wallet_balance + amt where id = uid;
  return true;
end;
$$ language plpgsql;

create or replace function increment_wallet(uid uuid, amt numeric, note text default null, tx_type text default 'refund')
returns void as $$
begin
  update profiles set wallet_balance = wallet_balance + amt where id = uid;
  insert into wallet_transactions (user_id, amount, type, note) values (uid, amt, tx_type, note);
end;
$$ language plpgsql;

create or replace function decrement_wallet(uid uuid, amt numeric, note text default null, tx_type text default 'purchase')
returns boolean as $$
declare current_balance numeric;
begin
  select wallet_balance into current_balance from profiles where id = uid for update;
  if current_balance is null or current_balance < amt then return false; end if;
  update profiles set wallet_balance = wallet_balance - amt where id = uid;
  insert into wallet_transactions (user_id, amount, type, note) values (uid, -amt, tx_type, note);
  return true;
end;
$$ language plpgsql;

revoke execute on function credit_wallet_once(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function increment_wallet(uuid, numeric, text, text) from public, anon, authenticated;
revoke execute on function decrement_wallet(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function credit_wallet_once(uuid, numeric, text) to service_role;
grant execute on function increment_wallet(uuid, numeric, text, text) to service_role;
grant execute on function decrement_wallet(uuid, numeric, text, text) to service_role;
