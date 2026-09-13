# Perapihan Halaman Google Drive Admin

## Hasil yang akan dibuat
- Bagian paling atas menjadi baris ringkas **Pengaturan Google master** yang tertutup secara default, dengan penanda apakah sudah siap. Form Client ID, Secret, dan redirect URI baru terlihat saat dibuka.
- Bagian kedua menjadi panel **Akun Google Drive** dengan tombol tambah yang jelas dan daftar akun yang sudah login. Akun aktif, email, jumlah berkas, dan tindakan akun dibuat lebih mudah dipindai.
- Bagian ketiga menjadi panel **Migrasi antar-akun**. Sebelum memilih asal dan tujuan, admin melihat ringkasan data tersimpan: jumlah gambar, video, artikel, berkas lain, dan total ukuran.
- Pilihan akun asal dan tujuan tetap saling mengecualikan. Tombol migrasi hanya aktif jika dua akun berbeda dan akun tujuan sudah terhubung.

## Teknis
- Tambahkan ringkasan berdasarkan tipe MIME dan path artikel dari data media yang sudah tercatat, termasuk ringkasan per akun untuk menjelaskan data yang akan dipindahkan.
- Kembalikan ringkasan tersebut bersama daftar akun dalam satu pemuatan halaman.
- Gunakan komponen tombol yang sudah tersedia dan ikon sederhana, tanpa mengubah proses login Google atau logika pemindahan berkas.
- Tambahkan metadata khusus halaman Google Drive admin.

## Verifikasi
- Periksa tampilan desktop dan ponsel.
- Pastikan pengaturan master tertutup saat halaman dibuka.
- Pastikan daftar akun, ringkasan data, pilihan migrasi, dan kondisi tombol tampil konsisten.
