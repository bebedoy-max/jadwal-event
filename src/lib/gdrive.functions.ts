import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireAdmin, sbJson, sbList } from './sb.server';
import {
  activeAccount,
  authorizeUrl,
  CONFIG_ID,
  downloadFile,
  getAccount,
  getMasterConfig,
  insertAccount,
  listAccounts,
  patchAccount,
  saveMasterConfig,
  uploadFile,
  upsertAsset,
  type DriveAccount,
  type MediaAsset,
} from './gdrive.server';

function origin() {
  const req = getRequest();
  if (!req) throw new Error('Permintaan tidak valid.');
  const url = new URL(req.url);
  const fwd = url.hostname === 'localhost' ? req.headers.get('x-forwarded-host') : null;
  return fwd ? `https://${fwd}` : url.origin;
}

export type DriveAccountView = {
  id: string;
  label: string;
  email: string | null;
  client_id: string;
  has_secret: boolean;
  root_folder_name: string;
  connected: boolean;
  is_active: boolean;
  enabled: boolean;
  file_count: number;
  image_count: number;
  video_count: number;
  article_count: number;
  other_count: number;
  total_size: number;
};

export type DriveStorageSummary = {
  images: number;
  videos: number;
  articles: number;
  others: number;
  files: number;
  total_size: number;
};

type AssetSummaryRow = Pick<MediaAsset, 'account_id' | 'path' | 'mime' | 'size'>;

function emptySummary(): DriveStorageSummary {
  return { images: 0, videos: 0, articles: 0, others: 0, files: 0, total_size: 0 };
}

function addToSummary(summary: DriveStorageSummary, row: AssetSummaryRow) {
  summary.files += 1;
  summary.total_size += Number(row.size) || 0;
  if (row.path.startsWith('artikel/') || row.mime === 'text/html') summary.articles += 1;
  else if (row.mime.startsWith('image/')) summary.images += 1;
  else if (row.mime.startsWith('video/')) summary.videos += 1;
  else summary.others += 1;
}

function view(a: DriveAccount, summary: DriveStorageSummary): DriveAccountView {
  return {
    id: a.id,
    label: a.label,
    email: a.email,
    client_id: a.client_id,
    has_secret: Boolean(a.client_secret),
    root_folder_name: a.root_folder_name,
    connected: Boolean(a.refresh_token),
    is_active: a.is_active,
    enabled: a.enabled,
    file_count: summary.files,
    image_count: summary.images,
    video_count: summary.videos,
    article_count: summary.articles,
    other_count: summary.others,
    total_size: summary.total_size,
  };
}

async function storageSummaries() {
  const total = emptySummary();
  const byAccount: Record<string, DriveStorageSummary> = {};
  // PostgREST membatasi hasil per permintaan (umumnya 1000 baris), jadi data
  // dibaca bertahap agar jumlahnya benar untuk puluhan ribu berkas.
  const page = 1000;
  for (let offset = 0; offset < 500_000; offset += page) {
    const rows = await sbJson<AssetSummaryRow[]>(
      `/rest/v1/media_assets?select=account_id,path,mime,size&order=id.asc&limit=${page}&offset=${offset}`,
      { admin: true },
    );
    for (const row of rows) {
      addToSummary(total, row);
      const accountSummary = byAccount[row.account_id] ?? emptySummary();
      addToSummary(accountSummary, row);
      byAccount[row.account_id] = accountSummary;
    }
    if (rows.length < page) break;
  }
  return { total, byAccount };
}


export const driveList = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const [accounts, summaries] = await Promise.all([listAccounts(), storageSummaries()]);
    const master = accounts.find((a) => a.id === CONFIG_ID);
    // Cadangan: proyek lama menyimpan kredensial langsung di akunnya.
    const fallback = accounts.find((a) => a.id !== CONFIG_ID && a.client_id && a.client_secret);
    return {
      redirectUri: `${origin()}/api/public/google-drive/callback`,
      configured: Boolean(master?.client_id && master?.client_secret) || Boolean(fallback),
      masterClientId: master?.client_id ?? fallback?.client_id ?? '',
      storage: summaries.total,
      accounts: accounts
        .filter((a) => a.id !== CONFIG_ID)
        .map((a) => view(a, summaries.byAccount[a.id] ?? emptySummary())),
    };
  });

/**
 * Simpan konfigurasi Google master (Client ID/Secret) — satu untuk semua akun.
 * Kredensial baru juga disalin ke semua akun yang sudah ada.
 */
