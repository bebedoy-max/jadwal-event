import { Link } from '@tanstack/react-router';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Category, PostCard as PostCardType } from '@/lib/content.functions';

export type SiteData = {
  categories: Category[];
  ads: { slot: string; code: string }[];
  title: string;
  description: string;
};

const SiteCtx = createContext<SiteData>({ categories: [], ads: [], title: '', description: '' });
export const SiteDataProvider = SiteCtx.Provider;
export const useSiteData = () => useContext(SiteCtx);

/* --------------------------------- Iklan -------------------------------- */
export function AdSlot({ slot, className = '' }: { slot: string; className?: string }) {
  const { ads } = useSiteData();
  const code = ads.find((a) => a.slot === slot)?.code?.trim();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !code) return;
    el.innerHTML = code;
    el.querySelectorAll('script').forEach((old) => {
      const s = document.createElement('script');
      for (const attr of Array.from(old.attributes)) s.setAttribute(attr.name, attr.value);
      s.text = old.text;
      old.replaceWith(s);
    });
  }, [code]);

  if (!code) return null;
  return <div ref={ref} className={`my-5 flex justify-center overflow-hidden ${className}`} />;
}

/* -------------------------------- Header -------------------------------- */
export function Header() {
  const { categories, title } = useSiteData();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const top = categories.slice(0, 8);

  return (
    <header className="border-b border-border bg-card">
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-1.5 text-xs">
          <span className="truncate">Informasi jadwal event, pameran, promo & lomba se-Indonesia</span>
          <Link to="/admin" className="hidden shrink-0 opacity-90 hover:opacity-100 sm:block">
            Masuk Admin
          </Link>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-5">
        <Link to="/" className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Jadwal<span className="text-primary">Event</span>
        </Link>
        <p className="hidden flex-1 text-sm text-muted-foreground lg:block">{title}</p>
        <form
          className="ml-auto flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) window.location.href = `/cari?q=${encodeURIComponent(q.trim())}`;
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari event…"
            aria-label="Cari event"
            className="w-40 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-primary sm:w-56"
          />
          <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
            Cari
          </button>
        </form>
      </div>

      <nav className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-4">
          <Link
            to="/"
            className="whitespace-nowrap px-3 py-2.5 text-sm font-semibold uppercase tracking-wide hover:text-primary"
          >
            Beranda
          </Link>
          {(open ? categories : top).map((c) => (
            <Link
              key={c.id}
              to="/kategori/$slug"
              params={{ slug: c.slug }}
              className="whitespace-nowrap px-3 py-2.5 text-sm font-semibold uppercase tracking-wide hover:text-primary"
            >
              {c.name}
            </Link>
          ))}
          {categories.length > top.length && (
            <button
              onClick={() => setOpen((v) => !v)}
              className="whitespace-nowrap px-3 py-2.5 text-sm font-semibold uppercase tracking-wide text-primary"
            >
              {open ? 'Sembunyikan' : 'Lainnya'}
            </button>
          )}
        </div>
      </nav>
      <AdSlot slot="header" />
    </header>
  );
}

/* -------------------------------- Footer -------------------------------- */
export function Footer() {
  const { categories, description } = useSiteData();
  return (
    <footer className="mt-12 border-t border-border bg-card">
      <AdSlot slot="footer" />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <div className="font-display text-xl font-bold">
            Jadwal<span className="text-primary">Event</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wide">Kategori Populer</h4>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            {categories.slice(0, 6).map((c) => (
              <li key={c.id}>
                <Link to="/kategori/$slug" params={{ slug: c.slug }} className="hover:text-primary">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="mb-3 text-sm font-bold uppercase tracking-wide">Tautan</h4>
          <ul className="space-y-1.5 text-sm text-muted-foreground">
            <li>
              <Link to="/" className="hover:text-primary">Beranda</Link>
            </li>
            <li>
              <Link to="/admin" className="hover:text-primary">Panel Admin</Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} JadwalEvent. Seluruh hak cipta dilindungi.
      </div>
    </footer>
  );
}

