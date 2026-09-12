/**
 * Pemindahan isi situs (gambar, video, dan cadangan artikel) ke Google Drive.
 * Server-only. Posisi terakhir disimpan di tabel site_settings supaya proses
 * bisa dilanjutkan kapan saja — walau halaman admin ditutup.
 */
import { sbJson, sbList } from './sb.server';
import { activeAccount, ingestMedia, ingestText, type DriveAccount } from './gdrive.server';

export type SyncPost = {
  id: number;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  featured_image: string | null;
  published_at: string;
};

const OFFSET_KEY = 'drive_sync_offset';
const STATS_KEY = 'drive_sync_stats';

export type SyncStats = {
  uploaded: number;
  skipped: number;
  missing: number;
  articles: number;
  errors: number;
  lastError: string;
  updatedAt: string;
};

const ZERO: SyncStats = {
  uploaded: 0,
  skipped: 0,
  missing: 0,
  articles: 0,
  errors: 0,
  lastError: '',
  updatedAt: '',
};

/* ---------------- site_settings sebagai penyimpan posisi ---------------- */

export async function getSetting(key: string) {
  const rows = await sbJson<{ value: string }[]>(
    `/rest/v1/site_settings?select=value&key=eq.${encodeURIComponent(key)}&limit=1`,
    { admin: true },
  );
  return rows[0]?.value ?? '';
}

export async function setSetting(key: string, value: string) {
  await sbJson('/rest/v1/site_settings?on_conflict=key', {
    admin: true,
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [{ key, value }],
  });
}

async function readStats(): Promise<SyncStats> {
  try {
    const raw = await getSetting(STATS_KEY);
    return raw ? { ...ZERO, ...(JSON.parse(raw) as Partial<SyncStats>) } : { ...ZERO };
  } catch {
    return { ...ZERO };
  }
}

/* ---------------- Deteksi berkas media di dalam artikel ---------------- */

const PATH_RE = /\/api\/public\/(?:gambar|media)\/([^\s"'<>)\\]+)/gi;
const OLD_RE = /(?:https?:)?\/\/(?:www\.)?jadwalevent\.web\.id\/wp-content\/uploads\/([^\s"'<>)\\]+)/gi;

export function mediaPaths(p: Pick<SyncPost, 'content' | 'featured_image'>) {
  const out = new Set<string>();
  const hay = `${p.content ?? ''} ${p.featured_image ?? ''}`;
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

export function articleHtml(p: SyncPost) {
  return `<!doctype html><meta charset="utf-8"><title>${p.title}</title>\n<!-- slug: ${p.slug} | id: ${p.id} | terbit: ${p.published_at} -->\n<h1>${p.title}</h1>\n<p>${p.excerpt ?? ''}</p>\n${p.content ?? ''}`;
}

async function assetExists(path: string) {
  const rows = await sbJson<{ id: number }[]>(
    `/rest/v1/media_assets?select=id&path=eq.${encodeURIComponent(path)}&limit=1`,
    { admin: true },
  );
  return Boolean(rows[0]);
}

export async function processPost(acc: DriveAccount, post: SyncPost, backupArticle: boolean) {
  const res = { uploaded: 0, skipped: 0, missing: 0, articles: 0, errors: [] as string[] };
  for (const path of mediaPaths(post)) {
    try {
      const r = await ingestMedia(acc, path);
      if (r.status === 'baru') res.uploaded++;
      else if (r.status === 'ada') res.skipped++;
      else res.missing++;
    } catch (e) {
      res.errors.push(`${path}: ${e instanceof Error ? e.message : 'gagal'}`);
    }
  }
  if (backupArticle) {
    try {
      const p = `artikel/${post.slug}.html`;
      if (!(await assetExists(p))) {
        await ingestText(acc, p, articleHtml(post));
        res.articles++;
      }
    } catch (e) {
      res.errors.push(`artikel ${post.slug}: ${e instanceof Error ? e.message : 'gagal'}`);
    }
  }
  return res;
}

/* ---------------- Status & penjalan bertahap ---------------- */

export async function syncStatus() {
  const [offsetRaw, stats, posts, assets] = await Promise.all([
    getSetting(OFFSET_KEY),
    readStats(),
    sbList<{ id: number }>('/rest/v1/posts?select=id', {
      admin: true,
      headers: { Range: '0-0' },
    }),
    sbList<{ id: number }>('/rest/v1/media_assets?select=id', {
      admin: true,
      headers: { Range: '0-0' },
    }),
  ]);
  const offset = Number(offsetRaw) || 0;
  return {
    offset,
    total: posts.total,
    files: assets.total,
    done: posts.total > 0 && offset >= posts.total,
    stats,
  };
}

export type RunOptions = {
  budgetMs?: number;
  batch?: number;
  articles?: boolean;
  reset?: boolean;
};

/**
 * Menjalankan pemindahan selama jatah waktu tertentu lalu menyimpan posisinya.
 * Aman dipanggil berulang kali (termasuk oleh penjadwal) — selalu melanjutkan.
 */
export async function runSync(opts: RunOptions = {}) {
  const budgetMs = Math.min(Math.max(opts.budgetMs ?? 40_000, 5_000), 120_000);
  const batch = Math.min(Math.max(opts.batch ?? 5, 1), 25);
  const backupArticle = opts.articles !== false;

  const acc = await activeAccount();
  if (!acc) throw new Error('Belum ada akun Google Drive aktif.');
  if (!acc.refresh_token) throw new Error('Akun Google Drive aktif belum terhubung ke Google.');

  if (opts.reset) {
    await setSetting(OFFSET_KEY, '0');
    await setSetting(STATS_KEY, JSON.stringify({ ...ZERO, updatedAt: new Date().toISOString() }));
  }

  let offset = Number(await getSetting(OFFSET_KEY)) || 0;
  const stats = await readStats();
  const started = Date.now();
  const run = { uploaded: 0, skipped: 0, missing: 0, articles: 0, errors: [] as string[] };
  let total = 0;
  let done = false;

  while (Date.now() - started < budgetMs) {
    const { data: rows, total: count } = await sbList<SyncPost>(
      `/rest/v1/posts?select=id,slug,title,content,excerpt,featured_image,published_at&order=id.asc&offset=${offset}&limit=${batch}`,
      { admin: true, headers: { Range: `${offset}-${offset + batch - 1}` } },
    );
    total = count;
    if (rows.length === 0) {
      done = true;
      break;
    }
    for (const post of rows) {
      const r = await processPost(acc, post, backupArticle);
      run.uploaded += r.uploaded;
      run.skipped += r.skipped;
      run.missing += r.missing;
      run.articles += r.articles;
      run.errors.push(...r.errors);
    }
    offset += rows.length;
    await setSetting(OFFSET_KEY, String(offset));
    stats.uploaded += run.uploaded;
    stats.skipped += run.skipped;
    stats.missing += run.missing;
    stats.articles += run.articles;
    stats.errors += run.errors.length;
    stats.lastError = run.errors[run.errors.length - 1] ?? stats.lastError;
    stats.updatedAt = new Date().toISOString();
    await setSetting(STATS_KEY, JSON.stringify(stats));
    run.uploaded = 0;
    run.skipped = 0;
    run.missing = 0;
    run.articles = 0;
    run.errors.length = 0;
    if (offset >= total) {
      done = true;
      break;
    }
  }

  return {
    offset,
    total,
    done,
    elapsedMs: Date.now() - started,
    stats,
  };
}
