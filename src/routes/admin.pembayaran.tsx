import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import {
  adminListGateways,
  adminListPayments,
  adminMarkPaymentPaid,
  adminSaveGateway,
  adminSyncPayment,
  type GatewayView,
} from '@/lib/payments.functions';
import { ensureToken } from '@/lib/useAdminToken';

export const Route = createFileRoute('/admin/pembayaran')({
  head: () => ({
    meta: [
      { title: 'Pembayaran | Panel Admin JadwalEvent' },
      { name: 'description', content: 'Atur payment gateway dan pantau transaksi pembayaran.' },
      { name: 'robots', content: 'noindex' },
      { property: 'og:title', content: 'Pembayaran | Panel Admin' },
      { property: 'og:description', content: 'Atur payment gateway dan pantau transaksi.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: PembayaranPage,
});

const FIELD_LABEL: Record<string, string> = {
  api_key: 'API Key (X-API-Key)',
  api_secret: 'API Secret (X-API-Secret)',
  webhook_secret: 'Webhook Secret',
  server_key: 'Server Key',
  client_key: 'Client Key',
  merchant_id: 'Merchant ID',
  client_id: 'Client ID',
  secret_key: 'Secret Key',
};

type PaymentRow = Awaited<ReturnType<typeof adminListPayments>>[number];

const STATUS: Record<string, string> = {
  pending: 'Menunggu',
  paid: 'Lunas',
  expired: 'Kedaluwarsa',
  cancelled: 'Dibatalkan',
  failed: 'Gagal',
};

function rupiah(n: number) {
  return `Rp${(n ?? 0).toLocaleString('id-ID')}`;
}
function waktu(v: string | null) {
  return v ? new Date(v).toLocaleString('id-ID') : '-';
}

function PembayaranPage() {
  const [gateways, setGateways] = useState<GatewayView[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [status, setStatus] = useState('all');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/public/aapay-webhook`);
  }, []);

  async function load() {
    setErr('');
    try {
      const token = await ensureToken();
      const [g, p] = await Promise.all([
        adminListGateways({ data: { token } }),
        adminListPayments({ data: { token, status } }),
      ]);
      setGateways(g);
      setPayments(p);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal memuat data pembayaran.');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Tindakan gagal.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-xl font-bold">Pembayaran</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Isi kunci penyedia pembayaran di bawah. Kunci hanya disimpan di sisi server dan tidak
          pernah ditampilkan kembali — kolom yang dibiarkan kosong akan mempertahankan nilai lama,
          isi tanda “-” untuk mengosongkan.
        </p>
      </div>

      {err && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}
      {msg && <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">{msg}</p>}

      <div className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="font-medium">URL webhook untuk didaftarkan di AAPay</p>
        <code className="mt-1 block break-all rounded bg-secondary px-2 py-1 text-xs">{webhookUrl}</code>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {gateways.map((g) => (
          <GatewayCard key={g.id} g={g} busy={busy} onSave={act} />
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg font-bold">Transaksi</h2>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="all">Semua</option>
            <option value="pending">Menunggu</option>
            <option value="paid">Lunas</option>
            <option value="expired">Kedaluwarsa</option>
            <option value="cancelled">Dibatalkan</option>
            <option value="failed">Gagal</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-secondary text-left">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Pengguna</th>
                <th className="px-3 py-2">Penyedia</th>
                <th className="px-3 py-2">Nominal</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Waktu</th>
                <th className="px-3 py-2">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-border align-top">
                  <td className="px-3 py-2">
                    {p.id}
                    {p.order_id ? <span className="text-xs text-muted-foreground"> · order {p.order_id}</span> : null}
                  </td>
                  <td className="px-3 py-2">{p.user_name || p.user_id?.slice(0, 8) || '-'}</td>
                  <td className="px-3 py-2">
                    {p.gateway}
                    <br />
                    <span className="text-xs text-muted-foreground">{p.provider_order_id ?? '-'}</span>
                  </td>
                  <td className="px-3 py-2">
                    {rupiah(p.final_amount || p.amount)}
                    {p.unique_code ? (
                      <span className="text-xs text-muted-foreground"> (kode {p.unique_code})</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">{STATUS[p.status] ?? p.status}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    dibuat {waktu(p.created_at)}
                    <br />
                    lunas {waktu(p.paid_at)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <button
                        disabled={busy}
                        onClick={() =>
                          void act(
                            async () => adminSyncPayment({ data: { token: await ensureToken(), id: p.id } }),
                            'Status disegarkan dari penyedia.',
                          )
                        }
                        className="rounded-md border border-border px-2 py-1 text-xs hover:border-primary"
                      >
                        Cek status
                      </button>
                      {p.status !== 'paid' && (
                        <button
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm('Tandai transaksi ini lunas secara manual?')) return;
                            void act(
                              async () =>
                                adminMarkPaymentPaid({ data: { token: await ensureToken(), id: p.id } }),
                              'Transaksi ditandai lunas.',
                            );
                          }}
                          className="rounded-md border border-border px-2 py-1 text-xs hover:border-primary"
                        >
                          Tandai lunas
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    Belum ada transaksi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function GatewayCard({
  g,
  busy,
  onSave,
}: {
  g: GatewayView;
  busy: boolean;
  onSave: (fn: () => Promise<unknown>, ok: string) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(g.enabled);
  const [isDefault, setIsDefault] = useState(g.is_default);
  const [mode, setMode] = useState(g.mode);
  const [baseUrl, setBaseUrl] = useState(g.base_url);
  const [config, setConfig] = useState<Record<string, string>>({});

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(async () => {
          await adminSaveGateway({
            data: {
              token: await ensureToken(),
              id: g.id,
              enabled,
              is_default: isDefault,
              mode,
              base_url: baseUrl,
              config,
            },
          });
          setConfig({});
        }, `Pengaturan ${g.name} disimpan.`);
      }}
      className="space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <h3 className="font-display text-base font-bold">{g.name}</h3>
        {g.is_default && (
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">utama</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{g.id}</span>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Aktif
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Jadikan penyedia utama
        </label>
        <label className="flex items-center gap-2">
          Mode
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          >
            <option value="live">live</option>
            <option value="sandbox">sandbox</option>
          </select>
        </label>
      </div>

      <label className="block text-sm">
        Base URL
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        />
      </label>

      {g.fields.map((f) => (
        <label key={f} className="block text-sm">
          {FIELD_LABEL[f] ?? f}
          <input
            type="password"
            autoComplete="new-password"
            value={config[f] ?? ''}
            onChange={(e) => setConfig((c) => ({ ...c, [f]: e.target.value }))}
            placeholder={g.filled[f] ? '•••••• (tersimpan, biarkan kosong bila tak diubah)' : 'belum diisi'}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
        </label>
      ))}

      <button
        disabled={busy}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        Simpan {g.name}
      </button>
    </form>
  );
}