/* ------------------------------ Kartu artikel ---------------------------- */
export function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export function PostCard({ post, big = false }: { post: PostCardType; big?: boolean }) {
  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-card">
      <Link to="/$slug" params={{ slug: post.slug }} className="block overflow-hidden">
        <div className={`bg-muted ${big ? 'aspect-[16/9]' : 'aspect-[4/3]'}`}>
          {post.featured_image ? (
            <img
              src={post.featured_image}
              alt={post.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : null}
        </div>
      </Link>
      <div className="p-4">
        <Link to="/$slug" params={{ slug: post.slug }}>
          <h3
            className={`font-display font-semibold leading-snug group-hover:text-primary ${
              big ? 'text-xl sm:text-2xl' : 'text-base'
            } line-clamp-3`}
          >
            {post.title}
          </h3>
        </Link>
        <p className="mt-2 text-xs text-muted-foreground">{formatDate(post.published_at)}</p>
        {big && <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{post.excerpt}</p>}
      </div>
    </article>
  );
}

/* -------------------------------- Sidebar -------------------------------- */
export function Sidebar({ popular }: { popular: PostCardType[] }) {
  const { categories } = useSiteData();
  return (
    <aside className="space-y-8">
      <AdSlot slot="sidebar" className="my-0" />
      <section>
        <h3 className="mb-3 border-l-4 border-primary pl-2 font-display text-lg font-bold uppercase">
          Paling Dibaca
        </h3>
        <ul className="space-y-3">
          {popular.map((p) => (
            <li key={p.id} className="flex gap-3">
              <Link to="/$slug" params={{ slug: p.slug }} className="shrink-0">
                <div className="h-16 w-20 overflow-hidden rounded bg-muted">
                  {p.featured_image ? (
                    <img src={p.featured_image} alt={p.title} loading="lazy" className="h-full w-full object-cover" />
                  ) : null}
                </div>
              </Link>
              <Link
                to="/$slug"
                params={{ slug: p.slug }}
                className="line-clamp-3 text-sm font-medium hover:text-primary"
              >
                {p.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-3 border-l-4 border-primary pl-2 font-display text-lg font-bold uppercase">
          Kategori
        </h3>
        <ul className="flex flex-wrap gap-2">
          {categories.slice(0, 20).map((c) => (
            <li key={c.id}>
              <Link
                to="/kategori/$slug"
                params={{ slug: c.slug }}
                className="inline-block rounded-full border border-border px-3 py-1 text-xs hover:border-primary hover:text-primary"
              >
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

/* ------------------------------- Paginasi -------------------------------- */
export function Pagination({
  page,
  total,
  perPage,
  hrefFor,
}: {
  page: number;
  total: number;
  perPage: number;
  hrefFor: (p: number) => string;
}) {
  const last = Math.max(1, Math.ceil(total / perPage));
  if (last <= 1) return null;
  const nums = [] as number[];
  for (let i = Math.max(1, page - 2); i <= Math.min(last, page + 2); i++) nums.push(i);
  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-2">
      {page > 1 && (
        <a href={hrefFor(page - 1)} className="rounded border border-border px-3 py-1.5 text-sm hover:border-primary">
          ‹ Sebelumnya
        </a>
      )}
      {nums.map((n) => (
        <a
          key={n}
          href={hrefFor(n)}
          className={`rounded px-3 py-1.5 text-sm ${
            n === page ? 'bg-primary text-primary-foreground' : 'border border-border hover:border-primary'
          }`}
        >
          {n}
        </a>
      ))}
      {page < last && (
        <a href={hrefFor(page + 1)} className="rounded border border-border px-3 py-1.5 text-sm hover:border-primary">
          Berikutnya ›
        </a>
      )}
    </nav>
  );
}
