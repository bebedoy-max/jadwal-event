import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import {
  driveAuthUrl,
  driveList,
  driveMigrateBatch,
  driveSave,
  driveSetState,
  driveSyncRun,
  driveSyncStatus,
  driveUpload,
  type DriveAccountView,
} from '@/lib/gdrive.functions';
import { ensureToken } from '@/lib/useAdminToken';

export const Route = createFileRoute('/admin/drive')({ component: AdminDrive });

type Form = { id?: string; label: string; client_id: string; client_secret: string; root_folder_name: string };

type SyncStatus = Awaited<ReturnType<typeof driveSyncStatus>>;

const EMPTY: Form = { label: 'Google Drive', client_id: '', client_secret: '', root_folder_name: 'Media Situs' };

function AdminDrive() {
  const [accounts, setAccounts] = useState<DriveAccountView[]>([]);
  const [redirectUri, setRedirectUri] = useState('');
  const [form, setForm] = useState<Form>(EMPTY);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [backupArticles, setBackupArticles] = useState(true);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const stopRef = useRef(false);

  const active = accounts.find((a) => a.is_active && a.enabled);
  const canSync = Boolean(active?.connected);

  const load = async () => {
    const token = await ensureToken();
    if (!token) {
      setErr('Sesi berakhir. Silakan keluar lalu masuk kembali.');
      return;
    }
    const res = await driveList({ data: { token } });
    setAccounts(res.accounts);
    setRedirectUri(res.redirectUri);
  };

  const loadStatus = async () => {
    const token = await ensureToken();
    if (!token) return;
    setStatus(await driveSyncStatus({ data: { token } }));
  };

  useEffect(() => {
    load().catch((e: unknown) =>
      setErr(e instanceof Error ? e.message : 'Gagal memuat data Google Drive.'),
    );
    loadStatus().catch(() => undefined);
    const onMsg = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data?.type === 'gdriveConnected') {
        setMsg('Akun Google Drive berhasil terhubung.');
        load().catch(() => setErr('Gagal memuat data Google Drive.'));
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErr('');
    setMsg('');
    try {
      await fn();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Terjadi kesalahan.');
    } finally {
      setBusy(false);
    }
  };

  const connect = (id: string) =>
    run(async () => {
      const popup = window.open('', 'gdrive', 'width=520,height=680');
      if (!popup) throw new Error('Popup diblokir. Izinkan popup lalu coba lagi.');
      try {
        const { url } = await driveAuthUrl({ data: { token: await ensureToken(), id } });
        popup.location.href = url;
      } catch (e) {
        popup.close();
        throw e;
      }
    });

  const migrate = async () => {
    if (!fromId || !toId || fromId === toId) {
      setErr('Pilih akun asal dan akun tujuan yang berbeda.');
      return;
    }
    if (!confirm('Pindahkan semua media ke akun tujuan? Proses bisa berjalan lama.')) return;
    setMigrating(true);
    setErr('');
    setMsg('');
    let total = 0;
    try {
      for (;;) {
        const res = await driveMigrateBatch({ data: { token: await ensureToken(), fromId, toId, limit: 5 } });
        total += res.moved;
        setProgress(`${total} berkas dipindahkan, sisa ${res.remaining}…`);
        if (res.errors.length) setErr(res.errors.slice(0, 3).join(' · '));
        if (res.remaining === 0 || res.moved === 0) break;
      }
      setMsg(`Migrasi selesai. ${total} berkas kini tersimpan di akun tujuan.`);
      setProgress('');
      await run(async () => {
        await driveSetState({ data: { token: await ensureToken(), id: toId, action: 'activate' } });
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Migrasi gagal.');
    } finally {
      setMigrating(false);
    }
  };

  const syncAll = async (reset: boolean) => {
    if (
      reset &&
      !confirm('Mulai pemindahan dari artikel pertama lagi? Berkas yang sudah ada tidak diunggah ulang.')
    )
      return;
    setSyncing(true);
    stopRef.current = false;
    setErr('');
    setMsg('');
    setSyncProgress('Memulai…');
    try {
      let first = reset;
      for (;;) {
        const res = await driveSyncRun({
          data: { token: await ensureToken(), reset: first, articles: backupArticles, batch: 6 },
        });
        first = false;
        setStatus({
          offset: res.offset,
          total: res.total,
          files: status?.files ?? 0,
          done: res.done,
          stats: res.stats,
        });
        setSyncProgress(
          `${res.offset.toLocaleString('id-ID')}/${res.total.toLocaleString('id-ID')} artikel diproses…`,
        );
        if (res.stats.lastError) setErr(res.stats.lastError);
        if (res.done) {
          setMsg('Pemindahan selesai. Semua artikel sudah diproses.');
          break;
        }
        if (stopRef.current) {
          setMsg('Pemindahan dihentikan. Posisi tersimpan, tinggal klik "Lanjutkan pemindahan".');
          break;
        }
      }
      await loadStatus();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Pemindahan gagal.');
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-xl font-bold">Penyimpanan Google Drive</h1>
        <p className="text-sm text-muted-foreground">
          Simpan gambar, video, dan berkas artikel di Google Drive, bukan di hosting. Alamat media di
          situs tetap sama walau akun Drive diganti.
        </p>
      </div>

      {/* Daftar akun */}
      <div className="space-y-3">
        {accounts.map((a) => (
          <div key={a.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-semibold">{a.label}</span>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                {a.connected ? (a.email ?? 'Terhubung') : 'Belum terhubung'}
              </span>
              {a.is_active && (
                <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                  Aktif
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                Folder: {a.root_folder_name} · {a.file_count} berkas
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <button
                disabled={busy}
                onClick={() => connect(a.id)}
                className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground"
              >
                {a.connected ? 'Hubungkan ulang' : 'Hubungkan'}
              </button>
              <button
                disabled={busy || a.is_active}
                onClick={() =>
                  run(async () => {
                    await driveSetState({ data: { token: await ensureToken(), id: a.id, action: 'activate' } });
                  })
                }
                className="rounded-md border border-border px-3 py-1.5 disabled:opacity-50"
              >
                Jadikan aktif
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  setForm({
                    id: a.id,
                    label: a.label,
                    client_id: a.client_id,
                    client_secret: '',
                    root_folder_name: a.root_folder_name,
                  })
                }
                className="rounded-md border border-border px-3 py-1.5"
              >
                Ubah
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await driveSetState({ data: { token: await ensureToken(), id: a.id, action: 'disconnect' } });
                  })
                }
                className="rounded-md border border-border px-3 py-1.5"
              >
                Putuskan
              </button>
              <button
                disabled={busy || a.file_count > 0}
                title={a.file_count > 0 ? 'Pindahkan dulu berkasnya' : ''}
                onClick={() => {
                  if (!confirm('Hapus akun ini dari daftar?')) return;
                  void run(async () => {
                    await driveSetState({ data: { token: await ensureToken(), id: a.id, action: 'delete' } });
                  });
                }}
                className="rounded-md border border-border px-3 py-1.5 text-destructive disabled:opacity-50"
              >
                Hapus
              </button>
            </div>
          </div>
        ))}
        {accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada akun Google Drive.</p>
        )}
      </div>

      {/* Form akun */}
      <form
        className="space-y-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await driveSave({ data: { token: await ensureToken(), ...form } });
            setForm(EMPTY);
            setMsg('Pengaturan tersimpan.');
          });
        }}
      >
        <h2 className="font-semibold">{form.id ? 'Ubah akun' : 'Tambah akun Google Drive'}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nama akun">
            <input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="inp"
            />
          </Field>
          <Field label="Nama folder root di Drive">
            <input
              value={form.root_folder_name}
              onChange={(e) => setForm({ ...form, root_folder_name: e.target.value })}
              className="inp"
            />
          </Field>
          <Field label="Google OAuth Client ID">
            <input
              required
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: e.target.value })}
              placeholder="xxxx.apps.googleusercontent.com"
              className="inp"
            />
          </Field>
          <Field label={`Google OAuth Client Secret${form.id ? ' (isi untuk mengganti)' : ''}`}>
            <input
              type="password"
              value={form.client_secret}
              onChange={(e) => setForm({ ...form, client_secret: e.target.value })}
              className="inp"
            />
          </Field>
          <Field label="Authorized redirect URI (daftarkan di Google Cloud Console)">
            <input readOnly value={redirectUri} className="inp" onFocus={(e) => e.target.select()} />
          </Field>
        </div>
        <div className="flex gap-2">
          <button
            disabled={busy}
            className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground"
          >
            Simpan konfigurasi
          </button>
          {form.id && (
            <button
              type="button"
              onClick={() => setForm(EMPTY)}
              className="rounded-md border border-border px-4 py-1.5 text-sm"
            >
              Batal
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Cara setup: buka Google Cloud Console → APIs &amp; Services → Credentials → buat OAuth client
          ID tipe Web application, aktifkan Google Drive API, tambahkan redirect URI di atas, lalu
          tempel Client ID &amp; Secret di sini dan klik Hubungkan.
        </p>
      </form>

      {/* Unggah uji coba */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-2 font-semibold">Unggah media ke Drive aktif</h2>
        <input
          type="file"
          className="text-sm"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            await run(async () => {
              const buf = new Uint8Array(await file.arrayBuffer());
              let bin = '';
              for (let i = 0; i < buf.length; i += 8192) {
                bin += String.fromCharCode(...buf.subarray(i, i + 8192));
              }
              const res = await driveUpload({
                data: {
                  token: await ensureToken(),
                  name: file.name,
                  mime: file.type,
                  dataBase64: btoa(bin),
                },
              });
              setMsg(`Berhasil diunggah. Alamat media: ${res.url}`);
            });
            e.target.value = '';
          }}
        />
      </div>

      {/* Sinkronisasi semua media ke Drive */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-1 font-semibold">Pindahkan semua isi situs ke Drive</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Menyalin semua gambar, video, dan cadangan artikel ke akun Drive aktif
          {active ? ` (${active.label})` : ''}. Proses berjalan bertahap dan selalu melanjutkan dari
          posisi terakhir, jadi boleh dihentikan lalu diteruskan kapan saja.
        </p>
        {status && (
          <div className="mb-3 rounded-md bg-muted p-3 text-sm">
            <p>
              Artikel diproses: <strong>{status.offset.toLocaleString('id-ID')}</strong> dari{' '}
              {status.total.toLocaleString('id-ID')} · berkas di Drive:{' '}
              <strong>{status.files.toLocaleString('id-ID')}</strong>
            </p>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-background">
              <div
                className="h-full bg-primary transition-all"
                style={{
                  width: `${status.total ? Math.min(100, (status.offset / status.total) * 100) : 0}%`,
                }}
              />
            </div>
            {status.stats.updatedAt && (
              <p className="mt-2 text-muted-foreground">
                {status.stats.uploaded.toLocaleString('id-ID')} berkas baru ·{' '}
                {status.stats.articles.toLocaleString('id-ID')} cadangan artikel ·{' '}
                {status.stats.missing.toLocaleString('id-ID')} tidak ditemukan
              </p>
            )}
            {status.done && <p className="mt-1 text-primary">Semua artikel sudah diproses.</p>}
          </div>
        )}
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={backupArticles}
            onChange={(e) => setBackupArticles(e.target.checked)}
            disabled={syncing}
          />
          Simpan juga cadangan isi artikel (berkas HTML) di Drive
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={syncing || busy || !canSync}
            title={canSync ? '' : 'Hubungkan dan aktifkan akun Google Drive dulu'}
            onClick={() => void syncAll(false)}
            className="rounded-md bg-primary px-4 py-1.5 text-sm text-primary-foreground disabled:opacity-60"
          >
            {syncing ? 'Memindahkan…' : 'Lanjutkan pemindahan'}
          </button>
          {syncing && (
            <button
              onClick={() => {
                stopRef.current = true;
                setSyncProgress('Berhenti setelah putaran ini selesai…');
              }}
              className="rounded-md border border-border px-4 py-1.5 text-sm"
            >
              Hentikan
            </button>
          )}
          <button
            disabled={syncing || busy || !canSync}
            onClick={() => void syncAll(true)}
            className="rounded-md border border-border px-4 py-1.5 text-sm disabled:opacity-60"
          >
            Ulang dari awal
          </button>
        </div>
        {!canSync && (
          <p className="mt-2 text-sm text-muted-foreground">
            Tombol aktif setelah ada akun Drive yang terhubung ke Google dan berstatus aktif.
          </p>
        )}
        {syncProgress && <p className="mt-2 text-sm text-muted-foreground">{syncProgress}</p>}
      </div>

      {/* Migrasi */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-1 font-semibold">Pindah akun Google Drive</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Salin seluruh berkas dari akun lama ke akun baru. Alamat media di artikel tidak berubah,
          jadi semua gambar tetap tampil normal setelah pindah.
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="inp w-auto">
            <option value="">Akun asal…</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.file_count} berkas)
              </option>
            ))}
          </select>
          <span>→</span>
          <select value={toId} onChange={(e) => setToId(e.target.value)} className="inp w-auto">
            <option value="">Akun tujuan…</option>
            {accounts
              .filter((a) => a.connected)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
          </select>
          <button
            disabled={migrating || busy}
            onClick={() => void migrate()}
            className="rounded-md bg-primary px-4 py-1.5 text-primary-foreground disabled:opacity-60"
          >
            {migrating ? 'Memindahkan…' : 'Mulai migrasi'}
          </button>
        </div>
        {progress && <p className="mt-2 text-sm text-muted-foreground">{progress}</p>}
      </div>

      {msg && <p className="text-sm text-primary">{msg}</p>}
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
