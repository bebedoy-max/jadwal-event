import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { userSetPassword } from '@/lib/user.functions';
import { ensureUserToken, saveUserSession } from '@/lib/useUserSession';

export const Route = createFileRoute('/atur-sandi')({
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Setel Kata Sandi Baru | JadwalEvent' },
      { name: 'description', content: 'Buat kata sandi baru untuk akun JadwalEvent Anda.' },
      { name: 'robots', content: 'noindex' },
      { property: 'og:title', content: 'Setel Kata Sandi Baru' },
      { property: 'og:description', content: 'Buat kata sandi baru untuk akun Anda.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: AturSandi,
});

function AturSandi() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  // Tautan pemulihan dari email membawa token pada hash URL.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hash.get('access_token');
    if (token) {
      saveUserSession({
        token,
        refresh: hash.get('refresh_token') ?? '',
        expiresIn: Number(hash.get('expires_in') ?? 3600),
      });
      window.history.replaceState(null, '', '/atur-sandi');
    }
  }, []);

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <form
        className="space-y-4 rounded-xl border border-border bg-card p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr('');
          try {
            const token = await ensureUserToken();
            if (!token) throw new Error('Tautan sudah tidak berlaku. Minta tautan baru.');
            await userSetPassword({ data: { token, password } });
            setDone(true);
            setTimeout(() => navigate({ to: '/profil' }), 1200);
          } catch (error) {
            setErr(error instanceof Error ? error.message : 'Gagal menyimpan kata sandi.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="font-display text-xl font-bold">Setel Kata Sandi Baru</h1>
        <input
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Kata sandi baru (min. 8 karakter)"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {err && <p className="text-sm text-destructive">{err}</p>}
        {done && <p className="text-sm text-primary">Kata sandi tersimpan. Mengalihkan…</p>}
        <button
          disabled={busy}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? 'Menyimpan…' : 'Simpan Kata Sandi'}
        </button>
      </form>
    </div>
  );
}
