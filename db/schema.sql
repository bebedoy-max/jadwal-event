-- =====================================================================
-- Jadwal Event — skema database untuk Supabase self-hosted (Coolify)
-- Jalankan seluruh isi file ini satu kali di Supabase Studio > SQL Editor.
-- Aman dijalankan ulang (idempotent).
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------- Roles -----------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'editor', 'user');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  unique (user_id, role)
);

grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

do $$ begin
  create policy "own roles readable" on public.user_roles
    for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- ---------- Kategori & tag -------------------------------------------
create table if not exists public.categories (
  id bigint primary key,
  name text not null,
  slug text not null unique,
  description text default '',
  parent_id bigint,
  post_count integer not null default 0
);

create table if not exists public.tags (
  id bigint primary key,
  name text not null,
  slug text not null unique,
  post_count integer not null default 0
);

-- ---------- Artikel ---------------------------------------------------
create table if not exists public.posts (
  id bigint primary key,
  slug text not null unique,
  title text not null,
  content text not null default '',
  excerpt text not null default '',
  status text not null default 'publish',
  post_type text not null default 'post',
  author_name text not null default 'Admin',
  featured_image text,
  view_count integer not null default 0,
  comment_count integer not null default 0,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posts_published_idx on public.posts (status, published_at desc);
create index if not exists posts_type_idx on public.posts (post_type);
create index if not exists posts_title_trgm_idx on public.posts using gin (title gin_trgm_ops);

alter table public.posts add column if not exists search_tsv tsvector
  generated always as (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(excerpt,''))) stored;
create index if not exists posts_search_idx on public.posts using gin (search_tsv);

create table if not exists public.post_categories (
  post_id bigint not null references public.posts(id) on delete cascade,
  category_id bigint not null references public.categories(id) on delete cascade,
  primary key (post_id, category_id)
);
create index if not exists post_categories_cat_idx on public.post_categories (category_id);

create table if not exists public.post_tags (
  post_id bigint not null references public.posts(id) on delete cascade,
  tag_id bigint not null references public.tags(id) on delete cascade,
  primary key (post_id, tag_id)
);
create index if not exists post_tags_tag_idx on public.post_tags (tag_id);

