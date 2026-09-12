# Deploy ke Cloudflare Pages

Situs ini bukan situs statis: ada bagian server (login admin, akses database,
penyaji gambar dari Google Drive). Karena itu build-nya memakai preset
**Cloudflare Pages + Worker** dari Nitro, yang menghasilkan `dist/` berisi
aset statis **dan** `dist/_worker.js`.

## 1. Pengaturan proyek di Cloudflare Pages

Buat proyek Pages baru dari repositori GitHub, lalu isi:

| Kolom | Nilai |
| --- | --- |
| Framework preset | None |
| Build command | `bun run build:cf` (atau `npm run build:cf`) |
| Build output directory | `dist` |
| Root directory | (kosong / root repo) |

Kalau memakai npm, pastikan `package-lock.json` ikut ter-commit. Repo ini
memakai `bun.lock`, jadi build command `bun run build:cf` paling aman.

## 2. Runtime (wajib)

Di **Settings → Functions / Runtime** proyek Pages:

- Compatibility flags: `nodejs_compat` — untuk **Production** dan **Preview**
- Compatibility date: `2025-07-13` atau lebih baru

Tanpa flag ini Worker gagal jalan (kode server memakai modul Node seperti
`crypto` dan `buffer`).

## 3. Environment variables

Tambahkan di **Settings → Environment variables**, untuk **Production** dan
**Preview**. Semua ini dipakai di sisi server saja (jangan diberi awalan
`VITE_`, supaya tidak ikut terkirim ke browser).

| Nama | Wajib | Keterangan |
| --- | --- | --- |
| `SELFHOST_SB_URL` | ya | Alamat API Supabase Anda, mis. `https://sb.domainanda.com`. Harus `https`. |
| `SELFHOST_SB_PUBLISHABLE_KEY` | ya | Kunci publik (anon) Supabase. |
| `SELFHOST_SB_SERVICE_ROLE_KEY` | ya | Kunci service role Supabase. **Rahasia** — simpan sebagai Secret, bukan plaintext. |
| `NITRO_PRESET` | opsional | `cloudflare_pages`. Sudah diatur oleh `build:cf`; tambahkan saja bila memakai build command lain. |
| `NODE_VERSION` | opsional | `22` — kalau build memakai npm/node. |
| `FM_BASE_URL` | opsional | Alamat File Manager server lama (sumber gambar lama). |
| `FM_ROOT` | opsional | Folder root uploads di server lama, mis. `public_html/wp-content/uploads`. |
| `FM_USER` | opsional | User Basic Auth File Manager lama. |
| `FM_PASS` | opsional | Password Basic Auth File Manager lama. **Secret**. |

Empat variabel `FM_*` hanya dibutuhkan selama migrasi media lama belum
selesai. Setelah semua berkas pindah ke Google Drive, keempatnya bisa dihapus;
kalau kosong, aplikasi otomatis mencoba arsip web sebagai cadangan terakhir.

Kredensial Google Drive (Client ID, Client Secret, refresh token) **tidak**
disimpan sebagai environment variable — semuanya ada di tabel
`gdrive_accounts` di database dan diatur dari halaman `/admin` → Drive.

## 4. Google OAuth (Drive)

Alamat balikan mengikuti domain yang sedang dipakai. Di Google Cloud Console →
Credentials → OAuth client, daftarkan **Authorized redirect URI** untuk setiap
domain yang akan dipakai:

```
https://<domain-anda>/api/public/google-drive/callback
https://<nama-proyek>.pages.dev/api/public/google-drive/callback
```

## 5. Database

Jalankan `db/schema.sql` di Supabase Studio (sekali saja), lalu buat user admin
dan tambahkan barisnya di `user_roles` dengan `role = 'admin'`.

## 6. Uji lokal seperti di Cloudflare

```sh
bun run build:cf
npx wrangler pages dev dist --compatibility-flag nodejs_compat
```

Untuk uji lokal, taruh nilai environment variable di `.dev.vars` (sudah
diabaikan git). Lihat `.dev.vars.example`.
