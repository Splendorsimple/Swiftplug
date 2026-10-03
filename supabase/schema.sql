-- ============================================================
-- SwiftPlug full database schema
-- Currency: NGN (Naira) throughout, to match Paystack's default settlement currency.
-- Admin access is role-based (profiles.role = 'admin') — NEVER hardcode an email anywhere.
-- ============================================================

-- Profiles: one row per auth user, auto-created on signup via trigger below.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user','admin')),
  wallet_balance numeric not null default 0,
  is_suspended boolean not null default false,
  created_at timestamptz default now()
);

-- Auto-create a profile row whenever someone signs up (email/password or Google).
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Countries reference table — powers autocomplete everywhere.
create table if not exists countries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  iso_code text not null,
  phone_code text not null,
  flag_emoji text
);

-- Services catalog (WhatsApp, Telegram, etc.)
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon_url text,
  is_active boolean default true
);

-- Providers (admin adds manually, never in code)
create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('disposable','real')),
  base_url text not null,
  api_key_encrypted text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Pricing — one row per country + service + number_type combo. All amounts in NGN.
create table if not exists pricing (
  id uuid primary key default gen_random_uuid(),
  country_id uuid references countries(id),
  service_id uuid references services(id),
  number_type text not null check (number_type in ('disposable','real')),
  buy_cost numeric not null,
  sell_price numeric not null,
  plan_duration text,
  max_quantity_per_purchase integer default 10,
  provider_id uuid references providers(id),
  is_active boolean default true
);

-- Bulk discount tiers
create table if not exists discounts (
  id uuid primary key default gen_random_uuid(),
  min_quantity integer not null,
  discount_type text not null check (discount_type in ('percentage','flat')),
  discount_value numeric not null,
  applies_to text not null check (applies_to in ('disposable','real','both')),
  is_active boolean default true
);

-- Numbers — each provisioned number, disposable or real.
create table if not exists numbers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  provider_id uuid references providers(id),
  pricing_id uuid references pricing(id),
  phone_number text not null,
  number_type text not null check (number_type in ('disposable','real')),
  status text not null check (status in ('active','expired','released')) default 'active',
  expires_at timestamptz,
  external_id text,
  created_at timestamptz default now()
);

-- SMS inbox
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  number_id uuid references numbers(id) on delete cascade,
  from_number text,
  body text,
  received_at timestamptz default now()
);

-- Call logs (real numbers)
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  number_id uuid references numbers(id) on delete cascade,
  from_number text,
  duration_seconds integer,
  received_at timestamptz default now()
);

-- Rate limiting: tracks purchase counts to enforce tiered hourly caps.
create table if not exists purchase_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  number_type text not null,
  quantity integer not null,
  created_at timestamptz default now()
);

