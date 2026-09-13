import { createServerFn } from '@tanstack/react-start';
import { requireUser, sbFetch, sbJson, sbUrl } from './sb.server';

/* ------------------------------- Tipe data ------------------------------- */

export type Profile = {
  id: string;
  display_name: string;
  full_name: string;
  whatsapp: string;
  city: string;
  website: string;
  bio: string;
  avatar_url: string | null;
};

export type Plan = {
  id: string;
  name: string;
  price: number;
  currency: string;
  days: number;
  description: string;
  features: string;
  sort: number;
};

export type Subscription = {
  plan_id: string;
  status: string;
  started_at: string;
  expires_at: string | null;
};

export type PlanOrder = {
  id: number;
  plan_id: string;
  amount: number;
  contact: string;
  note: string;
  status: string;
  admin_note: string;
  created_at: string;
};

const PROFILE_COLS = 'id,display_name,full_name,whatsapp,city,website,bio,avatar_url';

/* --------------------------------- Sesi --------------------------------- */

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number };

function session(json: TokenResponse, fallbackRefresh = '') {
  return {
    token: json.access_token,
    refresh: json.refresh_token ?? fallbackRefresh,
    expiresIn: json.expires_in ?? 3600,
  };
}

async function authError(res: Response, fallback: string) {
  try {
    const body = (await res.json()) as { msg?: string; error_description?: string; message?: string };
    return new Error(body.msg || body.error_description || body.message || fallback);
  } catch {
    return new Error(fallback);
  }
}

export const userSignUp = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: { email: string; password: string; displayName: string; redirectTo: string }) => {
      if (!d.email?.trim()) throw new Error('Email wajib diisi.');
      if ((d.password ?? '').length < 8) throw new Error('Kata sandi minimal 8 karakter.');
      if (!d.displayName?.trim()) throw new Error('Nama wajib diisi.');
      return d;
    },
  )
  .handler(async ({ data }) => {
    const res = await sbFetch(
      `/auth/v1/signup?redirect_to=${encodeURIComponent(data.redirectTo)}`,
      {
        method: 'POST',
        body: {
          email: data.email.trim().toLowerCase(),
          password: data.password,
          data: { display_name: data.displayName.trim().slice(0, 60) },
        },
      },
    );
    if (!res.ok) throw await authError(res, 'Pendaftaran gagal, coba lagi.');
    const json = (await res.json()) as TokenResponse & { id?: string };
    if (json.access_token) return { confirmed: true, ...session(json) };
    return { confirmed: false, token: '', refresh: '', expiresIn: 0 };
  });

export const userSignIn = createServerFn({ method: 'POST' })
  .inputValidator((d: { email: string; password: string }) => d)
  .handler(async ({ data }) => {
    const res = await sbFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: data.email.trim().toLowerCase(), password: data.password },
    });
    if (!res.ok) throw await authError(res, 'Email atau kata sandi salah.');
    return session((await res.json()) as TokenResponse);
  });

export const userRefresh = createServerFn({ method: 'POST' })
  .inputValidator((d: { refresh: string }) => d)
  .handler(async ({ data }) => {
    if (!data.refresh) throw new Error('Sesi berakhir, silakan masuk ulang.');
    const res = await sbFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: data.refresh },
    });
    if (!res.ok) throw new Error('Sesi berakhir, silakan masuk ulang.');
    return session((await res.json()) as TokenResponse, data.refresh);
  });

/** Tautan masuk dengan Google (Google harus diaktifkan di pengaturan Auth). */
export const googleAuthUrl = createServerFn({ method: 'POST' })
  .inputValidator((d: { redirectTo: string }) => d)
  .handler(async ({ data }) => ({
    url: `${sbUrl()}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(
      data.redirectTo,
    )}`,
  }));

export const userForgotPassword = createServerFn({ method: 'POST' })
  .inputValidator((d: { email: string; redirectTo: string }) => d)
  .handler(async ({ data }) => {
    const res = await sbFetch(
      `/auth/v1/recover?redirect_to=${encodeURIComponent(data.redirectTo)}`,
      { method: 'POST', body: { email: data.email.trim().toLowerCase() } },
    );
    if (!res.ok) throw await authError(res, 'Gagal mengirim email pemulihan.');
    return { ok: true };
  });

