import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { saveUserSession } from '@/lib/useUserSession';

export const Route = createFileRoute('/auth/callback')({
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Menyelesaikan Masuk | JadwalEvent' },
      { name: 'description', content: 'Proses masuk sedang diselesaikan.' },
      { name: 'robots', content: 'noindex' },
      { property: 'og:title', content: 'Menyelesaikan Masuk' },
      { property: 'og:description', content: 'Proses masuk sedang diselesaikan.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
  const [err, setErr] = useState('');

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const search = new URLSearchParams(window.location.search);
    const error = hash.get('error_description') ?? search.get('error_description');
    const token = hash.get('access_token');
    if (error) {
      setErr(error);
      return;
    }
    if (!token) {
      setErr('Tautan tidak lengkap atau sudah dipakai. Silakan coba masuk kembali.');
      return;
    }
    saveUserSession({
      token,
      refresh: hash.get('refresh_token') ?? '',
      expiresIn: Number(hash.get('expires_in') ?? 3600),
    });
    const type = hash.get('type') ?? search.get('type');
    window.history.replaceState(null, '', '/auth/callback');
    navigate({ to: type === 'recovery' ? '/atur-sandi' : '/profil', replace: true });
  }, [navigate]);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      {err ? (
        <>
          <h1 className="font-display text-xl font-bold">Gagal masuk</h1>
          <p className="mt-2 text-sm text-muted-foreground">{err}</p>
          <a href="/masuk" className="mt-6 inline-block text-primary underline">
            Kembali ke halaman masuk
          </a>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Sedang menyelesaikan proses masuk…</p>
      )}
    </div>
  );
}
