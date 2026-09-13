import { createServerFn } from '@tanstack/react-start';
import { requireAdmin, sbFetch, sbJson } from './sb.server';

export type ManagedUser = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed: boolean;
  display_name: string;
  whatsapp: string;
  city: string;
  avatar_url: string | null;
  role: string; // admin | editor | user
  plan_id: string;
  plan_status: string;
  expires_at: string | null;
};

/** Daftar pengguna dari Auth + profil, role, dan langganan. */
export const adminListUsers = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; page?: number; q?: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const page = Math.max(1, Number(data.page ?? 1));
    const res = await sbFetch(`/auth/v1/admin/users?page=${page}&per_page=50`, { admin: true });
    if (!res.ok) throw new Error(`Gagal memuat daftar pengguna (${res.status}).`);
    const json = (await res.json()) as {
      users: {
        id: string;
        email?: string;
        created_at: string;
        last_sign_in_at?: string | null;
        confirmed_at?: string | null;
        email_confirmed_at?: string | null;
      }[];
      total?: number;
    };
    let users = json.users ?? [];
    const q = (data.q ?? '').trim().toLowerCase();

    const ids = users.map((u) => u.id);
    const inList = ids.length ? `(${ids.join(',')})` : '(00000000-0000-0000-0000-000000000000)';
    const [profiles, roles, subs] = await Promise.all([
      sbJson<
        { id: string; display_name: string; whatsapp: string; city: string; avatar_url: string | null }[]
      >(`/rest/v1/profiles?select=id,display_name,whatsapp,city,avatar_url&id=in.${inList}`, {
        admin: true,
      }),
      sbJson<{ user_id: string; role: string }[]>(
        `/rest/v1/user_roles?select=user_id,role&user_id=in.${inList}`,
        { admin: true },
      ),
      sbJson<{ user_id: string; plan_id: string; status: string; expires_at: string | null }[]>(
        `/rest/v1/subscriptions?select=user_id,plan_id,status,expires_at&user_id=in.${inList}`,
        { admin: true },
      ),
    ]);

    let rows: ManagedUser[] = users.map((u) => {
      const p = profiles.find((x) => x.id === u.id);
      const s = subs.find((x) => x.user_id === u.id);
      return {
        id: u.id,
        email: u.email ?? '',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at),
        display_name: p?.display_name ?? '',
        whatsapp: p?.whatsapp ?? '',
        city: p?.city ?? '',
        avatar_url: p?.avatar_url ?? null,
        role: roles.find((r) => r.user_id === u.id)?.role ?? 'user',
        plan_id: s?.plan_id ?? 'free',
        plan_status: s?.status ?? '-',
        expires_at: s?.expires_at ?? null,
      };
    });

    if (q)
      rows = rows.filter(
        (r) =>
          r.email.toLowerCase().includes(q) ||
          r.display_name.toLowerCase().includes(q) ||
          r.whatsapp.includes(q),
      );

    users = [];
    return { users: rows, page, total: json.total ?? rows.length };
  });

/** Ubah role: 'user' menghapus semua baris role. */
export const adminSetUserRole = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; userId: string; role: 'admin' | 'editor' | 'user' }) => d)
  .handler(async ({ data }) => {
    const me = await requireAdmin(data.token);
    if (me.id === data.userId && data.role !== 'admin')
      throw new Error('Anda tidak bisa mencabut role admin milik akun sendiri.');
    await sbJson(`/rest/v1/user_roles?user_id=eq.${data.userId}`, { admin: true, method: 'DELETE' });
    if (data.role !== 'user') {
      await sbJson('/rest/v1/user_roles', {
        admin: true,
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: { user_id: data.userId, role: data.role },
      });
    }
    return { ok: true };
  });

/** Set langganan manual (mis. memberi Pro tanpa pembayaran). */
export const adminSetSubscription = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; userId: string; planId: string; days?: number }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const { activateSubscription } = await import('./payments.server');
    if (typeof data.days === 'number' && data.days > 0) {
      await sbJson('/rest/v1/subscriptions?on_conflict=user_id', {
        admin: true,
        method: 'POST',
        headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
        body: {
          user_id: data.userId,
          plan_id: data.planId,
          status: 'active',
          started_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + data.days * 86_400_000).toISOString(),
        },
      });
    } else {
      await activateSubscription(data.userId, data.planId);
    }
    return { ok: true };
  });

/** Hapus akun pengguna beserta data terkait (cascade). */
export const adminDeleteUser = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; userId: string }) => d)
  .handler(async ({ data }) => {
    const me = await requireAdmin(data.token);
    if (me.id === data.userId) throw new Error('Anda tidak bisa menghapus akun sendiri.');
    const res = await sbFetch(`/auth/v1/admin/users/${data.userId}`, {
      admin: true,
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Gagal menghapus akun (${res.status}).`);
    return { ok: true };
  });

/** Kirim tautan setel ulang kata sandi ke email pengguna. */
export const adminSendReset = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; email: string; redirectTo?: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const res = await sbFetch('/auth/v1/recover', {
      method: 'POST',
      body: { email: data.email, ...(data.redirectTo ? { redirect_to: data.redirectTo } : {}) },
    });
    if (!res.ok) throw new Error('Gagal mengirim email setel ulang kata sandi.');
    return { ok: true };
  });

export const adminListPlanOptions = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    return sbJson<{ id: string; name: string; days: number }[]>(
      '/rest/v1/plans?select=id,name,days&order=sort.asc',
      { admin: true },
    );
  });