export const userSetPassword = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; password: string }) => {
    if ((d.password ?? '').length < 8) throw new Error('Kata sandi minimal 8 karakter.');
    return d;
  })
  .handler(async ({ data }) => {
    const res = await sbFetch('/auth/v1/user', {
      method: 'PUT',
      token: data.token,
      body: { password: data.password },
    });
    if (!res.ok) throw await authError(res, 'Gagal menyimpan kata sandi baru.');
    return { ok: true };
  });

/* ------------------------------- Profil --------------------------------- */

async function ensureProfile(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
  const rows = await sbJson<Profile[]>(
    `/rest/v1/profiles?select=${PROFILE_COLS}&id=eq.${user.id}&limit=1`,
    { admin: true },
  );
  if (rows[0]) return rows[0];
  const meta = user.user_metadata ?? {};
  // Upsert (bukan insert biasa) supaya aman jika baris sudah dibuat trigger
  // atau permintaan lain secara bersamaan — menghindari error duplikat 409.
  const created = await sbJson<Profile[]>('/rest/v1/profiles?on_conflict=id', {
    admin: true,
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: {
      id: user.id,
      display_name:
        String(meta['display_name'] ?? meta['full_name'] ?? (user.email ?? '').split('@')[0] ?? ''),
      full_name: String(meta['full_name'] ?? ''),
      avatar_url: meta['avatar_url'] ? String(meta['avatar_url']) : null,
    },
  });
  return created[0] as Profile;
}

async function ensureSubscription(userId: string) {
  const rows = await sbJson<Subscription[]>(
    `/rest/v1/subscriptions?select=plan_id,status,started_at,expires_at&user_id=eq.${userId}&limit=1`,
    { admin: true },
  );
  if (rows[0]) return rows[0];
  const created = await sbJson<Subscription[]>('/rest/v1/subscriptions?on_conflict=user_id', {
    admin: true,
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: { user_id: userId, plan_id: 'free', status: 'active' },
  });
  return created[0] as Subscription;
}

async function plans() {
  try {
    return await sbJson<Plan[]>(
      '/rest/v1/plans?select=id,name,price,currency,days,description,features,sort&active=eq.true&order=sort.asc',
    );
  } catch (error) {
    // Tabel plans belum dibuat / belum ada data: tampilkan daftar kosong, jangan 500.
    console.error(error);
    return [] as Plan[];
  }
}

export const listPlans = createServerFn({ method: 'GET' }).handler(async () => plans());

/** Semua data yang dibutuhkan halaman profil dalam satu permintaan. */
export const getMyAccount = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser(data.token);
    const [profile, subscription, planList, orders, roles] = await Promise.all([
      ensureProfile(user),
      ensureSubscription(user.id),
      plans(),
      sbJson<PlanOrder[]>(
        `/rest/v1/plan_orders?select=id,plan_id,amount,contact,note,status,admin_note,created_at&user_id=eq.${user.id}&order=created_at.desc&limit=50`,
        { admin: true },
      ),
      sbJson<{ role: string }[]>(`/rest/v1/user_roles?select=role&user_id=eq.${user.id}`, {
        admin: true,
      }),
    ]);
    return {
      email: user.email ?? '',
      profile,
      subscription,
      plans: planList,
      orders,
      isAdmin: roles.some((r) => r.role === 'admin' || r.role === 'editor'),
    };
  });

export const updateMyProfile = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: {
      token: string;
      display_name: string;
      full_name?: string;
      whatsapp?: string;
      city?: string;
      website?: string;
      bio?: string;
    }) => {
      if (!d.display_name?.trim()) throw new Error('Nama tampilan wajib diisi.');
      return d;
    },
  )
  .handler(async ({ data }) => {
    const user = await requireUser(data.token);
    await ensureProfile(user);
    await sbJson(`/rest/v1/profiles?id=eq.${user.id}`, {
      admin: true,
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: {
        display_name: data.display_name.trim().slice(0, 60),
        full_name: (data.full_name ?? '').trim().slice(0, 120),
        whatsapp: (data.whatsapp ?? '').trim().slice(0, 30),
        city: (data.city ?? '').trim().slice(0, 80),
        website: (data.website ?? '').trim().slice(0, 200),
        bio: (data.bio ?? '').trim().slice(0, 600),
        updated_at: new Date().toISOString(),
      },
    });
    return { ok: true };
  });

