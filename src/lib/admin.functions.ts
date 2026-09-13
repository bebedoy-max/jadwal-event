import { createServerFn } from '@tanstack/react-start';
import { requireAdmin, sbFetch, sbJson, sbList } from './sb.server';

export const adminLogin = createServerFn({ method: 'POST' })
  .inputValidator((d: { email: string; password: string }) => d)
  .handler(async ({ data }) => {
    const res = await sbFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: data.email, password: data.password },
    });
    if (!res.ok) throw new Error('Email atau kata sandi salah.');
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    await requireAdmin(json.access_token);
    return {
      token: json.access_token,
      refresh: json.refresh_token ?? '',
      expiresIn: json.expires_in ?? 3600,
    };
  });

/** Verifikasi bahwa token sesi user umum milik akun ber-role admin. */
export const checkAdminRole = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    return { ok: true };
  });

/** Perpanjang sesi admin memakai refresh token. */
export const adminRefresh = createServerFn({ method: 'POST' })
  .inputValidator((d: { refresh: string }) => d)
  .handler(async ({ data }) => {
    if (!data.refresh) throw new Error('Sesi berakhir, silakan login ulang.');
    const res = await sbFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: data.refresh },
    });
    if (!res.ok) throw new Error('Sesi berakhir, silakan login ulang.');
    const json = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    return {
      token: json.access_token,
      refresh: json.refresh_token ?? data.refresh,
      expiresIn: json.expires_in ?? 3600,
    };
  });

export const adminListPosts = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; q?: string; page?: number }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const page = Math.max(1, Number(data.page ?? 1));
    const from = (page - 1) * 20;
    const q = data.q?.trim().replace(/[%,()*]/g, ' ');
    const filter = q ? `&title=ilike.*${encodeURIComponent(q)}*` : '';
    const res = await sbList<{
      id: number;
      title: string;
      slug: string;
      status: string;
      published_at: string;
    }>(
      `/rest/v1/posts?select=id,title,slug,status,published_at&post_type=eq.post${filter}&order=published_at.desc`,
      { admin: true, headers: { Range: `${from}-${from + 19}` } },
    );
    return { posts: res.data, total: res.total, page };
  });

export type AdminPost = {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  featured_image: string | null;
  status: string;
  published_at: string;
};

export const adminGetPost = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; id: number }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const rows = await sbJson<AdminPost[]>(
      `/rest/v1/posts?select=id,title,slug,content,excerpt,featured_image,status,published_at&id=eq.${data.id}&limit=1`,
      { admin: true },
    );
    return rows[0] ?? null;
  });

export const adminSavePost = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: {
      token: string;
      id?: number;
      title: string;
      slug: string;
      content: string;
      excerpt?: string;
      featured_image?: string;
      status: string;
      categoryIds?: number[];
    }) => {
      if (!d.title?.trim()) throw new Error('Judul wajib diisi.');
      return d;
    },
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const slug =
      data.slug?.trim() ||
      data.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 180);
    const body = {
      title: data.title.trim(),
      slug,
      content: data.content ?? '',
      excerpt: (data.excerpt ?? '').slice(0, 300),
      featured_image: data.featured_image || null,
      status: data.status,
      post_type: 'post',
      updated_at: new Date().toISOString(),
    };

    let id = data.id;
    if (id) {
      await sbJson(`/rest/v1/posts?id=eq.${id}`, {
        admin: true,
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body,
      });
    } else {
      const max = await sbJson<{ id: number }[]>(
        '/rest/v1/posts?select=id&order=id.desc&limit=1',
        { admin: true },
      );
      id = (max[0]?.id ?? 0) + 1;
      await sbJson('/rest/v1/posts', {
        admin: true,
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: { ...body, id, published_at: new Date().toISOString() },
      });
    }

    if (data.categoryIds) {
      await sbJson(`/rest/v1/post_categories?post_id=eq.${id}`, { admin: true, method: 'DELETE' });
      if (data.categoryIds.length) {
        await sbJson('/rest/v1/post_categories', {
          admin: true,
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body: data.categoryIds.map((c) => ({ post_id: id, category_id: c })),
        });
      }
    }
    // Cadangkan isi artikel sebagai berkas HTML di Google Drive aktif.
    try {
      const { activeAccount, ingestText } = await import('./gdrive.server');
      const acc = await activeAccount();
      if (acc?.refresh_token) {
        const html = `<!doctype html><meta charset="utf-8"><title>${body.title}</title>\n<!-- slug: ${slug} | id: ${id} -->\n<h1>${body.title}</h1>\n<p>${body.excerpt}</p>\n${body.content}`;
        await ingestText(acc, `artikel/${slug}.html`, html);
      }
    } catch {
      /* cadangan gagal tidak boleh membatalkan penyimpanan artikel */
    }

    return { id, slug };
  });

