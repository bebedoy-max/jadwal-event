import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { adminListAds, adminSaveAd } from '@/lib/admin.functions';
import { getToken } from '@/lib/useAdminToken';

export const Route = createFileRoute('/admin/iklan')({ component: AdminAds });

type Ad = { slot: string; label: string; code: string; enabled: boolean };

function AdminAds() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    void (async () => setAds(await adminListAds({ data: { token: getToken() } })))();
  }, []);

  const update = (slot: string, patch: Partial<Ad>) =>
    setAds((prev) => prev.map((a) => (a.slot === slot ? { ...a, ...patch } : a)));

  return (
    <div>
      <h1 className="mb-1 font-display text-xl font-bold">Slot Iklan</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Tempel kode iklan (AdSense atau banner HTML). Kosongkan untuk menyembunyikan slot.
      </p>
      <div className="space-y-4">
        {ads.map((a) => (
          <div key={a.slot} className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <span className="font-semibold">{a.label}</span>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={a.enabled}
                  onChange={(e) => update(a.slot, { enabled: e.target.checked })}
                />
                Aktif
              </label>
            </div>
            <textarea
              rows={4}
              value={a.code}
              onChange={(e) => update(a.slot, { code: e.target.value })}
              placeholder="<script>…</script> atau <img …>"
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary"
            />
            <button
              onClick={async () => {
                await adminSaveAd({
                  data: { token: getToken(), slot: a.slot, code: a.code, enabled: a.enabled },
                });
                setMsg(`Slot "${a.label}" tersimpan.`);
              }}
              className="mt-2 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground"
            >
              Simpan
            </button>
          </div>
        ))}
        {ads.length === 0 && <p className="text-muted-foreground">Memuat slot iklan…</p>}
      </div>
      {msg && <p className="mt-4 text-sm text-primary">{msg}</p>}
    </div>
  );
}
