import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { adminDecideOrder, adminListOrders } from '@/lib/admin.functions';
import { ensureToken } from '@/lib/useAdminToken';

export const Route = createFileRoute('/admin/pengajuan')({
  head: () => ({
    meta: [
      { title: 'Pengajuan Paket | Panel Admin JadwalEvent' },
      { name: 'description', content: 'Verifikasi pengajuan paket iklan dan langganan Pro.' },
      { name: 'robots', content: 'noindex' },
      { property: 'og:title', content: 'Pengajuan Paket | Panel Admin' },
      { property: 'og:description', content: 'Verifikasi pengajuan paket iklan dan langganan.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: PengajuanPage,
});

type Row = Awaited<ReturnType<typeof adminListOrders>>[number];

const STATUS: Record<string, string> = {
  pending: 'Menunggu',
  approved: 'Disetujui',
  paid: 'Lunas',
  rejected: 'Ditolak',
};

function PengajuanPage() {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr('');
    try {
      const token = await ensureToken();
      setRows(await adminListOrders({ data: { token, status } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal memuat pengajuan.');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function decide(id: number, action: 'approve' | 'reject' | 'paid') {
    const adminNote = window.prompt('Catatan untuk pengguna (opsional)') ?? '';
    setBusy(true);
    try {
      const token = await ensureToken();
      await adminDecideOrder({ data: { token, id, action, adminNote } });
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal menyimpan keputusan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-bold">Pengajuan Paket</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="pending">Menunggu</option>
          <option value="approved">Disetujui</option>
          <option value="paid">Lunas</option>
          <option value="rejected">Ditolak</option>
          <option value="all">Semua</option>
        </select>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}
      {rows.length === 0 && !err && (
        <p className="text-sm text-muted-foreground">Tidak ada pengajuan pada status ini.</p>
      )}

      <ul className="space-y-3">
        {rows.map((o) => (
          <li key={o.id} className="rounded-lg border border-border bg-card p-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{o.user_name}</strong>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {STATUS[o.status] ?? o.status}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(o.created_at).toLocaleString('id-ID')}
              </span>
            </div>
            <p className="mt-1">
              Paket <strong>{o.plan_id}</strong> · Rp{o.amount.toLocaleString('id-ID')}
              {o.contact ? ` · Kontak: ${o.contact}` : ''}
            </p>
            {o.note && <p className="mt-1 whitespace-pre-line text-muted-foreground">{o.note}</p>}
            {o.admin_note && <p className="mt-1 text-xs">Catatan admin: {o.admin_note}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                disabled={busy}
                onClick={() => decide(o.id, 'approve')}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
              >
                Setujui & aktifkan
              </button>
              <button
                disabled={busy}
                onClick={() => decide(o.id, 'paid')}
                className="rounded-md border border-border px-3 py-1.5 text-xs hover:border-primary disabled:opacity-60"
              >
                Tandai lunas
              </button>
              <button
                disabled={busy}
                onClick={() => decide(o.id, 'reject')}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-destructive hover:border-destructive disabled:opacity-60"
              >
                Tolak
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
