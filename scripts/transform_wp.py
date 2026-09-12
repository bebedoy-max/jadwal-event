"""Ubah hasil parse dump WordPress (JSONL) menjadi baris siap impor ke Supabase.

Masukan  : /tmp/wp/t40J4s_*.jsonl (hasil scripts/parse_wp_dump.py)
Keluaran : /tmp/wp/out/<tabel>.jsonl
"""
import json, os, html, re

SRC = '/tmp/wp/'
OUT = '/tmp/wp/out/'
P = 't40J4s_'
os.makedirs(OUT, exist_ok=True)


def rows(name):
    with open(SRC + P + name + '.jsonl', encoding='utf-8') as f:
        for line in f:
            yield json.loads(line)


def w(name, items):
    with open(OUT + name + '.jsonl', 'w', encoding='utf-8') as f:
        n = 0
        for it in items:
            f.write(json.dumps(it, ensure_ascii=False) + '\n')
            n += 1
    print(name, n)


def dt(v):
    if not v or str(v).startswith('0000'):
        return '1970-01-01T00:00:00+00:00'
    return str(v).replace(' ', 'T') + '+07:00'


def clean(t):
    return html.unescape(str(t or '')).strip()


# ---- terms / taxonomy ----
terms = {r['term_id']: r for r in rows('terms')}
tax = list(rows('term_taxonomy'))
cat_by_tt, tag_by_tt = {}, {}
cats, tags = [], []
for t in tax:
    term = terms.get(t['term_id'])
    if not term:
        continue
    if t['taxonomy'] == 'category':
        cat_by_tt[t['term_taxonomy_id']] = term['term_id']
        cats.append({
            'id': term['term_id'], 'name': clean(term['name']), 'slug': term['slug'],
            'description': clean(t.get('description')), 'parent_id': t.get('parent') or None,
            'post_count': t.get('count') or 0,
        })
    elif t['taxonomy'] == 'post_tag':
        tag_by_tt[t['term_taxonomy_id']] = term['term_id']
        tags.append({'id': term['term_id'], 'name': clean(term['name']), 'slug': term['slug'],
                     'post_count': t.get('count') or 0})

cat_ids = {c['id'] for c in cats}
for c in cats:
    if c['parent_id'] not in cat_ids:
        c['parent_id'] = None
w('categories', cats)
w('tags', tags)

# ---- users ----
authors = {u['ID']: clean(u.get('display_name') or u.get('user_login')) for u in rows('users')}

# ---- attachments + thumbnail meta ----
att_url = {}
posts_raw = []
for r in rows('posts'):
    if r['post_type'] == 'attachment':
        att_url[r['ID']] = r.get('guid')
    elif r['post_type'] in ('post', 'page') and r['post_status'] == 'publish':
        posts_raw.append(r)

thumb = {}
for m in rows('postmeta'):
    if m.get('meta_key') == '_thumbnail_id':
        try:
            thumb[m['post_id']] = int(m['meta_value'])
        except (TypeError, ValueError):
            pass

IMG = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']', re.I)
HREF_IMG = re.compile(r'href=["\']([^"\']+\.(?:jpe?g|png|webp|gif))["\']', re.I)
TAGS_RE = re.compile(r'<[^>]+>')


def first_image(content):
    m = IMG.search(content) or HREF_IMG.search(content)
    return m.group(1) if m else None


def excerpt_of(r):
    e = clean(r.get('post_excerpt'))
    if e:
        return e[:300]
    text = html.unescape(TAGS_RE.sub(' ', r.get('post_content') or ''))
    return re.sub(r'\s+', ' ', text).strip()[:300]


posts = []
for r in posts_raw:
    slug = r.get('post_name') or ('post-%s' % r['ID'])
    img = att_url.get(thumb.get(r['ID'])) or first_image(r.get('post_content') or '')
    posts.append({
        'id': r['ID'],
        'slug': slug,
        'title': clean(r.get('post_title')) or 'Tanpa judul',
        'content': r.get('post_content') or '',
        'excerpt': excerpt_of(r),
        'status': 'publish',
        'post_type': r['post_type'],
        'author_name': authors.get(r.get('post_author'), 'Admin'),
        'featured_image': img,
        'comment_count': r.get('comment_count') or 0,
        'published_at': dt(r.get('post_date')),
        'updated_at': dt(r.get('post_modified')),
    })

seen = set()
uniq = []
for p in sorted(posts, key=lambda x: x['published_at'], reverse=True):
    if p['slug'] in seen:
        p['slug'] = '%s-%s' % (p['slug'], p['id'])
    seen.add(p['slug'])
    uniq.append(p)
w('posts', uniq)

post_ids = {p['id'] for p in uniq}

pc, pt = [], []
for r in rows('term_relationships'):
    oid = r['object_id']
    if oid not in post_ids:
        continue
    ttid = r['term_taxonomy_id']
    if ttid in cat_by_tt:
        pc.append({'post_id': oid, 'category_id': cat_by_tt[ttid]})
    elif ttid in tag_by_tt:
        pt.append({'post_id': oid, 'tag_id': tag_by_tt[ttid]})
w('post_categories', pc)
w('post_tags', pt)

comments = []
for c in rows('comments'):
    if c['comment_post_ID'] not in post_ids or not clean(c.get('comment_content')):
        continue
    comments.append({
        'post_id': c['comment_post_ID'],
        'author_name': clean(c.get('comment_author')) or 'Anonim',
        'author_email': c.get('comment_author_email') or None,
        'content': clean(c.get('comment_content')),
        'status': 'approved' if str(c.get('comment_approved')) == '1' else 'pending',
        'created_at': dt(c.get('comment_date')),
    })
w('comments', comments)