export const adminDeletePost = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; id: number }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    await sbJson(`/rest/v1/posts?id=eq.${data.id}`, { admin: true, method: 'DELETE' });
    return { ok: true };
  });

export const adminListComments = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; status?: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const status = data.status ?? 'pending';
    return sbJson<
      { id: number; post_id: number; author_name: string; content: string; created_at: string }[]
    >(
      `/rest/v1/comments?select=id,post_id,author_name,content,created_at&status=eq.${status}&order=created_at.desc&limit=100`,
      { admin: true },
    );
  });

export const adminModerateComment = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; id: number; action: 'approve' | 'delete' }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    if (data.action === 'delete') {
      await sbJson(`/rest/v1/comments?id=eq.${data.id}`, { admin: true, method: 'DELETE' });
    } else {
      await sbJson(`/rest/v1/comments?id=eq.${data.id}`, {
        admin: true,
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: { status: 'approved' },
      });
    }
    return { ok: true };
  });

export const adminListAds = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    return sbJson<{ slot: string; label: string; code: string; enabled: boolean }[]>(
      '/rest/v1/ad_slots?select=slot,label,code,enabled&order=slot.asc',
      { admin: true },
    );
  });

export const adminSaveAd = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; slot: string; code: string; enabled: boolean }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    await sbJson(`/rest/v1/ad_slots?slot=eq.${encodeURIComponent(data.slot)}`, {
      admin: true,
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: { code: data.code, enabled: data.enabled },
    });
    return { ok: true };
  });

/* --------------------------- Pengajuan paket ---------------------------- */

export type AdminOrder = {
  id: number;
  user_id: string;
  plan_id: string;
  amount: number;
  contact: string;
  note: string;
  status: string;
  admin_note: string;
  created_at: string;
};

export const adminListOrders = createServerFn({ method: 'POST' })
  .inputValidator((d: { token: string; status?: string }) => d)
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const filter = data.status && data.status !== 'all' ? `&status=eq.${data.status}` : '';
    const orders = await sbJson<AdminOrder[]>(
      `/rest/v1/plan_orders?select=id,user_id,plan_id,amount,contact,note,status,admin_note,created_at&order=created_at.desc&limit=200${filter}`,
      { admin: true },
    );
    const ids = [...new Set(orders.map((o) => o.user_id))];
    const profiles = ids.length
      ? await sbJson<{ id: string; display_name: string; whatsapp: string }[]>(
          `/rest/v1/profiles?select=id,display_name,whatsapp&id=in.(${ids.join(',')})`,
          { admin: true },
        )
      : [];
    return orders.map((o) => ({
      ...o,
      user_name: profiles.find((p) => p.id === o.user_id)?.display_name ?? o.user_id.slice(0, 8),
    }));
  });

/** Setujui / tolak / tandai lunas. Menyetujui mengaktifkan langganan user. */
export const adminDecideOrder = createServerFn({ method: 'POST' })
  .inputValidator(
    (d: {
      token: string;
      id: number;
      action: 'approve' | 'reject' | 'paid';
      adminNote?: string;
    }) => d,
  )
  .handler(async ({ data }) => {
    await requireAdmin(data.token);
    const rows = await sbJson<
      { id: number; user_id: string; plan_id: string }[]
    >(`/rest/v1/plan_orders?select=id,user_id,plan_id&id=eq.${data.id}&limit=1`, { admin: true });
    const order = rows[0];
    if (!order) throw new Error('Pengajuan tidak ditemukan.');

    const status = data.action === 'reject' ? 'rejected' : data.action === 'paid' ? 'paid' : 'approved';
    await sbJson(`/rest/v1/plan_orders?id=eq.${data.id}`, {
      admin: true,
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: {
        status,
        admin_note: (data.adminNote ?? '').slice(0, 500),
        updated_at: new Date().toISOString(),
      },
    });

    if (data.action !== 'reject') {
      const plans = await sbJson<{ id: string; days: number }[]>(
        `/rest/v1/plans?select=id,days&id=eq.${order.plan_id}&limit=1`,
        { admin: true },
      );
      const days = plans[0]?.days ?? 30;
      const expires =
        days > 0 ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
      const existing = await sbJson<{ user_id: string }[]>(
        `/rest/v1/subscriptions?select=user_id&user_id=eq.${order.user_id}&limit=1`,
        { admin: true },
      );
      const body = {
        user_id: order.user_id,
        plan_id: order.plan_id,
        status: 'active',
        started_at: new Date().toISOString(),
        expires_at: expires,
      };
      if (existing[0]) {
        await sbJson(`/rest/v1/subscriptions?user_id=eq.${order.user_id}`, {
          admin: true,
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body,
        });
      } else {
        await sbJson('/rest/v1/subscriptions', {
          admin: true,
          method: 'POST',
          headers: { Prefer: 'return=minimal' },
          body,
        });
      }
    }
    return { ok: true };
  });
