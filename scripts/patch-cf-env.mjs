/**
 * Cloudflare Pages: entri Worker bawaan Nitro (cloudflare-pages) tidak
 * menyalin binding environment ke `globalThis.__env__`, sehingga
 * `process.env.*` kosong saat runtime dan aplikasi menganggap database
 * tidak aktif. Skrip ini menambahkan satu baris pada hasil build.
 *
 * Dijalankan otomatis oleh `bun run build:cf`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const candidates = ['dist/_worker.js/index.js', 'dist/server/index.mjs'];
const MARKER = 'globalThis.__env__ = env;';
let patched = 0;

for (const file of candidates) {
  if (!existsSync(file)) continue;
  const code = await readFile(file, 'utf8');
  if (code.includes(MARKER)) {
    console.log(`[patch-cf-env] ${file}: sudah menyetel __env__, dilewati`);
    patched++;
    continue;
  }
  const re = /(async fetch\(\s*cfReq\s*,\s*env\s*,\s*context\s*\)\s*\{)/;
  if (!re.test(code)) {
    console.log(`[patch-cf-env] ${file}: pola handler tidak ditemukan, dilewati`);
    continue;
  }
  await writeFile(file, code.replace(re, `$1\n\t\t${MARKER}`), 'utf8');
  console.log(`[patch-cf-env] ${file}: __env__ ditambahkan`);
  patched++;
}

if (patched === 0) {
  console.error('[patch-cf-env] GAGAL: tidak ada entri Worker yang bisa dipatch di dist/.');
  process.exit(1);
}
