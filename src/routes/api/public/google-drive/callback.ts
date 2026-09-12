import { createFileRoute } from '@tanstack/react-router';
import {
  ensureRootFolder,
  exchangeCode,
  fetchEmail,
  getAccount,
  patchAccount,
} from '@/lib/gdrive.server';

function page(title: string, body: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;padding:40px;text-align:center"><h2>${title}</h2><p>${body}</p><script>window.opener&&window.opener.postMessage({type:'gdriveConnected'},window.location.origin);setTimeout(()=>window.close(),2500)</script></body>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export const Route = createFileRoute('/api/public/google-drive/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state') ?? '';
        const err = url.searchParams.get('error');
        if (err) return page('Gagal menghubungkan', `Google membalas: ${err}`);
        const [accId, stateOrigin] = state.split('|');
        if (!code || !accId) return page('Gagal menghubungkan', 'Data dari Google tidak lengkap.');
        try {
          const acc = await getAccount(accId);
          if (!acc) return page('Gagal menghubungkan', 'Akun tidak ditemukan.');
          const tok = await exchangeCode(acc, code, stateOrigin || url.origin);
          if (!tok.refresh_token) {
            return page(
              'Belum sepenuhnya terhubung',
              'Google tidak mengirim izin jangka panjang. Buka akun Google Anda → Keamanan → Aplikasi pihak ketiga, hapus akses aplikasi ini, lalu klik Hubungkan lagi.',
            );
          }
          await patchAccount(acc.id, { refresh_token: tok.refresh_token });
          const fresh = await getAccount(acc.id);
          if (fresh) {
            const email = await fetchEmail(fresh);
            if (email) await patchAccount(fresh.id, { email });
            await ensureRootFolder(fresh);
          }
          return page('Google Drive terhubung', 'Jendela ini akan tertutup sendiri.');
        } catch (e) {
          return page('Gagal menghubungkan', e instanceof Error ? e.message : 'Terjadi kesalahan.');
        }
      },
    },
  },
});
