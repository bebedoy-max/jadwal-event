import { createFileRoute } from '@tanstack/react-router';
import { listPosts, popularPosts } from '@/lib/content.functions';
import { Pagination, PostCard, Sidebar } from '@/components/site';

export const Route = createFileRoute('/tag/$slug')({
  validateSearch: (s: Record<string, unknown>): { page?: number | undefined } => ({
    page: s['page'] ? Number(s['page']) || 1 : undefined,
  }),
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: async ({ params, deps }) => {
    try {
      const [list, popular] = await Promise.all([
        listPosts({ data: { tag: params.slug, page: deps.page } }),
        popularPosts(),
      ]);
      return { list, popular, slug: params.slug };
    } catch {
      return {
        list: { posts: [], total: 0, page: deps.page, perPage: 12, tag: null },
        popular: [],
        slug: params.slug,
      };
    }
  },
  head: ({ loaderData }) => {
    const name = loaderData?.list.tag?.name ?? loaderData?.slug ?? 'Tag';
    const desc = `Artikel dan jadwal event dengan tag ${name}.`;
    return {
      meta: [
        { title: `Tag: ${name} | JadwalEvent`.slice(0, 65) },
        { name: 'description', content: desc },
        { property: 'og:title', content: `Tag: ${name}` },
        { property: 'og:description', content: desc },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
    };
  },
  component: TagPage,
  errorComponent: () => (
    <p className="p-8 text-center text-muted-foreground">Tag belum bisa dimuat.</p>
  ),
});

function TagPage() {
  const { list, popular, slug } = Route.useLoaderData();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <main>
          <h1 className="mb-5 border-l-4 border-primary pl-3 font-display text-2xl font-bold uppercase">
            #{list.tag?.name ?? slug}
          </h1>
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
            {list.posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
          {list.posts.length === 0 && (
            <p className="text-muted-foreground">Belum ada artikel dengan tag ini.</p>
          )}
          <Pagination
            page={list.page}
            total={list.total}
            perPage={list.perPage}
            hrefFor={(p) => `/tag/${slug}?page=${p}`}
          />
        </main>
        <Sidebar popular={popular} />
      </div>
    </div>
  );
}
