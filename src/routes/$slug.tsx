import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { getPost, popularPosts, submitComment } from '@/lib/content.functions';
import { getLikes, toggleLike } from '@/lib/user.functions';
import { ensureUserToken, useUserSession } from '@/lib/useUserSession';
import { AdSlot, PostCard, Sidebar, formatDate } from '@/components/site';
import { abs } from '@/lib/site';

export const Route = createFileRoute('/$slug')({
  loader: async ({ params }) => {
    const [data, popular] = await Promise.all([
      getPost({ data: { slug: params.slug } }),
      popularPosts(),
    ]);
    if (!data) throw notFound();
    return { ...data, popular };
  },
  head: ({ params, loaderData }) => {
    const p = loaderData?.post;
    const url = abs(`/${params.slug}`);
    if (!p) return {};
    const desc = (p.excerpt || p.title).slice(0, 155);
    const img = p.featured_image?.startsWith('https://') ? p.featured_image : undefined;
    return {
      meta: [
        { title: `${p.title} | JadwalEvent`.slice(0, 65) },
        { name: 'description', content: desc },
        { property: 'og:title', content: p.title },
        { property: 'og:description', content: desc },
        { property: 'og:type', content: 'article' },
        { property: 'og:url', content: url },
        { name: 'twitter:card', content: 'summary_large_image' },
        ...(img
          ? [
              { property: 'og:image', content: img },
              { name: 'twitter:image', content: img },
            ]
          : []),
      ],
      links: [{ rel: 'canonical', href: url }],
      scripts: [
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Article',
                headline: p.title,
                description: desc,
                datePublished: p.published_at,
                mainEntityOfPage: url,
                ...(img ? { image: [img] } : {}),
                author: { '@type': 'Person', name: p.author_name || 'JadwalEvent' },
                publisher: { '@type': 'Organization', name: 'JadwalEvent' },
              },
              {
                '@type': 'BreadcrumbList',
                itemListElement: [
                  { '@type': 'ListItem', position: 1, name: 'Beranda', item: abs('/') },
                  { '@type': 'ListItem', position: 2, name: p.title, item: url },
                ],
              },
            ],
          }),
        },
      ],
    };
  },
  component: Article,
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl font-bold">Artikel tidak ditemukan</h1>
      <Link to="/" className="mt-4 inline-block text-primary underline">
        Kembali ke beranda
      </Link>
    </div>
  ),
  errorComponent: () => (
    <p className="p-8 text-center text-muted-foreground">Artikel belum bisa dimuat.</p>
  ),
});

function Article() {
  const { post, related, comments, popular } = Route.useLoaderData();
  const cats = post.post_categories.map((c) => c.categories).filter(Boolean);
  const tags = post.post_tags.map((t) => t.tags).filter(Boolean);

  const half = Math.floor(post.content.length / 2);
  const cut = post.content.indexOf('</p>', half);
  const [top, bottom] =
    cut > 0 ? [post.content.slice(0, cut + 4), post.content.slice(cut + 4)] : [post.content, ''];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        <main>
          <nav className="mb-3 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-primary">Beranda</Link>
            {cats[0] && (
              <>
                {' / '}
                <Link to="/kategori/$slug" params={{ slug: cats[0].slug }} className="hover:text-primary">
                  {cats[0].name}
                </Link>
              </>
            )}
          </nav>

          <h1 className="font-display text-2xl font-bold leading-tight sm:text-4xl">{post.title}</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {post.author_name} · {formatDate(post.published_at)}
          </p>

          <AdSlot slot="below_title" />

          {post.featured_image && (
            <img
              src={post.featured_image}
              alt={post.title}
              className="mt-4 w-full rounded-lg object-cover"
            />
          )}

          <div className="article-body mt-6" dangerouslySetInnerHTML={{ __html: top }} />
          {bottom && (
            <>
              <AdSlot slot="in_article" />
              <div className="article-body" dangerouslySetInnerHTML={{ __html: bottom }} />
            </>
          )}

          {tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {tags.map((t) => (
                <Link
                  key={t!.slug}
                  to="/tag/$slug"
                  params={{ slug: t!.slug }}
                  className="rounded-full bg-secondary px-3 py-1 text-xs hover:text-primary"
                >
                  #{t!.name}
                </Link>
              ))}
            </div>
          )}

          <LikeShare postId={post.id} slug={post.slug} title={post.title} />

          <AdSlot slot="below_article" />

          {related.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-4 border-l-4 border-primary pl-3 font-display text-xl font-bold uppercase">
                Artikel Terkait
              </h2>
              <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
                {related.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </div>
            </section>
          )}

          <CommentSection postId={post.id} comments={comments} />
        </main>
        <Sidebar popular={popular} />
      </div>
    </div>
  );
}

