import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import {
  getMyAccount,
  submitPlanOrder,
  updateMyProfile,
  uploadMyAvatar,
  type Plan,
  type PlanOrder,
  type Profile,
  type Subscription,
} from '@/lib/user.functions';
import {
  clearUserSession,
  ensureUserToken,
  updateUserInfo,
} from '@/lib/useUserSession';

export const Route = createFileRoute('/profil')({
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Profil Saya | JadwalEvent' },
      { name: 'description', content: 'Kelola data akun, foto profil, langganan, dan pengajuan paket Anda.' },
      { name: 'robots', content: 'noindex' },
      { property: 'og:title', content: 'Profil Saya | JadwalEvent' },
      { property: 'og:description', content: 'Kelola data akun, langganan, dan pengajuan paket.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: ProfilPage,
});

const input =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary';

type Account = {
  email: string;
  profile: Profile;
  subscription: Subscription;
  plans: Plan[];
  orders: PlanOrder[];
  isAdmin: boolean;
};

const STATUS: Record<string, string> = {
  pending: 'Menunggu verifikasi',
  approved: 'Disetujui',
  paid: 'Lunas',
  rejected: 'Ditolak',
};

function tanggal(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ProfilPage() {
  const navigate = useNavigate();
  const [acc, setAcc] = useState<Account | null>(null);
  const [err, setErr] = useState('');

  async function load() {
    const token = await ensureUserToken();
    if (!token) {
      navigate({ to: '/masuk' });
      return;
    }
    try {
      const data = await getMyAccount({ data: { token } });
      setAcc(data as Account);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal memuat profil.');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (err)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-sm text-destructive">{err}</p>
        <Link to="/masuk" className="mt-4 inline-block text-sm text-primary">
          Masuk ulang
        </Link>
      </div>
    );
  if (!acc)
    return <div className="px-4 py-16 text-center text-sm text-muted-foreground">Memuat…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="font-display text-3xl font-bold">Profil Saya</h1>
        {acc.isAdmin && (
          <Link to="/admin" className="text-sm text-primary hover:underline">
            Panel Admin
          </Link>
        )}
        <button
          onClick={() => {
            clearUserSession();
            navigate({ to: '/' });
          }}
          className="ml-auto rounded-md border border-border px-3 py-1.5 text-sm hover:border-primary"
        >
          Keluar
        </button>
      </div>

      <AvatarCard acc={acc} onDone={load} />
      <ProfileForm acc={acc} onDone={load} />
      <SubscriptionCard acc={acc} />
      <OrderForm acc={acc} onDone={load} />
      <OrderHistory acc={acc} />
    </div>
  );
}

function AvatarCard({ acc, onDone }: { acc: Account; onDone: () => Promise<void> }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function shrink(f: File): Promise<{ mime: string; name: string; bytes: Uint8Array }> {
    const raw = new Uint8Array(await f.arrayBuffer());
    if (raw.length <= 1_500_000 && f.type !== 'image/heic') {
      return { mime: f.type || 'image/jpeg', name: f.name, bytes: raw };
    }
    const url = URL.createObjectURL(f);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Format gambar tidak didukung.'));
        el.src = url;
      });
      const max = 640;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Gagal memproses gambar.');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob((b) => r(b), 'image/jpeg', 0.85),
      );
      if (!blob) throw new Error('Gagal memproses gambar.');
      const out = new Uint8Array(await blob.arrayBuffer());
      const base = f.name.replace(/\.[^.]+$/, '') || 'avatar';
      return { mime: 'image/jpeg', name: `${base}.jpg`, bytes: out };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function pick(f: File) {
    setBusy(true);
    setMsg('');
    try {
      const token = await ensureUserToken();
      const small = await shrink(f);
      if (small.bytes.length > 3_000_000) {
        throw new Error('Gambar terlalu besar, coba pilih foto lain.');
      }
      let bin = '';
      for (let i = 0; i < small.bytes.length; i++) bin += String.fromCharCode(small.bytes[i]!);
      const res = await uploadMyAvatar({
        data: { token, name: small.name, mime: small.mime, dataBase64: btoa(bin) },
      });
      updateUserInfo({ avatar: res.url });
      await onDone();
      setMsg('Foto profil diperbarui.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Gagal mengunggah foto.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
      {acc.profile.avatar_url ? (
        <img
          src={acc.profile.avatar_url}
          alt={`Foto profil ${acc.profile.display_name}`}
          className="h-20 w-20 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted text-2xl font-bold text-muted-foreground">
          {(acc.profile.display_name || acc.email || '?').charAt(0).toUpperCase()}
        </div>
      )}
      <div>
        <p className="font-semibold">{acc.profile.display_name || 'Tanpa nama'}</p>
        <p className="text-sm text-muted-foreground">{acc.email}</p>
        <button
          disabled={busy}
          onClick={() => file.current?.click()}
          className="mt-2 rounded-md border border-border px-3 py-1.5 text-sm hover:border-primary disabled:opacity-60"
        >
          {busy ? 'Mengunggah…' : 'Ganti foto profil'}
        </button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
            e.target.value = '';
          }}
        />
        {msg && <p className="mt-2 text-sm text-muted-foreground">{msg}</p>}
      </div>
    </section>
  );
}

