import { createFileRoute } from '@tanstack/react-router';
import { listPosts, popularPosts } from '@/lib/content.functions';
import { AdSlot, Pagination, PostCard, Sidebar } from '@/components/site';

export const Route = createFileRoute('/')({
  validateSearch: (s: Record<string, unknown>): { page?: number | undefined } => ({
    page: s['page'] ? Number(s['page']) || 1 : undefined,
  }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ deps }) => {
    try {
      const [list, popular] = await Promise.all([
        listPosts({ data: { page: deps.page } }),
        popularPosts(),
      ]);
      return { list, popular, offline: false };
    } catch {
      return {
        list: { posts: [], total: 0, page: deps.page, perPage: 12 },
        popular: [],
        offline: true,
      };
    }
  },
  head: () => ({
    meta: [
      { title: 'Jadwal Event, Info Pameran, Acara & Promo Terbaru' },
      {
        name: 'description',
        content:
          'Informasi jadwal event, acara, pameran, seminar, promo, bazaar, workshop, job fair, dan lomba terbaru di Indonesia.',
      },
      { property: 'og:title', content: 'Jadwal Event, Info Pameran, Acara & Promo Terbaru' },
      {
        property: 'og:description',
        content: 'Informasi jadwal event, pameran, seminar, promo, bazaar, workshop dan lomba terbaru.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: Home,
  errorComponent: () => (
    <p className="p-8 text-center text-muted-foreground">Daftar event belum bisa dimuat.</p>
  ),
});

function Home() {
  const { list, popular, offline } = Route.useLoaderData();
  const [lead, ...rest] = list.posts;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <main>
          {offline && (
            <p className="mb-5 rounded-md border border-border bg-secondary p-4 text-sm text-muted-foreground">
              Data event belum bisa ditampilkan karena koneksi ke database belum aktif.
            </p>
          )}
          <h1 className="mb-5 border-l-4 border-primary pl-3 font-display text-2xl font-bold uppercase">
            Event Terbaru
          </h1>
          {lead && (
            <div className="mb-6">
              <PostCard post={lead} big />
            </div>
          )}
          <AdSlot slot="below_title" />
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
            {rest.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
          {list.posts.length === 0 && (
            <p className="text-muted-foreground">Belum ada artikel yang tampil.</p>
          )}
          <Pagination
            page={list.page}
            total={list.total}
            perPage={list.perPage}
            hrefFor={(p) => `/?page=${p}`}
          />
        </main>
        <Sidebar popular={popular} />
      </div>
    </div>
  );
}
