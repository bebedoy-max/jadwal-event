import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { requireAdmin, sbJson, sbList } from './sb.server';
import {
  activeAccount,
  authorizeUrl,
  downloadFile,
  getAccount,
  insertAccount,
  listAccounts,
  patchAccount,
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
};

function view(a: DriveAccount, counts: Record<string, number>): DriveAccountView {
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
    file_count: counts[a.id] ?? 0,
  };
}

async function fileCounts() {
  const rows = await sbJson<{ account_id: string }[]>(
    '/rest/v1/media_assets?select=account_id&limit=100000',
    { admin: true },
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.account_id] = (out[r.account_id] ?? 0) + 1;
  return out;
}

export const driveList = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const [accounts, counts] = await Promise.all([listAccounts(), fileCounts()]);
    return {
      redirectUri: `${origin()}/api/public/google-drive/callback`,
      accounts: accounts.map((a) => view(a, counts)),
    };
  });

export const driveSave = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: {
      token: string;
      id?: string;
      label: string;
      client_id: string;
      client_secret?: string;
      root_folder_name: string;
    }) => {
      if (!d.client_id?.trim()) throw new Error('Client ID wajib diisi.');
      return d;
    },
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const body: Record<string, unknown> = {
      label: data.label.trim() || 'Google Drive',
      client_id: data.client_id.trim(),
      root_folder_name: data.root_folder_name.trim() || 'Media Situs',
    };
    if (data.client_secret?.trim()) body['client_secret'] = data.client_secret.trim();
    if (data.id) {
      await patchAccount(data.id, body);
      return { id: data.id };
    }
    const existing = await listAccounts();
    const acc = await insertAccount({
      ...body,
      client_secret: data.client_secret?.trim() ?? '',
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
    const remainingBefore = await sbJson<{ id: number }[]>(
      `/rest/v1/media_assets?select=id&account_id=eq.${from.id}&limit=100000`,
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
    return { moved, remaining: Math.max(remainingBefore.length - moved, 0), errors };
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