export const driveSave = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; client_id: string; client_secret?: string }) => {
    if (!d.client_id?.trim()) throw new Error('Client ID wajib diisi.');
    return d;
  })
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const master = await getMasterConfig();
    const secret = data.client_secret?.trim() || null;
    if (!master?.client_secret && !secret) {
      throw new Error('Client Secret wajib diisi pertama kali.');
    }
    const clientId = data.client_id.trim();
    await saveMasterConfig(clientId, secret);
    const accounts = await listAccounts();
    for (const a of accounts) {
      if (a.id === CONFIG_ID) continue;
      const body: Record<string, unknown> = { client_id: clientId };
      if (secret) body['client_secret'] = secret;
      await patchAccount(a.id, body);
    }
    return { ok: true };
  });

/** Tambah akun Google Drive baru memakai kredensial master, lalu tinggal Hubungkan. */
export const driveAddAccount = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const master = await getMasterConfig();
    const all = await listAccounts();
    const fallback = all.find((a) => a.id !== CONFIG_ID && a.client_id && a.client_secret);
    const creds = master?.client_id && master.client_secret ? master : fallback;
    if (!creds) {
      throw new Error('Simpan dulu pengaturan Google master (Client ID & Secret).');
    }
    const existing = all.filter((a) => a.id !== CONFIG_ID);
    const acc = await insertAccount({
      label: `Google Drive ${existing.length + 1}`,
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      root_folder_name: 'Media Situs',
      is_active: existing.length === 0,
    });
    return { id: acc.id };
  });

export const driveAuthUrl = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; id: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const acc = await getAccount(data.id);
    if (!acc) throw new Error('Akun tidak ditemukan.');
    if (!acc.client_id || !acc.client_secret) {
      throw new Error('Isi Client ID dan Client Secret lalu simpan dulu.');
    }
    return { url: authorizeUrl(acc, origin()) };
  });

export const driveSetState = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; id: string; action: 'activate' | 'toggle' | 'disconnect' | 'delete' }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const acc = await getAccount(data.id);
    if (!acc) throw new Error('Akun tidak ditemukan.');
    if (data.action === 'activate') {
      await sbJson('/rest/v1/gdrive_accounts?is_active=eq.true', {
        admin: true,
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { is_active: false },
      });
      await patchAccount(acc.id, { is_active: true, enabled: true });
    } else if (data.action === 'toggle') {
      await patchAccount(acc.id, { enabled: !acc.enabled });
    } else if (data.action === 'disconnect') {
      await patchAccount(acc.id, { refresh_token: null, email: null, root_folder_id: null });
    } else {
      await sbJson(`/rest/v1/gdrive_accounts?id=eq.${acc.id}`, { admin: true, method: 'DELETE' });
    }
    return { ok: true };
  });

/* ---------------- Unggah media ---------------- */

