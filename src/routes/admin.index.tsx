import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { adminDeletePost, adminListPosts } from '@/lib/admin.functions';
import { getToken } from '@/lib/useAdminToken';
import { formatDate } from '@/components/site';

export const Route = createFileRoute('/admin/')({ component: AdminPosts });

type Row = { id: number; title: string; slug: string; status: string; published_at: string };

function AdminPosts() {
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(true);

  const load = async (p = page, query = q) => {
    setBusy(true);
    try {
      const res = await adminListPosts({ data: { token: getToken(), q: query, page: p } });
      setRows(res.posts);
      setTotal(res.total);
      setPage(p);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-xl font-bold">Artikel ({total})</h1>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(1, q);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari judul…"
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <button className="rounded-md border border-border px-3 py-1.5 text-sm">Cari</button>
        </form>
        <Link
          to="/admin/tulis/$id"
          params={{ id: 'baru' }}
          className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          + Tulis Artikel
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-left">
            <tr>
              <th className="p-3">Judul</th>
              <th className="p-3">Status</th>
              <th className="p-3">Tanggal</th>
              <th className="p-3">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3">{r.title}</td>
                <td className="p-3">{r.status}</td>
                <td className="p-3 whitespace-nowrap">{formatDate(r.published_at)}</td>
                <td className="p-3 whitespace-nowrap">
                  <Link
                    to="/admin/tulis/$id"
                    params={{ id: String(r.id) }}
                    className="text-primary hover:underline"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={async () => {
                      if (!confirm(`Hapus "${r.title}"?`)) return;
                      await adminDeletePost({ data: { token: getToken(), id: r.id } });
                      void load(page, q);
                    }}
                    className="ml-3 text-destructive hover:underline"
                  >
                    Hapus
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {busy && <p className="p-4 text-muted-foreground">Memuat…</p>}
      </div>

      <div className="mt-4 flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => void load(page - 1, q)}
          className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          ‹ Sebelumnya
        </button>
        <span className="px-2 py-1.5 text-sm text-muted-foreground">Halaman {page}</span>
        <button
          disabled={page * 20 >= total}
          onClick={() => void load(page + 1, q)}
          className="rounded border border-border px-3 py-1.5 text-sm disabled:opacity-40"
        >
          Berikutnya ›
        </button>
      </div>
    </div>
  );
}
