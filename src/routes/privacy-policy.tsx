import { createFileRoute } from '@tanstack/react-router';
import { abs } from '@/lib/site';

export const Route = createFileRoute('/privacy-policy')({
  head: () => ({
    meta: [
      { title: 'Kebijakan Privasi | JadwalEvent' },
      {
        name: 'description',
        content:
          'Kebijakan privasi JadwalEvent mengenai pengumpulan, penggunaan, dan perlindungan data pengguna situs informasi jadwal event, pameran, promo, dan lomba.',
      },
      { property: 'og:title', content: 'Kebijakan Privasi | JadwalEvent' },
      {
        property: 'og:description',
        content: 'Kebijakan privasi JadwalEvent mengenai pengumpulan dan penggunaan data pengguna.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: abs('/privacy-policy') },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [{ rel: 'canonical', href: abs('/privacy-policy') }],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Kebijakan Privasi</h1>
      <p className="mt-2 text-sm text-muted-foreground">Terakhir diperbarui: 12 September 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="mb-2 font-display text-lg font-bold">1. Pendahuluan</h2>
          <p>
            JadwalEvent ("kami") adalah situs yang menyajikan informasi jadwal event, acara, pameran,
            seminar, promo, bazaar, workshop, job fair, dan lomba di Indonesia. Kebijakan Privasi ini
            menjelaskan bagaimana kami mengumpulkan, menggunakan, dan melindungi informasi Anda saat
            mengunjungi situs kami.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">2. Informasi yang Kami Kumpulkan</h2>
          <p>Kami dapat mengumpulkan informasi berikut:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>
              <strong>Data teknis otomatis</strong> seperti alamat IP, jenis peramban, perangkat, dan
              halaman yang dikunjungi, melalui berkas log server dan alat analitik.
            </li>
            <li>
              <strong>Komentar</strong> — jika Anda menuliskan komentar pada artikel, nama dan isi
              komentar yang Anda kirimkan akan kami simpan dan tampilkan.
            </li>
            <li>
              <strong>Kuki (cookies)</strong> — kami dan mitra periklanan kami dapat menggunakan kuki
              untuk meningkatkan pengalaman pengguna dan menampilkan iklan yang relevan.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">3. Penggunaan Informasi</h2>
          <p>Informasi yang dikumpulkan digunakan untuk:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>Menyajikan dan meningkatkan konten serta layanan situs;</li>
            <li>Menganalisis lalu lintas dan perilaku pengunjung secara agregat;</li>
            <li>Menampilkan iklan dari mitra periklanan (misalnya Google AdSense);</li>
            <li>Menjaga keamanan dan mencegah penyalahgunaan layanan.</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">4. Google AdSense dan Kuki Pihak Ketiga</h2>
          <p>
            Situs ini dapat menampilkan iklan yang disediakan oleh Google dan mitranya. Google
            menggunakan kuki, termasuk kuki DART, untuk menayangkan iklan berdasarkan kunjungan Anda ke
            situs ini dan situs lain di internet. Anda dapat menonaktifkan personalisasi iklan melalui{' '}
            <a
              href="https://adssettings.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Setelan Iklan Google
            </a>
            . Penggunaan kuki iklan oleh Google diatur dalam{' '}
            <a
              href="https://policies.google.com/technologies/ads"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Kebijakan Periklanan Google
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">5. Tautan ke Situs Pihak Ketiga</h2>
          <p>
            Konten kami dapat memuat tautan ke situs web pihak ketiga, termasuk tautan ke penyelenggara
            event. Kami tidak bertanggung jawab atas praktik privasi atau isi situs-situs tersebut.
            Silakan membaca kebijakan privasi masing-masing situs yang Anda kunjungi.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">6. Keamanan Data</h2>
          <p>
            Kami menerapkan langkah-langkah teknis dan organisasi yang wajar untuk melindungi informasi
            yang kami kelola dari akses, penggunaan, atau pengungkapan yang tidak sah. Namun, tidak ada
            metode transmisi data melalui internet yang sepenuhnya aman.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">7. Hak Pengguna</h2>
          <p>
            Anda dapat menghubungi kami untuk meminta penghapusan komentar atau data pribadi yang Anda
            kirimkan melalui situs ini. Kami akan menindaklanjuti permintaan yang sah sesuai
            peraturan perundang-undangan yang berlaku.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">8. Perubahan Kebijakan</h2>
          <p>
            Kami dapat memperbarui Kebijakan Privasi ini dari waktu ke waktu. Perubahan akan
            dipublikasikan pada halaman ini dengan tanggal pembaruan terbaru.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">9. Kontak</h2>
          <p>
            Jika Anda memiliki pertanyaan mengenai Kebijakan Privasi ini, silakan hubungi kami melalui
            formulir kontak atau alamat email yang tercantum pada situs ini.
          </p>
        </section>
      </div>
    </main>
  );
}
