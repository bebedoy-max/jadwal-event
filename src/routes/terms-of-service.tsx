import { createFileRoute } from '@tanstack/react-router';
import { abs } from '@/lib/site';

export const Route = createFileRoute('/terms-of-service')({
  head: () => ({
    meta: [
      { title: 'Syarat dan Ketentuan | JadwalEvent' },
      {
        name: 'description',
        content:
          'Syarat dan ketentuan penggunaan situs JadwalEvent, portal informasi jadwal event, pameran, promo, dan lomba di Indonesia.',
      },
      { property: 'og:title', content: 'Syarat dan Ketentuan | JadwalEvent' },
      {
        property: 'og:description',
        content: 'Syarat dan ketentuan penggunaan situs JadwalEvent.',
      },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: abs('/terms-of-service') },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [{ rel: 'canonical', href: abs('/terms-of-service') }],
  }),
  component: TermsOfServicePage,
});

function TermsOfServicePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-bold">Syarat dan Ketentuan Layanan</h1>
      <p className="mt-2 text-sm text-muted-foreground">Terakhir diperbarui: 12 September 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-foreground/90">
        <section>
          <h2 className="mb-2 font-display text-lg font-bold">1. Penerimaan Ketentuan</h2>
          <p>
            Dengan mengakses dan menggunakan situs JadwalEvent ("Situs"), Anda menyetujui untuk
            terikat oleh Syarat dan Ketentuan ini. Jika Anda tidak menyetujui ketentuan ini, mohon
            untuk tidak menggunakan Situs kami.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">2. Deskripsi Layanan</h2>
          <p>
            JadwalEvent adalah media informasi yang menyajikan jadwal event, acara, pameran, seminar,
            promo, bazaar, workshop, job fair, dan lomba di Indonesia. Informasi yang disajikan bersifat
            informatif dan dikumpulkan dari berbagai sumber yang kami anggap dapat dipercaya.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">3. Akurasi Informasi</h2>
          <p>
            Kami berupaya menyajikan informasi yang akurat dan terkini. Namun, jadwal, lokasi, harga
            tiket, dan detail event lainnya dapat berubah sewaktu-waktu oleh penyelenggara. Kami
            menyarankan Anda untuk selalu mengonfirmasi langsung kepada pihak penyelenggara sebelum
            menghadiri suatu event. Kami tidak bertanggung jawab atas kerugian yang timbul akibat
            perubahan, pembatalan, atau ketidakakuratan informasi event.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">4. Hak Kekayaan Intelektual</h2>
          <p>
            Seluruh konten di Situs ini — termasuk teks, desain, dan logo — dilindungi hak cipta dan
            merupakan milik JadwalEvent atau pemberi lisensinya. Anda tidak diperkenankan
            memproduksi ulang, mendistribusikan, atau menggunakan konten kami untuk tujuan komersial
            tanpa izin tertulis. Gambar atau poster event merupakan milik penyelenggara masing-masing
            dan ditampilkan untuk tujuan informasi.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">5. Konten Pengguna</h2>
          <p>
            Jika Anda mengirimkan komentar atau konten lain melalui Situs, Anda menyatakan bahwa konten
            tersebut tidak melanggar hukum, tidak mengandung SARA, ujaran kebencian, spam, atau
            pelanggaran hak pihak lain. Kami berhak menyunting, menolak, atau menghapus konten
            pengguna tanpa pemberitahuan terlebih dahulu.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">6. Iklan dan Tautan Pihak Ketiga</h2>
          <p>
            Situs ini menampilkan iklan dari pihak ketiga (misalnya Google AdSense) dan tautan ke situs
            penyelenggara event. Kami tidak mengendalikan dan tidak bertanggung jawab atas isi, produk,
            atau layanan yang ditawarkan oleh pihak ketiga tersebut.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">7. Pembatasan Tanggung Jawab</h2>
          <p>
            Situs disediakan "sebagaimana adanya" tanpa jaminan dalam bentuk apa pun. Sejauh diizinkan
            oleh hukum, kami tidak bertanggung jawab atas kerugian langsung maupun tidak langsung yang
            timbul dari penggunaan atau ketidakmampuan menggunakan Situs ini.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">8. Perubahan Ketentuan</h2>
          <p>
            Kami dapat mengubah Syarat dan Ketentuan ini sewaktu-waktu. Perubahan berlaku segera setelah
            dipublikasikan pada halaman ini. Dengan terus menggunakan Situs setelah perubahan, Anda
            dianggap menyetujui ketentuan yang diperbarui.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">9. Hukum yang Berlaku</h2>
          <p>
            Syarat dan Ketentuan ini diatur dan ditafsirkan berdasarkan hukum Republik Indonesia.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-display text-lg font-bold">10. Kontak</h2>
          <p>
            Untuk pertanyaan mengenai Syarat dan Ketentuan ini, silakan hubungi kami melalui informasi
            kontak yang tersedia di Situs.
          </p>
        </section>
      </div>
    </main>
  );
}
