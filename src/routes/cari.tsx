import { createFileRoute } from '@tanstack/react-router';
import { listPosts, popularPosts } from '@/lib/content.functions';
import { Pagination, PostCard, Sidebar } from '@/components/site';

export const Route = createFileRoute('/cari')({
  validateSearch: (s: Record<string, unknown>): { q?: string | undefined; page?: number | undefined } => ({
    q: s['q'] ? String(s['q']) : undefined,
    page: s['page'] ? Number(s['page']) || 1 : undefined,
  }),
  loaderDeps: ({ search }) => ({ q: search.q ?? '', page: search.page ?? 1 }),
  loader: async ({ deps }) => {
    try {
      const [list, popular] = await Promise.all([
        listPosts({ data: { q: deps.q, page: deps.page } }),
        popularPosts(),
      ]);
      return { list, popular, q: deps.q };
    } catch {
      return {
        list: { posts: [], total: 0, page: deps.page, perPage: 12 },
        popular: [],
        q: deps.q,
      };
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `Cari: ${loaderData?.q ?? ''} | JadwalEvent`.slice(0, 65) },
      { name: 'description', content: `Hasil pencarian event untuk "${loaderData?.q ?? ''}".` },
      { property: 'og:title', content: `Hasil pencarian: ${loaderData?.q ?? ''}` },
      { property: 'og:description', content: 'Cari jadwal event, pameran, dan promo terbaru.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: SearchPage,
  errorComponent: () => (
    <p className="p-8 text-center text-muted-foreground">Pencarian belum bisa dimuat.</p>
  ),
});

function SearchPage() {
  const { list, popular, q } = Route.useLoaderData();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <main>
          <h1 className="mb-1 font-display text-2xl font-bold">Hasil pencarian</h1>
          <p className="mb-5 text-sm text-muted-foreground">
            {list.total} artikel untuk “{q}”
          </p>
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
            {list.posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
          {list.posts.length === 0 && (
            <p className="text-muted-foreground">Tidak ada artikel yang cocok.</p>
          )}
          <Pagination
            page={list.page}
            total={list.total}
            perPage={list.perPage}
            hrefFor={(p) => `/cari?q=${encodeURIComponent(q)}&page=${p}`}
          />
        </main>
        <Sidebar popular={popular} />
      </div>
    </div>
  );
}
