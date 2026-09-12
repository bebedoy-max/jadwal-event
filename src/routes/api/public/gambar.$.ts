import { createFileRoute } from '@tanstack/react-router';
import { activeAccount, downloadFile, findAsset, getAccount, ingestMedia } from '@/lib/gdrive.server';
import { fetchLegacyMedia, guessMime } from '@/lib/legacy-media.server';

/**
 * Penyaji media situs. Urutan: Google Drive (akun mana pun yang tercatat di
 * media_assets) → sumber lama, sambil otomatis menyalinnya ke Drive aktif.
 * Alamat ini tidak berubah walau akun Drive dipindah.
 */

const CACHE = 'public, max-age=31536000, immutable';
const MAX_INGEST = 15 * 1024 * 1024;

export const Route = createFileRoute('/api/public/gambar/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const rel = decodeURIComponent(String((params as { _splat?: string })._splat ?? ''));
        if (!rel || rel.includes('..') || rel.startsWith('/')) {
          return new Response('Bad path', { status: 400 });
        }

        // 1) Sudah ada di Google Drive
        try {
          const asset = await findAsset(rel);
          if (asset) {
            const acc = await getAccount(asset.account_id);
            if (acc) {
              const res = await downloadFile(acc, asset.drive_file_id);
              if (res.ok && res.body) {
                return new Response(res.body, {
                  status: 200,
                  headers: {
                    'Content-Type': asset.mime || guessMime(rel),
                    'Cache-Control': CACHE,
                  },
                });
              }
            }
          }
        } catch {
          /* lanjut ke sumber lama */
        }

        // 2) Ambil dari sumber lama, lalu salin ke Drive aktif untuk seterusnya
        const legacy = await fetchLegacyMedia(rel).catch(() => null);
        if (legacy) {
          if (legacy.bytes.byteLength <= MAX_INGEST) {
            try {
              const acc = await activeAccount();
              if (acc?.refresh_token) await ingestMedia(acc, rel, legacy);
            } catch {
              /* penyalinan gagal, berkas tetap disajikan */
            }
          }
          return new Response(legacy.bytes, {
            status: 200,
            headers: { 'Content-Type': legacy.mime || guessMime(rel), 'Cache-Control': CACHE },
          });
        }

        // 3) Placeholder netral agar halaman tidak rusak
        const svg =
          '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450"><rect width="100%" height="100%" fill="#e8e6e1"/></svg>';
        return new Response(svg, {
          status: 200,
          headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' },
        });
      },
    },
  },
});
