import { createFileRoute } from '@tanstack/react-router';
import { runSync, syncStatus } from '@/lib/sync.server';

/**
 * Penjalan pemindahan media/artikel ke Google Drive tanpa perlu membuka panel
 * admin. Dipanggil berulang (mis. oleh penjadwal) dengan kunci rahasia:
 *   /api/public/drive-sync?key=...&seconds=45
 * Tambahkan &status=1 untuk sekadar melihat posisi terakhir.
 */
export const Route = createFileRoute('/api/public/drive-sync')({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});

async function handle({ request }: { request: Request }) {
  const url = new URL(request.url);
  const secret = process.env['LOVABLE_CRON_SECRET'] ?? '';
  const key = url.searchParams.get('key') ?? request.headers.get('x-sync-key') ?? '';
  if (!secret || key !== secret) {
    return json({ error: 'Kunci tidak valid.' }, 401);
  }

  try {
    if (url.searchParams.get('status')) {
      return json(await syncStatus());
    }
    const seconds = Number(url.searchParams.get('seconds') ?? '45');
    const batch = Number(url.searchParams.get('batch') ?? '6');
    const res = await runSync({
      budgetMs: (Number.isFinite(seconds) ? seconds : 45) * 1000,
      batch: Number.isFinite(batch) ? batch : 6,
      articles: url.searchParams.get('articles') !== '0',
      reset: url.searchParams.get('reset') === '1',
    });
    return json(res);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Gagal.' }, 500);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
