import { createFileRoute, Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { adminLogin } from '@/lib/admin.functions';
import { clearToken, setToken, useAdminToken } from '@/lib/useAdminToken';

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

function AdminLayout() {
  const [token, setTok] = useAdminToken();
  const navigate = useNavigate();

  if (token === null) return <div className="p-10 text-center text-muted-foreground">Memuat…</div>;
  if (!token) return <LoginForm onLogin={(t) => setTok(t)} />;

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="font-display text-lg font-bold">Panel Admin</span>
          <nav className="flex flex-wrap gap-3 text-sm">
            <Link to="/admin" className="hover:text-primary">Artikel</Link>
            <Link to="/admin/komentar" className="hover:text-primary">Komentar</Link>
            <Link to="/admin/iklan" className="hover:text-primary">Iklan</Link>
            <Link to="/admin/drive" className="hover:text-primary">Google Drive</Link>
            <Link to="/" className="hover:text-primary">Lihat Situs</Link>
          </nav>
          <button
            onClick={() => {
              clearToken();
              setTok('');
              navigate({ to: '/admin' });
            }}
            className="ml-auto rounded-md border border-border px-3 py-1.5 text-sm hover:border-primary"
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

function LoginForm({ onLogin }: { onLogin: (t: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary px-4">
      <form
        className="w-full max-w-sm space-y-4 rounded-xl border border-border bg-card p-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr('');
          try {
            const res = await adminLogin({ data: { email, password } });
            setToken(res.token, res.refresh, res.expiresIn);
            onLogin(res.token);
          } catch (error) {
            setErr(error instanceof Error ? error.message : 'Gagal masuk.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="font-display text-xl font-bold">Masuk Panel Admin</h1>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Kata sandi"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        {err && <p className="text-sm text-destructive">{err}</p>}
        <button
          disabled={busy}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? 'Memproses…' : 'Masuk'}
        </button>
      </form>
    </div>
  );
}
