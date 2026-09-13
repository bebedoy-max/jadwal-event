/** Helper Google Drive (server-only). Kredensial disimpan di tabel gdrive_accounts. */
import { sbJson } from './sb.server';

export type DriveAccount = {
  id: string;
  label: string;
  email: string | null;
  client_id: string;
  client_secret: string;
  refresh_token: string | null;
  root_folder_name: string;
  root_folder_id: string | null;
  is_active: boolean;
  enabled: boolean;
  created_at: string;
};

const SELECT = 'id,label,email,client_id,client_secret,refresh_token,root_folder_name,root_folder_id,is_active,enabled,created_at';

export function listAccounts() {
  return sbJson<DriveAccount[]>(`/rest/v1/gdrive_accounts?select=${SELECT}&order=created_at.asc`, {
    admin: true,
  });
}

export async function getAccount(id: string) {
  const rows = await sbJson<DriveAccount[]>(
    `/rest/v1/gdrive_accounts?select=${SELECT}&id=eq.${id}&limit=1`,
    { admin: true },
  );
  return rows[0] ?? null;
}

export async function activeAccount() {
  const rows = await sbJson<DriveAccount[]>(
    `/rest/v1/gdrive_accounts?select=${SELECT}&is_active=eq.true&enabled=eq.true&limit=1`,
    { admin: true },
  );
  return rows[0] ?? null;
}

export async function patchAccount(id: string, body: Record<string, unknown>) {
  await sbJson(`/rest/v1/gdrive_accounts?id=eq.${id}`, {
    admin: true,
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body,
  });
}

export async function insertAccount(body: Record<string, unknown>) {
  const rows = await sbJson<DriveAccount[]>('/rest/v1/gdrive_accounts', {
    admin: true,
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body,
  });
  return rows[0]!;
}

/* ---------------- Konfigurasi Google master ---------------- */

/**
 * Client ID/Secret OAuth disimpan sekali sebagai baris khusus (id tetap).
 * Akun-akun Drive lain menyalin kredensial ini saat dibuat.
 */
export const CONFIG_ID = '00000000-0000-0000-0000-000000000000';

export function getMasterConfig() {
  return getAccount(CONFIG_ID);
}

export async function saveMasterConfig(clientId: string, clientSecret: string | null) {
  const body: Record<string, unknown> = {
    id: CONFIG_ID,
    label: '__config__',
    email: null,
    client_id: clientId,
    refresh_token: null,
    root_folder_name: 'Media Situs',
    root_folder_id: null,
    is_active: false,
    enabled: false,
  };
  // Kolom yang tidak dikirim dibiarkan, jadi secret lama tidak terhapus.
  if (clientSecret) body['client_secret'] = clientSecret;
  await sbJson('/rest/v1/gdrive_accounts?on_conflict=id', {
    admin: true,
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body,
  });
}

/* ---------------- OAuth ---------------- */

export const DRIVE_SCOPE = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export function redirectUri(origin: string) {
  return `${origin.replace(/\/+$/, '')}/api/public/google-drive/callback`;
}

