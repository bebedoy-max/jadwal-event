import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import {
  googleAuthUrl,
  userForgotPassword,
  userSignIn,
  userSignUp,
} from '@/lib/user.functions';
import { saveUserSession } from '@/lib/useUserSession';

export const Route = createFileRoute('/masuk')({
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Masuk atau Daftar Akun | JadwalEvent' },
      {
        name: 'description',
        content:
          'Masuk atau daftar akun JadwalEvent untuk berkomentar, menyukai artikel, dan berlangganan paket Pro.',
      },
      { property: 'og:title', content: 'Masuk atau Daftar Akun JadwalEvent' },
      {
        property: 'og:description',
        content: 'Buat akun gratis untuk berkomentar, menyukai artikel, dan berlangganan paket Pro.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: MasukPage,
});

type Mode = 'masuk' | 'daftar' | 'lupa';

const input =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary';

function MasukPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('masuk');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      if (mode === 'masuk') {
        const res = await userSignIn({ data: { email, password } });
        saveUserSession(res);
        navigate({ to: '/profil' });
      } else if (mode === 'daftar') {
        const res = await userSignUp({
          data: {
            email,
            password,
            displayName: name,
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (res.confirmed) {
          saveUserSession(res, { name });
          navigate({ to: '/profil' });
        } else {
          setMsg(
            'Pendaftaran berhasil. Cek email Anda dan klik tautan konfirmasi untuk mengaktifkan akun.',
          );
          setPassword('');
        }
      } else {
        await userForgotPassword({
          data: { email, redirectTo: `${window.location.origin}/atur-sandi` },
        });
        setMsg('Tautan penyetelan kata sandi sudah dikirim ke email Anda.');
      }
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Terjadi kesalahan, coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setErr('');
    try {
      const { url } = await googleAuthUrl({
        data: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      window.location.href = url;
    } catch {
      setErr('Masuk dengan Google belum tersedia.');
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <div className="rounded-xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl font-bold">
          {mode === 'daftar' ? 'Daftar Akun Baru' : mode === 'lupa' ? 'Lupa Kata Sandi' : 'Masuk'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === 'lupa'
            ? 'Masukkan email Anda, kami kirim tautan untuk membuat kata sandi baru.'
            : 'Akun gratis untuk berkomentar, menyukai artikel, dan berlangganan paket Pro.'}
        </p>

        {mode !== 'lupa' && (
          <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-1 text-sm font-medium">
            {(['masuk', 'daftar'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setErr('');
                  setMsg('');
                }}
                className={`rounded-md py-2 ${
                  mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {m === 'masuk' ? 'Masuk' : 'Daftar'}
              </button>
            ))}
          </div>
        )}

        <form className="mt-5 space-y-3" onSubmit={submit}>
          {mode === 'daftar' && (
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama tampilan"
              className={input}
            />
          )}
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className={input}
          />
          {mode !== 'lupa' && (
            <input
              required
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'daftar' ? 'Kata sandi (min. 8 karakter)' : 'Kata sandi'}
              className={input}
            />
          )}
          {err && <p className="text-sm text-destructive">{err}</p>}
          {msg && <p className="text-sm text-primary">{msg}</p>}
          <button
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {busy
              ? 'Memproses…'
              : mode === 'daftar'
                ? 'Daftar Sekarang'
                : mode === 'lupa'
                  ? 'Kirim Tautan'
                  : 'Masuk'}
          </button>
        </form>

        {mode !== 'lupa' && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" /> atau <span className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              onClick={google}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium hover:border-primary"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1A6.2 6.2 0 1 1 16.1 7.3l2.7-2.6A9.9 9.9 0 1 0 12 21.9c5.7 0 9.5-4 9.5-9.6 0-.7-.08-1.3-.2-2.1H12z"
                />
              </svg>
              Lanjutkan dengan Google
            </button>
          </>
        )}

        <div className="mt-5 flex justify-between text-sm">
          {mode === 'lupa' ? (
            <button type="button" onClick={() => setMode('masuk')} className="text-primary hover:underline">
              ← Kembali ke Masuk
            </button>
          ) : (
            <button type="button" onClick={() => setMode('lupa')} className="text-primary hover:underline">
              Lupa kata sandi?
            </button>
          )}
          <Link to="/paket" className="text-muted-foreground hover:text-primary">
            Lihat paket
          </Link>
        </div>
      </div>
    </div>
  );
}
