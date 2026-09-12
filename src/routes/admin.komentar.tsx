import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { adminListComments, adminModerateComment } from '@/lib/admin.functions';
import { getToken } from '@/lib/useAdminToken';
import { formatDate } from '@/components/site';

export const Route = createFileRoute('/admin/komentar')({ component: AdminComments });

type C = { id: number; post_id: number; author_name: string; content: string; created_at: string };

function AdminComments() {
  const [status, setStatus] = useState('pending');
  const [rows, setRows] = useState<C[]>([]);

  const load = async (s = status) => {
    setRows(await adminListComments({ data: { token: getToken(), status: s } }));
  };

  useEffect(() => {
    void load(status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="font-display text-xl font-bold">Komentar</h1>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        >
          <option value="pending">Menunggu moderasi</option>
          <option value="approved">Disetujui</option>
        </select>
      </div>

      <ul className="space-y-3">
        {rows.map((c) => (
          <li key={c.id} className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-semibold">
              {c.author_name}{' '}
              <span className="font-normal text-muted-foreground">· {formatDate(c.created_at)}</span>
            </p>
            <p className="mt-1 whitespace-pre-line text-sm">{c.content}</p>
            <div className="mt-3 flex gap-3 text-sm">
              {status === 'pending' && (
                <button
                  onClick={async () => {
                    await adminModerateComment({
                      data: { token: getToken(), id: c.id, action: 'approve' },
                    });
                    void load();
                  }}
                  className="text-primary hover:underline"
                >
                  Setujui
                </button>
              )}
              <button
                onClick={async () => {
                  if (!confirm('Hapus komentar ini?')) return;
                  await adminModerateComment({
                    data: { token: getToken(), id: c.id, action: 'delete' },
                  });
                  void load();
                }}
                className="text-destructive hover:underline"
              >
                Hapus
              </button>
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="text-muted-foreground">Tidak ada komentar.</li>}
      </ul>
    </div>
  );
}