export const driveUpload = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; name: string; mime: string; dataBase64: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const acc = await activeAccount();
    if (!acc) throw new Error('Belum ada akun Google Drive aktif.');
    if (!acc.refresh_token) throw new Error('Akun Google Drive aktif belum terhubung ke Google.');

    const bin = atob(data.dataBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const clean = data.name.replace(/[^\w.\- ]+/g, '-');
    const now = new Date();
    const path = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${Date.now()}-${clean}`;
    const fileId = await uploadFile(acc, clean, data.mime || 'application/octet-stream', bytes.buffer);
    await upsertAsset({
      path,
      drive_file_id: fileId,
      account_id: acc.id,
      mime: data.mime || 'application/octet-stream',
      size: bytes.length,
    });
    return { url: `/api/public/gambar/${path}` };
  });

/* ---------------- Migrasi antar akun ---------------- */

export const driveMigrateBatch = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; fromId: string; toId: string; limit?: number }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (data.fromId === data.toId) throw new Error('Akun asal dan tujuan sama.');
    const from = await getAccount(data.fromId);
    const to = await getAccount(data.toId);
    if (!from || !to) throw new Error('Akun tidak ditemukan.');
    if (!to.refresh_token) throw new Error('Akun tujuan belum terhubung ke Google.');

    const limit = Math.min(Math.max(data.limit ?? 5, 1), 10);
    const rows = await sbJson<MediaAsset[]>(
      `/rest/v1/media_assets?select=id,path,drive_file_id,account_id,mime,size&account_id=eq.${from.id}&order=id.asc&limit=${limit}`,
      { admin: true },
    );
    const { total: remainingBefore } = await sbList<{ id: number }>(
      `/rest/v1/media_assets?select=id&account_id=eq.${from.id}&limit=1`,
      { admin: true },
    );


    let moved = 0;
    const errors: string[] = [];
    for (const row of rows) {
      try {
        const res = await downloadFile(from, row.drive_file_id);
        if (!res.ok) throw new Error(`unduh gagal (${res.status})`);
        const buf = await res.arrayBuffer();
        const name = row.path.split('/').pop() ?? 'file';
        const newId = await uploadFile(to, name, row.mime, buf);
        await sbJson(`/rest/v1/media_assets?id=eq.${row.id}`, {
          admin: true,
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: { drive_file_id: newId, account_id: to.id },
        });
        moved++;
      } catch (e) {
        errors.push(`${row.path}: ${e instanceof Error ? e.message : 'gagal'}`);
      }
    }
    return { moved, remaining: Math.max(remainingBefore - moved, 0), errors };
  });

/* ---------------- Sinkronisasi seluruh media ke Drive ---------------- */

import { ingestMedia, ingestText } from './gdrive.server';

type Post = {
  id: number;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  featured_image: string | null;
  published_at: string;
};

const PATH_RE = /\/api\/public\/(?:gambar|media)\/([^\s"'<>)\\]+)/gi;
const OLD_RE = /(?:https?:)?\/\/(?:www\.)?jadwalevent\.web\.id\/wp-content\/uploads\/([^\s"'<>)\\]+)/gi;

function mediaPaths(p: Post) {
  const out = new Set<string>();
  const hay = `${p.content} ${p.featured_image ?? ''}`;
  for (const re of [PATH_RE, OLD_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(hay))) {
      const raw = decodeURIComponent((m[1] ?? '').replace(/&amp;/g, '&').trim());
      if (raw && !raw.includes('..') && raw.length < 300) out.add(raw);
    }
  }
  return [...out];
}

function articleHtml(p: Post) {
  return `<!doctype html><meta charset="utf-8"><title>${p.title}</title>\n<!-- slug: ${p.slug} | id: ${p.id} | terbit: ${p.published_at} -->\n<h1>${p.title}</h1>\n<p>${p.excerpt}</p>\n${p.content}`;
}

/**
 * Memproses sekelompok artikel: semua gambar/video di dalamnya disalin ke Drive
 * aktif, dan (opsional) isi artikel dicadangkan sebagai berkas HTML di Drive.
 */
export const driveSyncBatch = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; offset: number; posts?: number; articles?: boolean }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const acc = await activeAccount();
    if (!acc) throw new Error('Belum ada akun Google Drive aktif.');
    if (!acc.refresh_token) throw new Error('Akun Google Drive aktif belum terhubung ke Google.');

    const limit = Math.min(Math.max(data.posts ?? 5, 1), 20);
    const offset = Math.max(data.offset, 0);
    const { data: rows, total } = await sbList<Post>(
      `/rest/v1/posts?select=id,slug,title,content,excerpt,featured_image,published_at&order=id.asc&offset=${offset}&limit=${limit}`,
      { admin: true, headers: { Range: `${offset}-${offset + limit - 1}` } },
    );

    let uploaded = 0;
    let skipped = 0;
    let missing = 0;
    let articles = 0;
    const errors: string[] = [];

    for (const post of rows) {
      for (const path of mediaPaths(post)) {
        try {
          const r = await ingestMedia(acc, path);
          if (r.status === 'baru') uploaded++;
          else if (r.status === 'ada') skipped++;
          else missing++;
        } catch (e) {
          errors.push(`${path}: ${e instanceof Error ? e.message : 'gagal'}`);
        }
      }
      if (data.articles) {
        try {
          const p = `artikel/${post.slug}.html`;
          const exists = await findAssetSafe(p);
          if (!exists) {
            await ingestText(acc, p, articleHtml(post));
            articles++;
          }
        } catch (e) {
          errors.push(`artikel ${post.slug}: ${e instanceof Error ? e.message : 'gagal'}`);
        }
      }
    }

    const next = offset + rows.length;
    return {
      total,
      next,
      done: rows.length === 0 || next >= total,
      uploaded,
      skipped,
      missing,
      articles,
      errors: errors.slice(0, 5),
    };
  });

async function findAssetSafe(path: string) {
  const rows = await sbJson<{ id: number }[]>(
    `/rest/v1/media_assets?select=id&path=eq.${encodeURIComponent(path)}&limit=1`,
    { admin: true },
  );
  return rows[0] ?? null;
}

/* ---------------- Pemindahan besar yang bisa dilanjutkan ---------------- */

import { runSync, syncStatus } from './sync.server';

/** Posisi terakhir pemindahan + jumlah berkas yang sudah ada di Drive. */
export const driveSyncStatus = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    return syncStatus();
  });

/** Menjalankan satu putaran pemindahan (±35 detik) lalu menyimpan posisinya. */
export const driveSyncRun = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; reset?: boolean; articles?: boolean; batch?: number }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    return runSync({
      reset: data.reset === true,
      articles: data.articles !== false,
      batch: data.batch ?? 6,
      budgetMs: 35_000,
    });
  });
