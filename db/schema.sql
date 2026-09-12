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
