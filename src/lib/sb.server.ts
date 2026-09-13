/** Klien REST untuk Supabase self-hosted (Coolify). Server-only. */

type Opts = {
  admin?: boolean;
  token?: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export function sbUrl() {
  return (process.env['SELFHOST_SB_URL'] ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/^http:\/\//i, 'https://');
}

function anonKey() {
  return process.env['SELFHOST_SB_PUBLISHABLE_KEY'] ?? '';
}

function serviceKey() {
  return process.env['SELFHOST_SB_SERVICE_ROLE_KEY'] ?? '';
}

export async function sbFetch(path: string, opts: Opts = {}): Promise<Response> {
  const key = opts.admin ? serviceKey() : anonKey();
  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${opts.token ?? key}`,
    'Content-Type': 'application/json',
    ...(opts.headers ?? {}),
  };
  const init: RequestInit = { method: opts.method ?? 'GET', headers };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  return fetch(`${sbUrl()}${path}`, init);
}

export async function sbJson<T>(path: string, opts: Opts = {}): Promise<T> {
  const res = await sbFetch(path, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** Ambil data + total baris (untuk paginasi). */
export async function sbList<T>(path: string, opts: Opts = {}) {
  const res = await sbFetch(path, {
    ...opts,
    headers: { Prefer: 'count=exact', ...(opts.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const range = res.headers.get('content-range') ?? '';
  const total = Number(range.split('/')[1] ?? 0) || 0;
  const data = (await res.json()) as T[];
  return { data, total };
}

/** Verifikasi token pengguna biasa (bukan admin) dan kembalikan datanya. */
export async function requireUser(token: string) {
  if (!token) throw new Error('Silakan masuk terlebih dahulu.');
  const res = await sbFetch('/auth/v1/user', { token });
  if (!res.ok) throw new Error('Sesi berakhir, silakan masuk ulang.');
  return (await res.json()) as {
    id: string;
    email?: string;
    user_metadata?: Record<string, unknown>;
  };
}

/** Verifikasi token pengguna dan pastikan dia admin. */
export async function requireAdmin(token: string) {
  if (!token) throw new Error('Silakan login terlebih dahulu.');
  const res = await sbFetch('/auth/v1/user', { token });
  if (!res.ok) throw new Error('Sesi tidak valid, silakan login ulang.');
  const user = (await res.json()) as { id: string; email?: string };
  const roles = await sbJson<{ role: string }[]>(
    `/rest/v1/user_roles?select=role&user_id=eq.${user.id}`,
    { admin: true },
  );
  if (!roles.some((r) => r.role === 'admin' || r.role === 'editor')) {
    throw new Error('Akun ini tidak punya akses admin.');
  }
  return user;
}
