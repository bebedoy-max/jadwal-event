import { createFileRoute } from '@tanstack/react-router';
import { sbJson, sbList } from '@/lib/sb.server';
import { SITE_URL } from '@/lib/site';

const PER_PART = 1000;

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function urlset(entries: { loc: string; lastmod?: string | undefined }[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) =>
      `  <url><loc>${esc(e.loc)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`,
  )
  .join('\n')}
</urlset>`;
}

/** Potongan sitemap: "utama" (halaman statis + kategori) atau nomor halaman artikel. */
export const Route = createFileRoute('/sitemap/$part.xml')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const origin = SITE_URL;
        const part = decodeURIComponent(u.pathname.split('/').pop() ?? '')
          .replace(/\.xml$/i, '')
          .trim();
        const entries: { loc: string; lastmod?: string | undefined }[] = [];

        try {
          if (part === 'utama') {
            for (const p of ['/', '/privacy-policy', '/terms-of-service']) {
              entries.push({ loc: `${origin}${p}` });
            }
            const pages = await sbJson<{ slug: string; published_at: string }[]>(
              '/rest/v1/posts?select=slug,published_at&status=eq.publish&post_type=eq.page&limit=200',
            );
            for (const p of pages) {
              entries.push({
                loc: `${origin}/${p.slug}`,
                lastmod: p.published_at ? new Date(p.published_at).toISOString() : undefined,
              });
            }
            const cats = await sbJson<{ slug: string }[]>(
              '/rest/v1/categories?select=slug&order=post_count.desc&limit=200',
            );
            for (const c of cats) entries.push({ loc: `${origin}/kategori/${c.slug}` });
          } else {
            const n = Math.max(1, Number(part) || 1);
            const from = (n - 1) * PER_PART;
            const res = await sbList<{ slug: string; published_at: string; updated_at?: string }>(
              '/rest/v1/posts?select=slug,published_at&status=eq.publish&post_type=eq.post&order=published_at.desc',
              { headers: { Range: `${from}-${from + PER_PART - 1}` } },
            );
            for (const p of res.data) {
              entries.push({
                loc: `${origin}/${p.slug}`,
                lastmod: p.published_at ? new Date(p.published_at).toISOString() : undefined,
              });
            }
          }
        } catch {
          /* kembalikan urlset kosong bila database belum tersedia */
        }

        return new Response(urlset(entries), {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      },
    },
  },
});
