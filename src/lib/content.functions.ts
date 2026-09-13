import { createServerFn } from '@tanstack/react-start';
import { sbJson, sbList } from './sb.server';
import { fixMediaUrls } from './media';
import { cleanArticleHtml, cleanExcerpt } from './html';

export type PostCard = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  featured_image: string | null;
  published_at: string;
  author_name: string;
  comment_count: number;
};

export type Category = { id: number; name: string; slug: string; post_count: number };

const CARD = 'id,slug,title,excerpt,featured_image,published_at,author_name,comment_count';
const PER_PAGE = 12;

function range(page: number, per = PER_PAGE) {
  const from = (page - 1) * per;
  return { Range: `${from}-${from + per - 1}` };
}

export const listPosts = createServerFn({ method: 'GET' })
  .inputValidator((d: { page?: number; category?: string; tag?: string; q?: string }) => d)
  .handler(async ({ data }) => {
    const page = Math.max(1, Number(data.page ?? 1));
    let path = `/rest/v1/posts?select=${CARD}&status=eq.publish&post_type=eq.post&order=published_at.desc`;

    if (data.category) {
      const cats = await sbJson<Category[]>(
        `/rest/v1/categories?select=id,name,slug,post_count&slug=eq.${encodeURIComponent(data.category)}`,
      );
      const cat = cats[0];
      if (!cat) return { posts: [], total: 0, page, perPage: PER_PAGE, category: null };
      path = `/rest/v1/posts?select=${CARD},post_categories!inner(category_id)&status=eq.publish&post_categories.category_id=eq.${cat.id}&order=published_at.desc`;
      const res = await sbList<PostCard>(path, { headers: range(page) });
      return { posts: fixMediaUrls(res.data), total: res.total, page, perPage: PER_PAGE, category: cat };
    }

    if (data.tag) {
      const tags = await sbJson<{ id: number; name: string; slug: string }[]>(
        `/rest/v1/tags?select=id,name,slug&slug=eq.${encodeURIComponent(data.tag)}`,
      );
      const tag = tags[0];
      if (!tag) return { posts: [], total: 0, page, perPage: PER_PAGE, tag: null };
      path = `/rest/v1/posts?select=${CARD},post_tags!inner(tag_id)&status=eq.publish&post_tags.tag_id=eq.${tag.id}&order=published_at.desc`;
      const res = await sbList<PostCard>(path, { headers: range(page) });
      return { posts: fixMediaUrls(res.data), total: res.total, page, perPage: PER_PAGE, tag };
    }

    if (data.q) {
      const q = data.q.trim().slice(0, 80).replace(/[%,()*]/g, ' ');
      path = `/rest/v1/posts?select=${CARD}&status=eq.publish&post_type=eq.post&title=ilike.*${encodeURIComponent(q)}*&order=published_at.desc`;
    }

    const res = await sbList<PostCard>(path, { headers: range(page) });
    return { posts: fixMediaUrls(res.data), total: res.total, page, perPage: PER_PAGE };
  });

export const getPost = createServerFn({ method: 'GET' })
  .inputValidator((d: { slug: string }) => d)
  .handler(async ({ data }) => {
    const rows = await sbJson<
      (PostCard & {
        content: string;
        post_categories: { categories: { name: string; slug: string; id: number } | null }[];
        post_tags: { tags: { name: string; slug: string } | null }[];
      })[]
    >(
      `/rest/v1/posts?select=${CARD},content,post_categories(categories(id,name,slug)),post_tags(tags(name,slug))&slug=eq.${encodeURIComponent(
        data.slug,
      )}&status=eq.publish&limit=1`,
    );
    const post = rows[0];
    if (!post) return null;

    const catIds = post.post_categories.map((c) => c.categories?.id).filter(Boolean) as number[];
    let related: PostCard[] = [];
    if (catIds.length) {
      related = await sbJson<PostCard[]>(
        `/rest/v1/posts?select=${CARD},post_categories!inner(category_id)&status=eq.publish&post_categories.category_id=in.(${catIds.join(
          ',',
        )})&id=neq.${post.id}&order=published_at.desc&limit=6`,
      );
    }
    const comments = await sbJson<
      { id: number; author_name: string; content: string; created_at: string }[]
    >(
      `/rest/v1/comments?select=id,author_name,content,created_at&post_id=eq.${post.id}&status=eq.approved&order=created_at.asc`,
    );
    post.content = cleanArticleHtml(post.content);
    post.excerpt = cleanExcerpt(post.excerpt);
    return fixMediaUrls({ post, related, comments });
  });

export const listCategories = createServerFn({ method: 'GET' }).handler(async () =>
  sbJson<Category[]>(
    '/rest/v1/categories?select=id,name,slug,post_count&order=post_count.desc&limit=40',
  ),
);

export const popularPosts = createServerFn({ method: 'GET' }).handler(async () =>
  fixMediaUrls(
    await sbJson<PostCard[]>(
      `/rest/v1/posts?select=${CARD}&status=eq.publish&post_type=eq.post&order=comment_count.desc,published_at.desc&limit=6`,
    ),
  ),
);

export const getAds = createServerFn({ method: 'GET' }).handler(async () =>
  sbJson<{ slot: string; code: string }[]>(
    '/rest/v1/ad_slots?select=slot,code&enabled=eq.true',
  ),
);

export const submitComment = createServerFn({ method: 'POST' })
  .inputValidator((d: { postId: number; name: string; email?: string; content: string }) => {
    if (!d.name?.trim() || !d.content?.trim()) throw new Error('Nama dan komentar wajib diisi.');
    return d;
  })
  .handler(async ({ data }) => {
    await sbJson('/rest/v1/comments', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: {
        post_id: data.postId,
        author_name: data.name.trim().slice(0, 80),
        author_email: data.email?.trim().slice(0, 120) || null,
        content: data.content.trim().slice(0, 4000),
        status: 'pending',
      },
    });
    return { ok: true };
  });
