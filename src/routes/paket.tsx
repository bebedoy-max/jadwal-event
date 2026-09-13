import { createFileRoute, Link } from '@tanstack/react-router';
import { useSuspenseQuery, queryOptions } from '@tanstack/react-query';
import { listPlans } from '@/lib/user.functions';

const plansQuery = queryOptions({ queryKey: ['plans'], queryFn: () => listPlans() });

export const Route = createFileRoute('/paket')({
  loader: ({ context }) => context.queryClient.ensureQueryData(plansQuery),
  head: () => ({
    meta: [
      { title: 'Paket & Harga Iklan Event | JadwalEvent' },
      {
        name: 'description',
        content:
          'Pilihan paket Pro dan paket iklan event JadwalEvent: harga, masa aktif, dan cara pengajuannya.',
      },
      { property: 'og:title', content: 'Paket & Harga Iklan Event JadwalEvent' },
      {
        property: 'og:description',
        content: 'Bandingkan paket Pro dan paket iklan event, lalu ajukan langsung dari akun Anda.',
      },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  errorComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">
      Daftar paket sedang tidak dapat dimuat. Silakan coba lagi nanti.
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">
      Halaman tidak ditemukan.
    </div>
  ),
  component: PaketPage,
});

function rupiah(n: number, currency: string) {
  if (n <= 0) return 'Gratis';
  return `${currency === 'IDR' ? 'Rp' : currency + ' '}${n.toLocaleString('id-ID')}`;
}

function PaketPage() {
  const { data: plans } = useSuspenseQuery(plansQuery);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Paket & Harga</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Pilih paket yang sesuai, lalu ajukan dari halaman profil Anda. Admin akan memverifikasi
        pengajuan dan mengaktifkan paket setelah pembayaran dikonfirmasi.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className="flex flex-col rounded-xl border border-border bg-card p-5">
            <h2 className="font-display text-xl font-bold">{p.name}</h2>
            <p className="mt-1 text-2xl font-bold text-primary">{rupiah(p.price, p.currency)}</p>
            <p className="text-xs text-muted-foreground">
              {p.days > 0 ? `Masa aktif ${p.days} hari` : 'Tanpa batas waktu'}
            </p>
            {p.description && <p className="mt-3 text-sm">{p.description}</p>}
            {p.features && (
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {p.features
                  .split('\n')
                  .filter((f) => f.trim())
                  .map((f) => (
                    <li key={f}>• {f.trim()}</li>
                  ))}
              </ul>
            )}
            <Link
              to="/profil"
              className="mt-5 rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground"
            >
              Ajukan paket ini
            </Link>
          </div>
        ))}
        {plans.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada paket yang tersedia.</p>
        )}
      </div>
    </div>
  );
}