/** Unggah/ganti foto profil — disimpan ke akun Google Drive aktif. */
export const uploadMyAvatar = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; name: string; mime: string; dataBase64: string }) => {
    if (!d.mime?.startsWith('image/')) throw new Error('Berkas harus berupa gambar.');
    return d;
  })
  .handler(async ({ data }) => {
    const user = await requireUser(data.token);
    const { activeAccount, uploadFile, upsertAsset } = await import('./gdrive.server');
    const acc = await activeAccount();
    if (!acc?.refresh_token) {
      throw new Error('Penyimpanan media belum siap. Hubungi admin situs.');
    }
    const bin = atob(data.dataBase64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (bytes.length > 3_000_000) throw new Error('Ukuran gambar maksimal 3 MB.');

    const ext = (data.name.split('.').pop() ?? 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
    const clean = `${user.id}-${Date.now()}.${ext}`;
    const path = `avatar/${clean}`;
    const fileId = await uploadFile(acc, clean, data.mime, bytes.buffer);
    await upsertAsset({
      path,
      drive_file_id: fileId,
      account_id: acc.id,
      mime: data.mime,
      size: bytes.length,
    });
    const url = `/api/public/gambar/${path}`;
    await ensureProfile(user);
    await sbJson(`/rest/v1/profiles?id=eq.${user.id}`, {
      admin: true,
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { avatar_url: url, updated_at: new Date().toISOString() },
    });
    return { url };
  });

/* --------------------------- Pengajuan paket ---------------------------- */

export const submitPlanOrder = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; planId: string; contact?: string; note?: string }) => {
    if (!d.planId) throw new Error('Pilih paket terlebih dahulu.');
    return d;
  })
  .handler(async ({ data }) => {
    const user = await requireUser(data.token);
    const list = await plans();
    const plan = list.find((p) => p.id === data.planId);
    if (!plan) throw new Error('Paket tidak ditemukan.');
    await sbJson('/rest/v1/plan_orders', {
      admin: true,
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: {
        user_id: user.id,
        plan_id: plan.id,
        amount: plan.price,
        contact: (data.contact ?? '').trim().slice(0, 120),
        note: (data.note ?? '').trim().slice(0, 1000),
        status: 'pending',
      },
    });
    return { ok: true };
  });

/* ------------------------------ Suka artikel ---------------------------- */

export const getLikes = createServerFn({ method: 'POST' })
  .inputValidator((d: { postId: number; token?: string }) => d)
  .handler(async ({ data }) => {
    const rows = await sbJson<{ user_id: string }[]>(
      `/rest/v1/post_likes?select=user_id&post_id=eq.${data.postId}&limit=5000`,
      { admin: true },
    );
    let liked = false;
    if (data.token) {
      try {
        const user = await requireUser(data.token);
        liked = rows.some((r) => r.user_id === user.id);
      } catch {
        liked = false;
      }
    }
    return { count: rows.length, liked };
  });

export const toggleLike = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; postId: number }) => d)
  .handler(async ({ data }) => {
    const user = await requireUser(data.token);
    const existing = await sbJson<{ user_id: string }[]>(
      `/rest/v1/post_likes?select=user_id&post_id=eq.${data.postId}&user_id=eq.${user.id}&limit=1`,
      { admin: true },
    );
    if (existing[0]) {
      await sbJson(`/rest/v1/post_likes?post_id=eq.${data.postId}&user_id=eq.${user.id}`, {
        admin: true,
        method: 'DELETE',
      });
    } else {
      await sbJson('/rest/v1/post_likes', {
        admin: true,
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: { post_id: data.postId, user_id: user.id },
      });
    }
    return { liked: !existing[0] };
  });