-- Rate limit settings, admin-editable.
create table if not exists rate_limit_settings (
  id integer primary key default 1,
  new_account_hourly_limit integer not null default 5,
  established_account_hourly_limit integer not null default 20,
  new_account_window_hours integer not null default 48,
  constraint single_row check (id = 1)
);
insert into rate_limit_settings (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY — enabled on every table, nothing exposed by default.
-- ============================================================

alter table profiles enable row level security;
alter table countries enable row level security;
alter table services enable row level security;
alter table providers enable row level security;
alter table pricing enable row level security;
alter table discounts enable row level security;
alter table numbers enable row level security;
alter table messages enable row level security;
alter table calls enable row level security;
alter table purchase_log enable row level security;
alter table rate_limit_settings enable row level security;

-- Helper: is the current user an admin? (checked via profiles.role, never an email)
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- profiles: users see/update only their own row; admins see/update all.
create policy "profiles_select_own_or_admin" on profiles for select
  using (auth.uid() = id or is_admin());
-- NOTE: there is deliberately NO "update own profile" policy. A user who could update their own row
-- could set role='admin' or give themselves wallet balance. Only admins (and server functions) may write profiles.
create policy "profiles_admin_update_any" on profiles for update
  using (is_admin());

-- countries, services: readable by any authenticated user (needed for catalog/autocomplete),
-- writable only by admins.
create policy "countries_select_all" on countries for select using (true);
create policy "countries_admin_write" on countries for all using (is_admin());

create policy "services_select_active" on services for select using (is_active);
create policy "services_admin_write" on services for all using (is_admin());

-- pricing is ADMIN ONLY (contains your buy_cost). Buyers read the safe "catalog" view defined below.
create policy "pricing_admin_write" on pricing for all using (is_admin());

create policy "discounts_select_active" on discounts for select using (is_active);
create policy "discounts_admin_write" on discounts for all using (is_admin());

-- providers: ADMIN ONLY, full stop — contains API keys, never readable by regular users.
create policy "providers_admin_only" on providers for all using (is_admin());

-- numbers/messages/calls: users see only their own; admins see all.
create policy "numbers_own_or_admin" on numbers for select using (auth.uid() = user_id or is_admin());
create policy "numbers_admin_write" on numbers for all using (is_admin());

create policy "messages_own_or_admin" on messages for select using (
  exists (select 1 from numbers where numbers.id = messages.number_id and (numbers.user_id = auth.uid() or is_admin()))
);
create policy "messages_admin_write" on messages for all using (is_admin());

create policy "calls_own_or_admin" on calls for select using (
  exists (select 1 from numbers where numbers.id = calls.number_id and (numbers.user_id = auth.uid() or is_admin()))
);
create policy "calls_admin_write" on calls for all using (is_admin());

create policy "purchase_log_own_or_admin" on purchase_log for select using (auth.uid() = user_id or is_admin());
create policy "purchase_log_admin_write" on purchase_log for all using (is_admin());

create policy "rate_limit_settings_select_all" on rate_limit_settings for select using (auth.role() = 'authenticated');
create policy "rate_limit_settings_admin_write" on rate_limit_settings for all using (is_admin());

-- ============================================================
-- Public catalog view: what buyers may see (sell price only — never buy_cost).
-- ============================================================
create or replace view catalog as
select id, country_id, service_id, number_type, sell_price, plan_duration,
       max_quantity_per_purchase, is_active
from pricing
where is_active = true;
grant select on catalog to anon, authenticated;

-- ============================================================
-- Wallet ledger + money functions
-- ============================================================
create table if not exists wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount numeric not null,               -- positive = credit, negative = debit
  type text not null check (type in ('topup','purchase','refund','renewal','adjustment')),
  reference text unique,                 -- Paystack reference: the idempotency key for top-ups
  note text,
  created_at timestamptz default now()
);
alter table wallet_transactions enable row level security;
create policy "wallet_tx_own_or_admin" on wallet_transactions for select
  using (auth.uid() = user_id or is_admin());

-- SMS dedupe: one row per provider message per number.
alter table messages add column if not exists external_id text;
do $$ begin
  alter table messages add constraint messages_number_ext_uniq unique (number_id, external_id);
exception when duplicate_object then null; end $$;

-- Credit a Paystack top-up EXACTLY ONCE, even if both the browser verify call and the webhook fire.
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

-- CRITICAL: by default every function in "public" can be called from the browser by any logged-in user.
-- That would let anyone mint themselves wallet money. Lock the money functions to the server (service_role) only.
revoke execute on function credit_wallet_once(uuid, numeric, text) from public, anon, authenticated;
revoke execute on function increment_wallet(uuid, numeric, text, text) from public, anon, authenticated;
revoke execute on function decrement_wallet(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function credit_wallet_once(uuid, numeric, text) to service_role;
grant execute on function increment_wallet(uuid, numeric, text, text) to service_role;
grant execute on function decrement_wallet(uuid, numeric, text, text) to service_role;

-- ============================================================
-- HOW TO PROMOTE YOUR FIRST ADMIN (run once, manually, after you sign up):
--
--   update profiles set role = 'admin' where email = 'your-actual-email@example.com';
--
-- After that, use the Users Manager in the admin dashboard to promote/demote anyone else.
-- ============================================================
