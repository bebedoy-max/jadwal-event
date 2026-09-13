import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import {
  adminDeleteUser,
  adminListPlanOptions,
  adminListUsers,
  adminSendReset,
  adminSetSubscription,
  adminSetUserRole,
  type ManagedUser,
} from '@/lib/admin-users.functions';
import { ensureToken } from '@/lib/useAdminToken';

export const Route = createFileRoute('/admin/pengguna')({
  head: () => ({
    meta: [
      { title: 'Kelola Pengguna | Panel Admin JadwalEvent' },
      { name: 'description', content: 'Daftar pengguna, role akses, dan status langganan.' },
      { name: 'robots', content: 'noindex' },
      { property: 'og:title', content: 'Kelola Pengguna | Panel Admin' },
      { property: 'og:description', content: 'Daftar pengguna, role akses, dan langganan.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: PenggunaPage,
});

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', editor: 'Editor', user: 'Pengguna' };

function tanggal(v: string | null) {
  if (!v) return '-';
  return new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function PenggunaPage() {
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [plans, setPlans] = useState<{ id: string; name: string; days: number }[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr('');
    try {
      const token = await ensureToken();
      const [res, planList] = await Promise.all([
        adminListUsers({ data: { token, page, q } }),
        adminListPlanOptions({ data: { token } }),
      ]);
      setRows(res.users);
      setPlans(planList);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Gagal memuat daftar pengguna.');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-bold">Pengguna</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            void load();
          }}
          className="flex gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari email, nama, atau WhatsApp"
            className="w-64 rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <button className="rounded-md border border-border px-3 py-1.5 text-sm hover:border-primary">
            Cari
          </button>
        </form>
        <span className="ml-auto text-sm text-muted-foreground">{rows.length} akun ditampilkan</span>
      </div>

      {err && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</p>}
      {msg && <p className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">{msg}</p>}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="px-3 py-2">Pengguna</th>
              <th className="px-3 py-2">Kontak</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Langganan</th>
              <th className="px-3 py-2">Daftar</th>
              <th className="px-3 py-2">Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {u.avatar_url ? (
                      <img
                        src={u.avatar_url}
                        alt={u.display_name || u.email}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs">
                        {(u.display_name || u.email || '?').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <p className="font-medium">{u.display_name || '(tanpa nama)'}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      {!u.confirmed && <p className="text-xs text-destructive">Email belum dikonfirmasi</p>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {u.whatsapp || '-'}
                  <br />
                  {u.city || '-'}
                </td>
                <td className="px-3 py-2">
                  <select
                    value={u.role}
                    disabled={busy}
                    onChange={(e) =>
                      void act(
                        async () =>
                          adminSetUserRole({
                            data: {
                              token: await ensureToken(),
                              userId: u.id,
                              role: e.target.value as 'admin' | 'editor' | 'user',
                            },
                          }),
                        `Role ${u.email} diubah.`,
                      )
                    }
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    {Object.entries(ROLE_LABEL).map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={u.plan_id}
                    disabled={busy}
                    onChange={(e) =>
                      void act(
                        async () =>
                          adminSetSubscription({
                            data: { token: await ensureToken(), userId: u.id, planId: e.target.value },
                          }),
                        `Langganan ${u.email} diperbarui.`,
                      )
                    }
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {u.plan_status} · s/d {tanggal(u.expires_at)}
                  </p>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {tanggal(u.created_at)}
                  <br />
                  masuk: {tanggal(u.last_sign_in_at)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(
                          async () =>
                            adminSendReset({
                              data: {
                                token: await ensureToken(),
                                email: u.email,
                                redirectTo: `${window.location.origin}/atur-sandi`,
                              },
                            }),
                          `Email setel ulang dikirim ke ${u.email}.`,
                        )
                      }
                      className="rounded-md border border-border px-2 py-1 text-xs hover:border-primary"
                    >
                      Kirim reset sandi
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`Hapus akun ${u.email}? Tindakan ini permanen.`)) return;
                        void act(
                          async () =>
                            adminDeleteUser({ data: { token: await ensureToken(), userId: u.id } }),
                          'Akun dihapus.',
                        );
                      }}
                      className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                    >
                      Hapus akun
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Belum ada pengguna.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
        >
          Sebelumnya
        </button>
        <span>Halaman {page}</span>
        <button
          disabled={rows.length < 50}
          onClick={() => setPage((p) => p + 1)}
          className="rounded-md border border-border px-3 py-1.5 disabled:opacity-40"
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}
