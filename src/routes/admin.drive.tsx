import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileText,
  FolderSync,
  HardDrive,
  Image as ImageIcon,
  Plus,
  Settings,
  Video,
} from 'lucide-react';
import {
  driveAddAccount,
  driveAuthUrl,
  driveList,
  driveMigrateBatch,
  driveSave,
  driveSetState,

  type DriveAccountView,
  type DriveStorageSummary,
} from '@/lib/gdrive.functions';
import { ensureToken } from '@/lib/useAdminToken';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/admin/drive')({
  head: () => ({
    meta: [
      { title: 'Google Drive | Panel Admin JadwalEvent' },
      { name: 'description', content: 'Kelola akun dan pemindahan media Google Drive JadwalEvent.' },
      { name: 'robots', content: 'noindex' },
      { property: 'og:title', content: 'Google Drive | Panel Admin JadwalEvent' },
      { property: 'og:description', content: 'Kelola akun dan pemindahan media Google Drive JadwalEvent.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: AdminDrive,
});

const EMPTY_STORAGE: DriveStorageSummary = {
  images: 0,
  videos: 0,
  articles: 0,
  others: 0,
  files: 0,
  total_size: 0,
};

function AdminDrive() {
  const [accounts, setAccounts] = useState<DriveAccountView[]>([]);
  const [redirectUri, setRedirectUri] = useState('');
  const [configured, setConfigured] = useState(false);
  const [storage, setStorage] = useState<DriveStorageSummary>(EMPTY_STORAGE);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [progress, setProgress] = useState('');

  const load = async () => {
    const token = await ensureToken();
    if (!token) {
      setErr('Sesi berakhir. Silakan keluar lalu masuk kembali.');
      return;
    }
    const res = await driveList({ data: { token } });
    setAccounts(res.accounts);
    setRedirectUri(res.redirectUri);
    setConfigured(res.configured);
    setClientId(res.masterClientId);
    setStorage(res.storage);
  };

  useEffect(() => {
    load().catch((e: unknown) =>
      setErr(e instanceof Error ? e.message : 'Gagal memuat data Google Drive.'),
    );
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

  const openConnectPopup = async (id: string) => {
    const popup = window.open('', 'gdrive', 'width=520,height=680');
    if (!popup) throw new Error('Popup diblokir. Izinkan popup lalu coba lagi.');
    try {
      const { url } = await driveAuthUrl({ data: { token: await ensureToken(), id } });
      popup.location.href = url;
    } catch (e) {
      popup.close();
      throw e;
    }
  };

  const connect = (id: string) => run(() => openConnectPopup(id));

  // Tambah akun: buat baris akun memakai kredensial master, lalu langsung buka login Google.
  const addAccount = () =>
    run(async () => {
      const { id } = await driveAddAccount({ data: { token: await ensureToken() } });
      await openConnectPopup(id);
    });

  const migrate = async () => {
    if (!fromId || !toId) {
      setErr('Pilih akun asal dan akun tujuan.');
      return;
    }
    if (fromId === toId) {
      setErr('Akun asal dan akun tujuan tidak boleh sama.');
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

  const sourceAccount = accounts.find((account) => account.id === fromId);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold">Penyimpanan Google Drive</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kelola akun penyimpanan situs dan pindahkan data antar-akun saat diperlukan.
        </p>
      </header>

      <details className="group rounded-lg border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
            <Settings className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Pengaturan Google master</span>
            <span className="block text-sm text-muted-foreground">
              {configured ? 'Sudah siap dan berlaku untuk semua akun' : 'Belum diatur — isi sebelum menambah akun'}
            </span>
          </span>
          <span className={`hidden items-center gap-1.5 text-xs font-medium sm:flex ${configured ? 'text-primary' : 'text-destructive'}`}>
            {configured && <CheckCircle2 className="size-4" />}
            {configured ? 'Siap' : 'Perlu diatur'}
          </span>
          <ChevronDown className="size-5 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <form
          className="space-y-4 border-t border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await driveSave({
                data: { token: await ensureToken(), client_id: clientId, client_secret: clientSecret },
              });
              setClientSecret('');
              setMsg('Pengaturan Google master tersimpan.');
            });
          }}
        >
          <p className="text-sm text-muted-foreground">
            Client ID dan Secret hanya diatur sekali. Setelah itu, akun lain cukup ditambahkan melalui tombol login Google.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Google OAuth Client ID">
              <input required value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="xxxx.apps.googleusercontent.com" className="inp" />
            </Field>
            <Field label={`Google OAuth Client Secret${configured ? ' (kosongkan bila tidak diganti)' : ''}`}>
              <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} className="inp" />
            </Field>
            <div className="md:col-span-2">
              <Field label="Authorized redirect URI (daftarkan di Google Cloud Console)">
                <input readOnly value={redirectUri} className="inp" onFocus={(e) => e.target.select()} />
              </Field>
            </div>
          </div>
          <Button disabled={busy}>Simpan pengaturan</Button>
        </form>
      </details>

      <section className="rounded-lg border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-bold">Akun Google Drive</h2>
            <p className="text-sm text-muted-foreground">Akun aktif menerima semua unggahan media baru.</p>
          </div>
          <Button disabled={busy || !configured} title={configured ? 'Tambah akun Google Drive' : 'Atur Google master terlebih dahulu'} onClick={() => void addAccount()}>
            <Plus /> Tambah akun Google Drive
          </Button>
        </div>
        {!configured && (
          <div className="border-b border-border bg-accent px-4 py-3 text-sm text-accent-foreground">
            Buka Pengaturan Google master di atas dan simpan konfigurasinya terlebih dahulu.
          </div>
        )}
        <div className="divide-y divide-border">
          {accounts.map((a) => (
            <div key={a.id} className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground"><HardDrive className="size-5" /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{a.label}</span>
                      {a.is_active && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Aktif</span>}
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{a.connected ? (a.email ?? 'Akun Google terhubung') : 'Belum login ke Google'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{a.file_count.toLocaleString('id-ID')} berkas · {formatSize(a.total_size)} · Folder {a.root_folder_name}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => connect(a.id)} disabled={busy}>{a.connected ? 'Hubungkan ulang' : 'Login Google'}</Button>
                  <Button size="sm" variant="outline" disabled={busy || a.is_active || !a.connected} onClick={() => run(async () => { await driveSetState({ data: { token: await ensureToken(), id: a.id, action: 'activate' } }); })}>Jadikan aktif</Button>
                  <Button size="sm" variant="outline" disabled={busy || !a.connected} onClick={() => run(async () => { await driveSetState({ data: { token: await ensureToken(), id: a.id, action: 'disconnect' } }); })}>Putuskan</Button>
                  <Button size="sm" variant="ghost" disabled={busy || a.file_count > 0} title={a.file_count > 0 ? 'Pindahkan berkas akun ini terlebih dahulu' : 'Hapus akun'} onClick={() => { if (confirm('Hapus akun ini dari daftar?')) void run(async () => { await driveSetState({ data: { token: await ensureToken(), id: a.id, action: 'delete' } }); }); }} className="text-destructive hover:text-destructive">Hapus</Button>
                </div>
              </div>
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Belum ada akun Google Drive yang ditambahkan.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground"><FolderSync className="size-4" /></span>
            <div>
              <h2 className="font-display text-lg font-bold">Migrasi antar-akun</h2>
              <p className="text-sm text-muted-foreground">Pindahkan seluruh data dari akun lama ke akun baru tanpa mengubah alamat media di artikel.</p>
            </div>
          </div>
        </div>
        <div className="space-y-5 p-4">
          <div>
            <p className="mb-3 text-sm font-medium">Data tersimpan saat ini</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat icon={<ImageIcon />} label="Gambar" value={storage.images} />
              <Stat icon={<Video />} label="Video" value={storage.videos} />
              <Stat icon={<FileText />} label="Artikel" value={storage.articles} />
              <Stat icon={<HardDrive />} label="Total ukuran" value={formatSize(storage.total_size)} />
            </div>
            {storage.others > 0 && <p className="mt-2 text-xs text-muted-foreground">Termasuk {storage.others.toLocaleString('id-ID')} berkas lain.</p>}
          </div>

          <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
            <Field label="Akun asal">
              <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="inp">
                <option value="">Pilih akun asal…</option>
                {accounts.filter((a) => a.id !== toId).map((a) => <option key={a.id} value={a.id}>{a.email ?? a.label} ({a.file_count} berkas)</option>)}
              </select>
            </Field>
            <ArrowRight className="mx-auto mb-2 hidden size-5 text-muted-foreground md:block" />
            <Field label="Akun tujuan">
              <select value={toId} onChange={(e) => setToId(e.target.value)} className="inp">
                <option value="">Pilih akun tujuan…</option>
                {accounts.filter((a) => a.connected && a.id !== fromId).map((a) => <option key={a.id} value={a.id}>{a.email ?? a.label}</option>)}
              </select>
            </Field>
          </div>
          {sourceAccount && (
            <p className="rounded-md bg-secondary px-3 py-2 text-sm text-secondary-foreground">
              Akan dipindahkan: {sourceAccount.image_count.toLocaleString('id-ID')} gambar, {sourceAccount.video_count.toLocaleString('id-ID')} video, {sourceAccount.article_count.toLocaleString('id-ID')} artikel, total {formatSize(sourceAccount.total_size)}.
            </p>
          )}
          <Button disabled={migrating || busy || !fromId || !toId || fromId === toId} onClick={() => void migrate()}>
            <FolderSync /> {migrating ? 'Sedang memindahkan…' : 'Mulai migrasi'}
          </Button>
          {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
        </div>
      </section>

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

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-background p-3">
      <span className="text-primary [&_svg]:size-5">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <strong className="block truncate text-lg font-semibold">{typeof value === 'number' ? value.toLocaleString('id-ID') : value}</strong>
      </span>
    </div>
  );
}