function ProfileForm({ acc, onDone }: { acc: Account; onDone: () => Promise<void> }) {
  const p = acc.profile;
  const [form, setForm] = useState({
    display_name: p.display_name ?? '',
    full_name: p.full_name ?? '',
    whatsapp: p.whatsapp ?? '',
    city: p.city ?? '',
    website: p.website ?? '',
    bio: p.bio ?? '',
  });
  const [state, setState] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('saving');
        setErr('');
        try {
          const token = await ensureUserToken();
          await updateMyProfile({ data: { token, ...form } });
          updateUserInfo({ name: form.display_name });
          await onDone();
          setState('done');
        } catch (e2) {
          setErr(e2 instanceof Error ? e2.message : 'Gagal menyimpan.');
          setState('error');
        }
      }}
    >
      <h2 className="font-display text-xl font-bold">Data Diri</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Nama tampilan
          <input required className={input} value={form.display_name} onChange={set('display_name')} />
        </label>
        <label className="text-sm">
          Nama lengkap
          <input className={input} value={form.full_name} onChange={set('full_name')} />
        </label>
        <label className="text-sm">
          Nomor WhatsApp
          <input className={input} value={form.whatsapp} onChange={set('whatsapp')} />
        </label>
        <label className="text-sm">
          Kota
          <input className={input} value={form.city} onChange={set('city')} />
        </label>
        <label className="text-sm sm:col-span-2">
          Situs / media sosial
          <input className={input} value={form.website} onChange={set('website')} />
        </label>
        <label className="text-sm sm:col-span-2">
          Bio singkat
          <textarea rows={3} className={input} value={form.bio} onChange={set('bio')} />
        </label>
      </div>
      <button
        disabled={state === 'saving'}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {state === 'saving' ? 'Menyimpan…' : 'Simpan perubahan'}
      </button>
      {state === 'done' && <p className="text-sm text-primary">Perubahan tersimpan.</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}
    </form>
  );
}

function SubscriptionCard({ acc }: { acc: Account }) {
  const plan = acc.plans.find((p) => p.id === acc.subscription?.plan_id);
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-xl font-bold">Status Langganan</h2>
      <p className="mt-2 text-sm">
        Paket saat ini: <strong>{plan?.name ?? acc.subscription?.plan_id ?? 'Gratis'}</strong>
      </p>
      <p className="text-sm text-muted-foreground">
        Mulai {tanggal(acc.subscription?.started_at ?? null)} · Berlaku sampai{' '}
        {acc.subscription?.expires_at ? tanggal(acc.subscription.expires_at) : 'tanpa batas'}
      </p>
      <Link to="/paket" className="mt-3 inline-block text-sm text-primary hover:underline">
        Lihat semua paket & harga
      </Link>
    </section>
  );
}

function OrderForm({ acc, onDone }: { acc: Account; onDone: () => Promise<void> }) {
  const paid = acc.plans.filter((p) => p.price > 0);
  const [planId, setPlanId] = useState(paid[0]?.id ?? '');
  const [contact, setContact] = useState(acc.profile.whatsapp ?? '');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [err, setErr] = useState('');

  if (paid.length === 0) return null;

  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-card p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setState('sending');
        setErr('');
        try {
          const token = await ensureUserToken();
          await submitPlanOrder({ data: { token, planId, contact, note } });
          setNote('');
          await onDone();
          setState('done');
        } catch (e2) {
          setErr(e2 instanceof Error ? e2.message : 'Gagal mengirim pengajuan.');
          setState('error');
        }
      }}
    >
      <h2 className="font-display text-xl font-bold">Ajukan Paket</h2>
      <label className="block text-sm">
        Pilih paket
        <select className={input} value={planId} onChange={(e) => setPlanId(e.target.value)}>
          {paid.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — Rp{p.price.toLocaleString('id-ID')}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Kontak yang bisa dihubungi
        <input className={input} value={contact} onChange={(e) => setContact(e.target.value)} />
      </label>
      <label className="block text-sm">
        Keterangan / tautan event
        <textarea rows={3} className={input} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <button
        disabled={state === 'sending'}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {state === 'sending' ? 'Mengirim…' : 'Kirim pengajuan'}
      </button>
      {state === 'done' && (
        <p className="text-sm text-primary">
          Pengajuan terkirim. Admin akan menghubungi Anda untuk pembayaran.
        </p>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}
    </form>
  );
}

function OrderHistory({ acc }: { acc: Account }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-display text-xl font-bold">Riwayat Pengajuan</h2>
      {acc.orders.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Belum ada pengajuan.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {acc.orders.map((o) => (
            <li key={o.id} className="rounded-lg border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{acc.plans.find((p) => p.id === o.plan_id)?.name ?? o.plan_id}</strong>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {STATUS[o.status] ?? o.status}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {tanggal(o.created_at)}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">
                Rp{o.amount.toLocaleString('id-ID')}
                {o.note ? ` · ${o.note}` : ''}
              </p>
              {o.admin_note && <p className="mt-1 text-xs">Catatan admin: {o.admin_note}</p>}
              {o.amount > 0 && o.status !== 'paid' && (
                <Link
                  to="/bayar/$id"
                  params={{ id: `order-${o.id}` }}
                  className="mt-2 inline-block rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  Bayar sekarang (QRIS)
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