function LikeShare({ postId, slug, title }: { postId: number; slug: string; title: string }) {
  const session = useUserSession();
  const [likes, setLikes] = useState<{ count: number; liked: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (session === undefined) return;
    let alive = true;
    (async () => {
      const token = session ? await ensureUserToken() : '';
      try {
        const res = await getLikes({ data: token ? { postId, token } : { postId } });
        if (alive) setLikes(res);
      } catch {
        if (alive) setLikes({ count: 0, liked: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, [postId, session]);

  const url = abs(`/${slug}`);

  async function onLike() {
    if (!session) return;
    setBusy(true);
    try {
      const token = await ensureUserToken();
      const res = await toggleLike({ data: { token, postId } });
      setLikes((cur) => ({
        count: Math.max(0, (cur?.count ?? 0) + (res.liked ? 1 : -1)),
        liked: res.liked,
      }));
    } catch {
      /* biarkan tampilan apa adanya */
    } finally {
      setBusy(false);
    }
  }

  async function onShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* pengguna membatalkan */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* abaikan */
    }
  }

  return (
    <div className="mt-8 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
      {session ? (
        <button
          onClick={onLike}
          disabled={busy}
          className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
            likes?.liked
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border hover:border-primary'
          }`}
        >
          {likes?.liked ? '♥ Disukai' : '♡ Suka'} {likes ? `(${likes.count})` : ''}
        </button>
      ) : (
        <Link
          to="/masuk"
          className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-primary"
        >
          ♡ Suka {likes ? `(${likes.count})` : ''} · masuk dulu
        </Link>
      )}

      <button
        onClick={onShare}
        className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-primary"
      >
        Bagikan
      </button>
      <a
        href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${title} ${url}`)}`}
        target="_blank"
        rel="noreferrer"
        className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-primary"
      >
        WhatsApp
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noreferrer"
        className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-primary"
      >
        Facebook
      </a>
      {copied && <span className="text-sm text-primary">Tautan disalin!</span>}
    </div>
  );
}

function CommentSection({
  postId,
  comments,
}: {
  postId: number;
  comments: {
    id: number;
    author_name: string;
    content: string;
    created_at: string;
    avatar_url?: string | null;
    is_member?: boolean;
  }[];
}) {
  const session = useUserSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  return (
    <section className="mt-12">
      <h2 className="mb-4 border-l-4 border-primary pl-3 font-display text-xl font-bold uppercase">
        Komentar ({comments.length})
      </h2>
      <ul className="space-y-4">
        {comments.map((c) => (
          <li key={c.id} className="flex gap-3 rounded-lg border border-border bg-card p-4">
            {c.avatar_url ? (
              <img
                src={c.avatar_url}
                alt={c.author_name}
                className="h-9 w-9 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
                {c.author_name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {c.author_name}
                {c.is_member && (
                  <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                    member
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{formatDate(c.created_at)}</p>
              <p className="mt-2 whitespace-pre-line text-sm">{c.content}</p>
            </div>
          </li>
        ))}
        {comments.length === 0 && (
          <li className="text-sm text-muted-foreground">Belum ada komentar. Jadilah yang pertama!</li>
        )}
      </ul>


      <form
        className="mt-6 space-y-3 rounded-lg border border-border bg-card p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setState('sending');
          try {
            const token = session ? await ensureUserToken() : '';
            await submitComment({
              data: token ? { postId, content, token } : { postId, name, email, content },
            });
            setState('done');
            setName('');
            setEmail('');
            setContent('');
          } catch {
            setState('error');
          }
        }}
      >
        <h3 className="font-display text-lg font-bold">Tinggalkan Komentar</h3>
        {session ? (
          <p className="text-sm text-muted-foreground">
            Berkomentar sebagai <span className="font-semibold text-foreground">{session.name || 'akun Anda'}</span>.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              <Link to="/masuk" className="text-primary underline">
                Masuk
              </Link>{' '}
              agar nama dan foto profil Anda tampil otomatis, atau isi nama di bawah.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nama"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (opsional)"
                className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </div>
          </>
        )}
        <textarea
          required
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Tulis komentar…"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          disabled={state === 'sending'}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {state === 'sending' ? 'Mengirim…' : 'Kirim Komentar'}
        </button>
        {state === 'done' && (
          <p className="text-sm text-primary">Terima kasih! Komentar menunggu moderasi admin.</p>
        )}
        {state === 'error' && (
          <p className="text-sm text-destructive">Komentar gagal dikirim, coba lagi.</p>
        )}
      </form>
    </section>
  );
}
