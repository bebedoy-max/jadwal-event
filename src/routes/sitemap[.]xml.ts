import { createFileRoute } from '@tanstack/react-router';
import { sbList } from '@/lib/sb.server';
import { SITE_URL } from '@/lib/site';

const PER_PART = 1000;

/** Indeks sitemap: bagian "utama" + potongan artikel per 1000 URL. */
export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = SITE_URL;
        let total = 0;
        try {
          const res = await sbList<{ id: number }>(
            '/rest/v1/posts?select=id&status=eq.publish&post_type=eq.post',
            { headers: { Range: '0-0' } },
          );
          total = res.total;
        } catch {
          total = 0;
        }
        const parts = ['utama', ...Array.from({ length: Math.ceil(total / PER_PART) }, (_, i) => String(i + 1))];
        const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${parts.map((p) => `  <sitemap><loc>${origin}/sitemap/${p}.xml</loc></sitemap>`).join('\n')}
</sitemapindex>`;
        return new Response(body, {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      },
    },
  },
});
