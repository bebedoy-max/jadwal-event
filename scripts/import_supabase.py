"""Impor data hasil transform ke Supabase self-hosted lewat PostgREST.

Butuh env: SELFHOST_SB_URL, SELFHOST_SB_SERVICE_ROLE_KEY
Jalankan  : python3 scripts/import_supabase.py [tabel ...]
"""
import json, os, sys, urllib.request, time

URL = os.environ['SELFHOST_SB_URL'].rstrip('/')
KEY = os.environ['SELFHOST_SB_SERVICE_ROLE_KEY']
OUT = '/tmp/wp/out/'

ORDER = ['categories', 'tags', 'posts', 'post_categories', 'post_tags', 'comments']
BATCH = {'posts': 200, 'categories': 500, 'tags': 1000,
         'post_categories': 1000, 'post_tags': 1000, 'comments': 200}


def post(table, rows):
    body = json.dumps(rows, ensure_ascii=False).encode()
    req = urllib.request.Request(
        f'{URL}/rest/v1/{table}?on_conflict=' + ('slug' if table in ('posts',) else 'id'),
        data=body, method='POST',
        headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}',
                 'Content-Type': 'application/json',
                 'Prefer': 'resolution=merge-duplicates,return=minimal'})
    if table in ('post_categories', 'post_tags', 'comments'):
        req.full_url = f'{URL}/rest/v1/{table}'
        req.add_header('Prefer', 'return=minimal')
    with urllib.request.urlopen(req, timeout=120) as r:
        r.read()


def load(table):
    with open(OUT + table + '.jsonl', encoding='utf-8') as f:
        return [json.loads(l) for l in f]


tables = sys.argv[1:] or ORDER
for t in tables:
    rows = load(t)
    size = BATCH.get(t, 500)
    done = 0
    for i in range(0, len(rows), size):
        chunk = rows[i:i + size]
        for attempt in range(3):
            try:
                post(t, chunk)
                break
            except Exception as e:  # noqa: BLE001
                if attempt == 2:
                    raise
                time.sleep(2)
        done += len(chunk)
        print(f'{t}: {done}/{len(rows)}', flush=True)
print('selesai')
