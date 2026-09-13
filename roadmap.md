# Roadmap — Rekonstruksi jadwalevent.web.id ke Supabase self-hosted

- [x] Unduh JE.zip (backup WordPress) + dump SQL dari Google Drive
- [x] Parse dump MySQL -> JSONL (posts, terms, taxonomy, relationships, comments, users)
- [x] Ubah data ke format tabel baru (17.024 artikel, 60 kategori, 11.229 tag, 48.871 relasi kategori, 92.263 relasi tag, 8 komentar)
- [x] Skema Postgres: db/schema.sql (RLS + grant + slot iklan + role admin)
- [x] Skrip impor: scripts/import_supabase.py
- [x] Frontend: beranda, kategori, tag, pencarian, paginasi
- [x] Halaman artikel lengkap + artikel terkait + komentar pembaca
- [x] Panel admin: login, daftar/tulis/edit/hapus artikel, moderasi komentar, slot iklan
- [ ] BLOKIR: alamat Supabase (SELFHOST_SB_URL) masih balas 404 — perlu URL Kong/API gateway yang benar
- [ ] Jalankan db/schema.sql di Supabase Studio
- [ ] Buat user admin + baris di user_roles (role = admin)
- [ ] Jalankan impor data
- [ ] Jalankan blok SQL Google Drive (gdrive_accounts + media_assets) di Supabase
- [x] Rapikan halaman Google Drive: pengaturan master tersembunyi, daftar akun, dan ringkasan data migrasi
- [x] Tautan "Pengajuan Paket" di navigasi panel admin
- [x] Tombol suka + bagikan (WhatsApp, Facebook, salin tautan) di halaman artikel
- [x] Komentar tertaut akun yang sedang masuk (nama & foto otomatis, tamu tetap boleh)
- [ ] Menunggu db/schema.sql dijalankan di Supabase (halaman /paket masih error selama tabel belum ada)
