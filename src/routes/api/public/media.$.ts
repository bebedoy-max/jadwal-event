import { createFileRoute } from '@tanstack/react-router';
import { downloadFile, findAsset, getAccount } from '@/lib/gdrive.server';

/**
 * Menyajikan media yang tersimpan di Google Drive lewat domain situs.
 * URL tetap sama meski berkasnya dipindah ke akun Drive lain.
 */
export const Route = createFileRoute('/api/public/media/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = decodeURIComponent(String((params as { _splat?: string })._splat ?? ''));
        if (!path || path.includes('..')) return new Response('Bad path', { status: 400 });
        try {
          const asset = await findAsset(path);
          if (!asset) return new Response('Not found', { status: 404 });
          const acc = await getAccount(asset.account_id);
          if (!acc) return new Response('Storage unavailable', { status: 404 });
          const res = await downloadFile(acc, asset.drive_file_id);
          if (!res.ok || !res.body) return new Response('Not found', { status: 404 });
          return new Response(res.body, {
            status: 200,
            headers: {
              'Content-Type': asset.mime || res.headers.get('content-type') || 'application/octet-stream',
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        } catch {
          return new Response('Storage error', { status: 502 });
        }
      },
    },
  },
});
