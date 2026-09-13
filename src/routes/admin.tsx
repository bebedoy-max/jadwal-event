import { createFileRoute, Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { checkAdminRole } from '@/lib/admin.functions';
import { clearToken, getToken, setToken } from '@/lib/useAdminToken';
import { clearUserSession, ensureUserToken, useUserSession } from '@/lib/useUserSession';

export const Route = createFileRoute('/admin')({
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Panel Admin | JadwalEvent' },
      { name: 'description', content: 'Kelola artikel, komentar, dan slot iklan JadwalEvent.' },
      { name: 'robots', content: 'noindex' },
      { property: 'og:title', content: 'Panel Admin JadwalEvent' },
      { property: 'og:description', content: 'Kelola artikel, komentar, dan slot iklan.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: AdminLayout,
});

type Gate = 'loading' | 'denied' | 'ok';

function AdminLayout() {
  const session = useUserSession();
  const navigate = useNavigate();
  const [gate, setGate] = useState<Gate>('loading');

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      // Belum masuk: arahkan ke halaman login umum.
      navigate({ to: '/masuk' });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await ensureUserToken();
        await checkAdminRole({ data: { token } });
        if (cancelled) return;
        // Samakan token admin dengan sesi user agar halaman-halaman admin jalan.
        if (getToken() !== token) setToken(token, session.refresh, Math.max(60, (session.exp - Date.now()) / 1000));
        setGate('ok');
      } catch {
        if (!cancelled) setGate('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, navigate]);

  if (session === undefined || gate === 'loading')
    return <div className="p-10 text-center text-muted-foreground">Memuat…</div>;

  if (gate === 'denied')
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-secondary px-4 text-center">
        <h1 className="font-display text-xl font-bold">Akses ditolak</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Akun Anda tidak memiliki role admin. Hubungi pengelola situs bila ini keliru.
        </p>
        <div className="flex gap-3">
          <Link to="/" className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-primary">
            Kembali ke Beranda
          </Link>
          <button
            onClick={() => {
              clearToken();
              clearUserSession();
              navigate({ to: '/masuk' });
            }}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-primary"
          >
            Ganti Akun
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-display text-lg font-bold">Panel Admin</span>
          <nav className="flex flex-wrap gap-3 text-sm">
            <Link to="/admin" className="hover:text-primary">Artikel</Link>
            <Link to="/admin/komentar" className="hover:text-primary">Komentar</Link>
            <Link to="/admin/pengajuan" className="hover:text-primary">Pengajuan Paket</Link>
            <Link to="/admin/pengguna" className="hover:text-primary">Pengguna</Link>
            <Link to="/admin/pembayaran" className="hover:text-primary">Pembayaran</Link>
            <Link to="/admin/iklan" className="hover:text-primary">Iklan</Link>
            <Link to="/admin/drive" className="hover:text-primary">Google Drive</Link>
            <Link to="/" className="hover:text-primary">Lihat Situs</Link>
          </nav>
          <span className="ml-auto text-sm text-muted-foreground">{session?.name}</span>
          <button
            onClick={() => {
              clearToken();
              clearUserSession();
              navigate({ to: '/' });
            }}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-primary"
          >
            Keluar
          </button>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </div>
    </div>
  );
}
