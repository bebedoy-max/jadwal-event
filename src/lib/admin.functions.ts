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
