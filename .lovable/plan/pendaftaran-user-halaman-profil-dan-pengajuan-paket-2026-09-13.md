# Pendaftaran user, halaman profil, dan pengajuan paket

Mengubah tombol "Masuk Admin" di pojok kanan atas menjadi pintu masuk untuk semua orang: bisa daftar akun baru, masuk lewat email/kata sandi atau Google, punya halaman profil sendiri, mengganti foto profil, melihat status langganan, dan mengajukan paket iklan/pro.

## Yang akan dibuat

**1. Tombol kanan atas**
- Belum masuk: "Masuk / Daftar".
- Sudah masuk: foto profil kecil + nama, dengan menu berisi "Profil Saya", "Panel Admin" (hanya untuk admin), dan "Keluar".

**2. Halaman Masuk / Daftar**
- Dua tab: Masuk dan Daftar.
- Daftar memerlukan nama, email, kata sandi. Setelah daftar muncul pesan "cek email Anda untuk konfirmasi" karena verifikasi email diwajibkan.
- Tombol "Lanjutkan dengan Google".
- Tautan "Lupa kata sandi" + halaman setel kata sandi baru.

**3. Halaman Profil Saya**
- Data diri: nama tampilan, nama lengkap, nomor WhatsApp, kota, situs/media sosial, bio — bisa diubah dan disimpan.
- Foto profil: unggah/ganti, disimpan ke akun Google Drive aktif seperti media lainnya.
- Kartu status langganan: paket saat ini (Gratis / Pro), masa berlaku, tombol upgrade.
- Riwayat pengajuan: daftar pengajuan paket iklan/event beserta statusnya (menunggu, disetujui, ditolak, lunas).
- Form "Ajukan paket": pilih paket, isi keterangan/tautan event, kirim.

**4. Paket & pengajuan**
- Daftar paket disimpan di database (nama, harga, masa aktif, keterangan) agar bisa diubah tanpa mengubah kode.
- Halaman publik "Paket & Harga" yang menampilkan paket dan mengarahkan ke pengajuan.
- Pengajuan masuk ke daftar admin baru: "Pengajuan Paket" untuk disetujui/ditolak; menyetujui otomatis mengaktifkan langganan user.

**5. Interaksi user (dasar)**
- Komentar kini tertaut ke akun yang sedang masuk (nama & foto otomatis); tamu tetap boleh berkomentar.
- Tombol suka pada artikel untuk user yang sudah masuk, dan tombol bagikan untuk semua.

## Pembayaran online

Anda memilih pembayaran online. Pembayaran otomatis akan dipasang sebagai langkah berikutnya setelah dasar akun di atas jalan, karena butuh keputusan penyedia pembayaran (untuk pasar Indonesia biasanya Midtrans atau Xendit; pembayaran bawaan Lovable memerlukan paket berbayar Lovable). Pada tahap ini pengajuan paket sudah tercatat lengkap dan admin bisa menandai lunas secara manual, jadi tidak ada pekerjaan yang terbuang saat pembayaran otomatis ditambahkan.

Beri tahu penyedia pembayaran yang Anda inginkan, dan itu akan disambungkan ke pengajuan paket yang sama.

## Yang perlu Anda lakukan

- Menjalankan satu blok SQL tambahan di Supabase Studio (akan disiapkan di `db/schema.sql`) untuk tabel profil, paket, langganan, pengajuan, dan suka.
- Mengaktifkan Google di pengaturan Auth Supabase Anda (Client ID & Secret Google) agar tombol Google berfungsi.
- Memastikan pengiriman email di Supabase Anda aktif agar email konfirmasi terkirim.

## Catatan teknis

- Skema baru di `db/schema.sql`: `profiles` (referensi `auth.users`, trigger pembuatan otomatis saat signup), `plans`, `subscriptions`, `plan_orders`, `post_likes`, dan kolom `user_id` pada `comments`. Semua dengan `GRANT` eksplisit + RLS: profil publik hanya kolom aman, user hanya bisa mengubah barisnya sendiri, pengajuan hanya terlihat oleh pemilik dan service role.
- `src/lib/user.functions.ts` baru: `userSignUp`, `userSignIn`, `userRefresh`, `userForgotPassword`, `userResetPassword`, `getMyProfile`, `updateMyProfile`, `uploadAvatar`, `submitPlanOrder`, `myOrders` — semuanya lewat `sbFetch`/`sbJson` yang sudah ada, token pengguna diverifikasi di server (`/auth/v1/user`) sebelum akses data.
- Sesi user memakai pola yang sama seperti `useAdminToken`, dipisah ke `src/lib/useUserSession.ts` (kunci penyimpanan berbeda, refresh otomatis) agar sesi admin tidak bercampur.
- Google: arahkan ke `/auth/v1/authorize?provider=google&redirect_to=<origin>/auth/callback` pada Supabase self-host, lalu route `src/routes/auth.callback.tsx` menukar kode/hash menjadi sesi.
- Foto profil memakai `driveUpload`/`activeAccount` yang sudah ada, disajikan lewat `/api/public/media/*`.
- Route baru: `src/routes/masuk.tsx`, `src/routes/auth.callback.tsx`, `src/routes/atur-sandi.tsx`, `src/routes/profil.tsx`, `src/routes/paket.tsx`, `src/routes/admin.pengajuan.tsx`; masing-masing dengan `head()` unik (profil & atur sandi `noindex`).
- Header di `src/components/site.tsx` membaca sesi user di sisi klien agar SSR tetap aman.