export function authorizeUrl(acc: DriveAccount, origin: string) {
  const p = new URLSearchParams({
    client_id: acc.client_id,
    redirect_uri: redirectUri(origin),
    response_type: 'code',
    scope: DRIVE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    // Origin ikut dibawa agar redirect_uri saat tukar kode persis sama.
    state: `${acc.id}|${origin.replace(/\/+$/, '')}`,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function exchangeCode(acc: DriveAccount, code: string, origin: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: acc.client_id,
      client_secret: acc.client_secret,
      redirect_uri: redirectUri(origin),
      grant_type: 'authorization_code',
    }),
  });
  const json = (await res.json()) as { refresh_token?: string; access_token?: string; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google menolak: ${json.error ?? res.status}`);
  return json;
}

const tokens = new Map<string, { token: string; exp: number }>();

export async function accessToken(acc: DriveAccount) {
  const cached = tokens.get(acc.id);
  if (cached && cached.exp > Date.now() + 30_000) return cached.token;
  if (!acc.refresh_token) throw new Error('Akun Google Drive belum terhubung.');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: acc.client_id,
      client_secret: acc.client_secret,
      refresh_token: acc.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`Gagal memperbarui akses Google Drive: ${json.error ?? res.status}`);
  }
  tokens.set(acc.id, { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 });
  return json.access_token;
}

export async function driveFetch(acc: DriveAccount, url: string, init: RequestInit = {}) {
  const token = await accessToken(acc);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

export async function fetchEmail(acc: DriveAccount) {
  const res = await driveFetch(acc, 'https://www.googleapis.com/oauth2/v2/userinfo');
  if (!res.ok) return null;
  return ((await res.json()) as { email?: string }).email ?? null;
}

/* ---------------- Berkas ---------------- */

export async function ensureRootFolder(acc: DriveAccount) {
  if (acc.root_folder_id) return acc.root_folder_id;
  const name = (acc.root_folder_name || 'Media Situs').replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`,
  );
  const found = await driveFetch(acc, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`);
  let id = found.ok ? ((await found.json()) as { files?: { id: string }[] }).files?.[0]?.id : undefined;
  if (!id) {
    const res = await driveFetch(acc, 'https://www.googleapis.com/drive/v3/files?fields=id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: acc.root_folder_name || 'Media Situs',
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    if (!res.ok) throw new Error(`Gagal membuat folder root: ${await res.text()}`);
    id = ((await res.json()) as { id: string }).id;
  }
  await patchAccount(acc.id, { root_folder_id: id });
  acc.root_folder_id = id!;
  return id!;
}

export async function uploadFile(
  acc: DriveAccount,
  name: string,
  mime: string,
  bytes: ArrayBuffer,
): Promise<string> {
  const parent = await ensureRootFolder(acc);
  const boundary = `lv${crypto.randomUUID().replace(/-/g, '')}`;
  const meta = JSON.stringify({ name, parents: [parent] });
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.byteLength + tail.length);
  body.set(head, 0);
  body.set(new Uint8Array(bytes), head.length);
  body.set(tail, head.length + bytes.byteLength);
  const res = await driveFetch(
    acc,
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  if (!res.ok) throw new Error(`Unggah ke Drive gagal: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { id: string }).id;
}

export async function downloadFile(acc: DriveAccount, fileId: string) {
  const res = await driveFetch(
    acc,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
  );
  return res;
}

/* ---------------- Peta media ---------------- */

export type MediaAsset = {
  id: number;
  path: string;
  drive_file_id: string;
  account_id: string;
  mime: string;
  size: number;
};

export async function findAsset(path: string) {
  const rows = await sbJson<MediaAsset[]>(
    `/rest/v1/media_assets?select=id,path,drive_file_id,account_id,mime,size&path=eq.${encodeURIComponent(path)}&limit=1`,
    { admin: true },
  );
  return rows[0] ?? null;
}

export async function upsertAsset(row: Omit<MediaAsset, 'id'>) {
  await sbJson('/rest/v1/media_assets?on_conflict=path', {
    admin: true,
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [row],
  });
}

/* ---------------- Pemindahan berkas lama ke Drive ---------------- */

import { fetchLegacyMedia, guessMime } from './legacy-media.server';

/**
 * Pastikan sebuah path media tersimpan di Drive akun aktif.
 * Mengembalikan berkasnya bila berhasil diambil dari sumber lama.
 */
export async function ingestMedia(
  acc: DriveAccount,
  path: string,
  file?: { bytes: ArrayBuffer; mime: string } | null,
) {
  const existing = await findAsset(path);
  if (existing) return { status: 'ada' as const, asset: existing };
  const got = file ?? (await fetchLegacyMedia(path));
  if (!got) return { status: 'hilang' as const };
  const name = path.replace(/\//g, '__');
  const fileId = await uploadFile(acc, name, got.mime || guessMime(path), got.bytes);
  const row = {
    path,
    drive_file_id: fileId,
    account_id: acc.id,
    mime: got.mime || guessMime(path),
    size: got.bytes.byteLength,
  };
  await upsertAsset(row);
  return { status: 'baru' as const, asset: { id: 0, ...row } as MediaAsset };
}

/** Simpan teks (mis. cadangan artikel HTML) ke Drive dengan path stabil. */
export async function ingestText(acc: DriveAccount, path: string, text: string, mime = 'text/html') {
  const bytes = new TextEncoder().encode(text);
  const buf = bytes.buffer.slice(0, bytes.byteLength) as ArrayBuffer;
  const existing = await findAsset(path);
  const fileId = await uploadFile(acc, path.replace(/\//g, '__'), mime, buf);
  await upsertAsset({
    path,
    drive_file_id: fileId,
    account_id: acc.id,
    mime,
    size: bytes.byteLength,
  });
  return existing ? 'perbarui' : 'baru';
}
