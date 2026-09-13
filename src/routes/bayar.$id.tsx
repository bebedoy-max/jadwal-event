import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { getCheckout, pollPayment, startPayment, type Checkout } from '@/lib/payments.functions';
import { ensureUserToken, useUserSession } from '@/lib/useUserSession';

export const Route = createFileRoute('/bayar/$id')({
  ssr: false,
  head: () => ({
    meta: [
      { title: 'Pembayaran QRIS | JadwalEvent' },
      { name: 'description', content: 'Selesaikan pembayaran paket Anda dengan QRIS.' },
      { name: 'robots', content: 'noindex' },
      { property: 'og:title', content: 'Pembayaran QRIS | JadwalEvent' },
      { property: 'og:description', content: 'Selesaikan pembayaran paket Anda dengan QRIS.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: BayarPage,
});

function rupiah(n: number) {
  return `Rp${(n ?? 0).toLocaleString('id-ID')}`;
}

function BayarPage() {
  const { id } = Route.useParams();
  const session = useUserSession();
  const navigate = useNavigate();
  const [data, setData] = useState<Checkout | null>(null);
  const [qr, setQr] = useState('');
  const [err, setErr] = useState('');
  const [left, setLeft] = useState('');
  const started = useRef(false);

  // id numerik = transaksi yang sudah ada, "order-<n>" = buat transaksi baru.
  const load = useCallback(async () => {
    const token = await ensureUserToken();
    if (id.startsWith('order-')) {
      const orderId = Number(id.slice(6));
      return startPayment({ data: { token, orderId } });
    }
    return getCheckout({ data: { token, id: Number(id) } });
  }, [id]);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      navigate({ to: '/masuk' });
      return;
    }
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        setData(await load());
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Gagal memuat pembayaran.');
      }
    })();
  }, [session, navigate, load]);

  // Render QR dari payload QRIS.
  useEffect(() => {
    if (!data?.qris_string) return;
    QRCode.toDataURL(data.qris_string, { width: 320, margin: 1 })
      .then(setQr)
      .catch(() => setQr(''));
  }, [data?.qris_string]);

  // Hitung mundur sampai kedaluwarsa.
  useEffect(() => {
    if (!data?.expired_at || data.status !== 'pending') return;
    const target = new Date(data.expired_at).getTime();
    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0) {
        setLeft('habis');
        setData((d) => (d && d.status === 'pending' ? { ...d, status: 'expired' } : d));
        return;
      }
      const m = Math.floor(ms / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setLeft(`${m}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [data?.expired_at, data?.status]);

  // Polling status tiap 5 detik sebagai cadangan webhook.
  useEffect(() => {
    if (!data || data.status !== 'pending') return;
    const t = window.setInterval(async () => {
      try {
        const token = await ensureUserToken();
        const res = await pollPayment({ data: { token, id: data.id } });
        if (res.status !== 'pending')
          setData((d) => (d ? { ...d, status: res.status } : d));
      } catch {
        /* diamkan, coba lagi pada tik berikutnya */
      }
    }, 5000);
    return () => window.clearInterval(t);
  }, [data]);

  if (err)
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm text-destructive">{err}</p>
        <Link to="/profil" className="mt-4 inline-block text-sm text-primary underline">
          Kembali ke profil
        </Link>
      </div>
    );

  if (!data)
    return <div className="p-16 text-center text-muted-foreground">Menyiapkan pembayaran…</div>;

  if (data.status === 'paid')
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-primary">Pembayaran berhasil</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Paket {data.plan_name} sudah aktif di akun Anda.
        </p>
        <Link
          to="/profil"
          className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Lihat profil saya
        </Link>
      </div>
    );

  if (data.status !== 'pending')
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="font-display text-xl font-bold">Pembayaran tidak dapat dilanjutkan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Status transaksi: {data.status}. Silakan ajukan ulang dari halaman profil.
        </p>
        <Link to="/profil" className="mt-6 inline-block text-sm text-primary underline">
          Kembali ke profil
        </Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="font-display text-2xl font-bold">Pembayaran QRIS</h1>
      <p className="mt-1 text-sm text-muted-foreground">Paket {data.plan_name}</p>

      <div className="mt-6 rounded-xl border border-border bg-card p-5 text-center">
        {qr ? (
          <img src={qr} alt="Kode QRIS pembayaran" className="mx-auto h-64 w-64" />
        ) : (
          <div className="mx-auto flex h-64 w-64 items-center justify-center text-sm text-muted-foreground">
            Memuat kode QR…
          </div>
        )}
        <p className="mt-4 text-xs text-muted-foreground">Nominal yang harus dibayar</p>
        <p className="font-display text-3xl font-bold text-primary">{rupiah(data.final_amount)}</p>
        {data.unique_code ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Termasuk kode unik <span className="font-semibold text-foreground">{data.unique_code}</span> —
            bayar tepat sampai angka terakhir agar terverifikasi otomatis.
          </p>
        ) : null}
        {left && (
          <p className="mt-3 text-sm">
            Berlaku {left === 'habis' ? 'sudah habis' : <span className="font-semibold">{left}</span>} lagi
          </p>
        )}
      </div>

      <ol className="mt-6 space-y-1 text-sm text-muted-foreground">
        <li>1. Buka aplikasi bank / e-wallet Anda, pilih bayar QRIS.</li>
        <li>2. Pindai kode di atas, pastikan nominal sama persis.</li>
        <li>3. Halaman ini otomatis berubah setelah pembayaran diterima.</li>
      </ol>

      <Link to="/profil" className="mt-6 inline-block text-sm text-primary underline">
        Kembali ke profil
      </Link>
    </div>
  );
}