-- ---------- Komentar --------------------------------------------------
create table if not exists public.comments (
  id bigserial primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  parent_id bigint,
  author_name text not null,
  author_email text,
  content text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists comments_post_idx on public.comments (post_id, status);

-- ---------- Slot iklan & pengaturan ----------------------------------
create table if not exists public.ad_slots (
  slot text primary key,
  label text not null,
  code text not null default '',
  enabled boolean not null default true
);

create table if not exists public.site_settings (
  key text primary key,
  value text not null default ''
);

-- ---------- Hak akses Data API ---------------------------------------
grant select on public.posts, public.categories, public.tags,
  public.post_categories, public.post_tags, public.comments,
  public.ad_slots, public.site_settings to anon, authenticated;
grant insert on public.comments to anon, authenticated;
grant usage, select on sequence public.comments_id_seq to anon, authenticated;
grant all on public.posts, public.categories, public.tags,
  public.post_categories, public.post_tags, public.comments,
  public.ad_slots, public.site_settings to service_role;

alter table public.posts enable row level security;
alter table public.categories enable row level security;
alter table public.tags enable row level security;
alter table public.post_categories enable row level security;
alter table public.post_tags enable row level security;
alter table public.comments enable row level security;
alter table public.ad_slots enable row level security;
alter table public.site_settings enable row level security;

do $$ begin
  create policy "published posts public" on public.posts
    for select to anon, authenticated using (status = 'publish');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "categories public" on public.categories for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "tags public" on public.tags for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "post_categories public" on public.post_categories for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "post_tags public" on public.post_tags for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "approved comments public" on public.comments
    for select to anon, authenticated using (status = 'approved');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "anyone can submit a comment" on public.comments
    for insert to anon, authenticated with check (status = 'pending');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "enabled ads public" on public.ad_slots
    for select to anon, authenticated using (enabled = true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "settings public" on public.site_settings for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;

-- Slot iklan bawaan (kode dapat diisi lewat panel admin)
insert into public.ad_slots (slot, label) values
  ('header',        'Iklan bawah header'),
  ('below_title',   'Iklan bawah judul artikel'),
  ('in_article',    'Iklan tengah artikel'),
  ('below_article', 'Iklan bawah artikel'),
  ('sidebar',       'Iklan sidebar'),
  ('footer',        'Iklan footer')
on conflict (slot) do nothing;

insert into public.site_settings (key, value) values
  ('site_title', 'Jadwal Event, Info Pameran, Acara & Promo Terbaru'),
  ('site_description', 'Informasi Jadwal, Event, Acara, Pameran, Seminar, Promo, Bazaar, Workshop, Job Fair, Lomba dll.')
on conflict (key) do nothing;

-- ---------- Google Drive sebagai penyimpanan media ---------------------
create table if not exists public.gdrive_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null default 'Google Drive',
  email text,
  client_id text not null default '',
  client_secret text not null default '',
  refresh_token text,
  root_folder_name text not null default 'Media Situs',
  root_folder_id text,
  is_active boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id bigserial primary key,
  path text not null unique,
  drive_file_id text not null,
  account_id uuid not null references public.gdrive_accounts(id) on delete cascade,
  mime text not null default 'application/octet-stream',
  size bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists media_assets_account_idx on public.media_assets (account_id);

-- Hanya service_role (server) yang boleh membaca/menulis: berisi kredensial.
revoke all on public.gdrive_accounts from anon, authenticated;
revoke all on public.media_assets from anon, authenticated;
grant all on public.gdrive_accounts to service_role;
grant all on public.media_assets to service_role;
grant usage, select on sequence public.media_assets_id_seq to service_role;
alter table public.gdrive_accounts enable row level security;
alter table public.media_assets enable row level security;

-- =====================================================================
-- Akun pengguna: profil, paket langganan, pengajuan, dan suka artikel
-- Jalankan blok ini di Supabase Studio > SQL Editor (aman diulang).
-- =====================================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  full_name text not null default '',
  whatsapp text not null default '',
  city text not null default '',
  website text not null default '',
  bio text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

do $$ begin
  create policy "own profile readable" on public.profiles
    for select to authenticated using (auth.uid() = id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own profile updatable" on public.profiles
    for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
exception when duplicate_object then null; end $$;

-- Profil dibuat otomatis saat pendaftaran user baru.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Paket langganan / iklan ----------------------------------
create table if not exists public.plans (
  id text primary key,
  name text not null,
  price bigint not null default 0,
  currency text not null default 'IDR',
  days integer not null default 30,
  description text not null default '',
  features text not null default '',
  sort integer not null default 0,
  active boolean not null default true
);

grant select on public.plans to anon, authenticated;
grant all on public.plans to service_role;
alter table public.plans enable row level security;
do $$ begin
  create policy "plans public" on public.plans
    for select to anon, authenticated using (active = true);
exception when duplicate_object then null; end $$;

insert into public.plans (id, name, price, days, description, features, sort) values
  ('free',      'Gratis',        0,      3650, 'Akses dasar: baca, komentar, suka, dan bagikan.', 'Komentar|Suka & bagikan|Simpan profil', 1),
  ('pro',       'Pro Bulanan',   99000,  30,   'Fitur pro untuk penyelenggara event.', 'Tanpa iklan|Submit event prioritas|Badge Pro', 2),
  ('pro_year',  'Pro Tahunan',   990000, 365,  'Hemat 2 bulan dibanding bulanan.', 'Semua fitur Pro|Prioritas dukungan', 3),
  ('ads_basic', 'Iklan Banner',  500000, 30,   'Banner Anda tampil di slot sidebar selama 30 hari.', 'Slot sidebar|Laporan tayangan', 4),
  ('advertorial','Advertorial',  750000, 3650, 'Artikel advertorial permanen beserta tautan.', 'Artikel khusus|Backlink|Bagikan ke media sosial', 5)
on conflict (id) do nothing;

-- ---------- Langganan aktif per user --------------------------------
create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null default 'free' references public.plans(id),
  status text not null default 'active',
  started_at timestamptz not null default now(),
  expires_at timestamptz
);

grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;
do $$ begin
  create policy "own subscription readable" on public.subscriptions
    for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ---------- Pengajuan paket / pembelian iklan -----------------------
create table if not exists public.plan_orders (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null references public.plans(id),
  amount bigint not null default 0,
  contact text not null default '',
  note text not null default '',
  status text not null default 'pending',
  admin_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists plan_orders_user_idx on public.plan_orders (user_id, created_at desc);
create index if not exists plan_orders_status_idx on public.plan_orders (status, created_at desc);

grant select, insert on public.plan_orders to authenticated;
grant usage, select on sequence public.plan_orders_id_seq to authenticated;
grant all on public.plan_orders to service_role;
alter table public.plan_orders enable row level security;
do $$ begin
  create policy "own orders readable" on public.plan_orders
    for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own orders insertable" on public.plan_orders
    for insert to authenticated with check (auth.uid() = user_id and status = 'pending');
exception when duplicate_object then null; end $$;

-- ---------- Suka artikel --------------------------------------------
create table if not exists public.post_likes (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_post_idx on public.post_likes (post_id);

grant select, insert, delete on public.post_likes to authenticated;
grant select on public.post_likes to anon;
grant all on public.post_likes to service_role;
alter table public.post_likes enable row level security;
do $$ begin
  create policy "likes public" on public.post_likes
    for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own like insertable" on public.post_likes
    for insert to authenticated with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "own like deletable" on public.post_likes
    for delete to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ---------- Komentar milik user terdaftar ---------------------------
alter table public.comments add column if not exists user_id uuid references auth.users(id) on delete set null;

-- =====================================================================
-- Pembayaran: konfigurasi payment gateway + transaksi
-- Jalankan di Supabase Studio > SQL Editor (aman diulang).
-- =====================================================================

create table if not exists public.payment_gateways (
  id text primary key,                       -- aapay | midtrans | doku | ...
  name text not null,
  enabled boolean not null default false,
  is_default boolean not null default false,
  mode text not null default 'live',         -- live | sandbox
  base_url text not null default '',
  config jsonb not null default '{}'::jsonb, -- api_key, api_secret, webhook_secret, dll
  updated_at timestamptz not null default now()
);

-- Berisi kredensial: hanya server (service_role) yang boleh mengakses.
revoke all on public.payment_gateways from anon, authenticated;
grant all on public.payment_gateways to service_role;
alter table public.payment_gateways enable row level security;

insert into public.payment_gateways (id, name, base_url, is_default) values
  ('aapay',    'AAPay (QRIS)', 'https://aapay.web.id/api/public/v1', true),
  ('midtrans', 'Midtrans',     'https://api.midtrans.com/v2',        false),
  ('doku',     'DOKU',         'https://api.doku.com',               false)
on conflict (id) do nothing;

create table if not exists public.payments (
  id bigserial primary key,
  order_id bigint references public.plan_orders(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  gateway text not null default 'aapay',
  provider_order_id text,
  external_ref text,
  amount bigint not null default 0,
  final_amount bigint not null default 0,
  unique_code integer,
  status text not null default 'pending',   -- pending|paid|expired|cancelled|failed
  qris_string text,
  expired_at timestamptz,
  paid_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create index if not exists payments_provider_idx on public.payments (provider_order_id);
create index if not exists payments_order_idx on public.payments (order_id);

grant select on public.payments to authenticated;
grant all on public.payments to service_role;
grant usage, select on sequence public.payments_id_seq to service_role;
alter table public.payments enable row level security;
do $$ begin
  create policy "own payments readable" on public.payments
    for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
