"""Pindahkan seluruh media (gambar/video) + cadangan artikel ke Google Drive.

Butuh env: SELFHOST_SB_URL, SELFHOST_SB_SERVICE_ROLE_KEY
Opsional  : FM_BASE_URL, FM_ROOT, FM_USER, FM_PASS (sumber media lama)

Pemakaian:
  python3 scripts/gdrive_sync.py --limit 20            # uji sebagian
  python3 scripts/gdrive_sync.py --articles            # + cadangan HTML artikel
  python3 scripts/gdrive_sync.py                       # semua artikel
"""
import argparse, base64, json, mimetypes, os, re, sys, threading, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

SB = os.environ['SELFHOST_SB_URL'].strip().rstrip('/').replace('http://', 'https://')
KEY = os.environ['SELFHOST_SB_SERVICE_ROLE_KEY'].strip()
FM_BASE = os.environ.get('FM_BASE_URL', '').rstrip('/')
FM_ROOT = os.environ.get('FM_ROOT', '').strip('/')
FM_USER = os.environ.get('FM_USER', '')
FM_PASS = os.environ.get('FM_PASS', '')

MIME = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif',
        'webp': 'image/webp', 'svg': 'image/svg+xml', 'avif': 'image/avif', 'bmp': 'image/bmp',
        'ico': 'image/x-icon', 'mp4': 'video/mp4', 'webm': 'video/webm', 'mp3': 'audio/mpeg',
        'pdf': 'application/pdf'}

PATH_RE = re.compile(r'/api/public/(?:gambar|media)/([^\s"\'<>)\\]+)', re.I)
OLD_RE = re.compile(r'(?:https?:)?//(?:www\.)?jadwalevent\.web\.id/wp-content/uploads/([^\s"\'<>)\\]+)', re.I)


def guess_mime(path):
    ext = path.rsplit('.', 1)[-1].lower() if '.' in path else ''
    return MIME.get(ext) or mimetypes.guess_type(path)[0] or 'application/octet-stream'


def req(url, data=None, headers=None, method=None, timeout=120):
    r = urllib.request.Request(url, data=data, method=method or ('POST' if data else 'GET'))
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    return urllib.request.urlopen(r, timeout=timeout)


def sb(path, method='GET', body=None, prefer=None, extra=None, tries=4):
    h = {'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json'}
    if prefer:
        h['Prefer'] = prefer
    h.update(extra or {})
    data = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
    last = None
    for attempt in range(tries):
        try:
            with req(SB + path, data=data, headers=h, method=method) as r:
                txt = r.read()
                return json.loads(txt) if txt else None
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (attempt + 1))
    raise last


# ---------------- akun Drive ----------------
acc = sb('/rest/v1/gdrive_accounts?select=*&is_active=eq.true&enabled=eq.true&limit=1')[0]
_tok = {'v': None, 'exp': 0}
_lock = threading.Lock()


def token():
    with _lock:
        if _tok['v'] and _tok['exp'] > time.time() + 60:
            return _tok['v']
        body = urllib.parse.urlencode({
            'client_id': acc['client_id'], 'client_secret': acc['client_secret'],
            'refresh_token': acc['refresh_token'], 'grant_type': 'refresh_token'}).encode()
        with req('https://oauth2.googleapis.com/token', data=body,
                 headers={'Content-Type': 'application/x-www-form-urlencoded'}) as r:
            j = json.loads(r.read())
        _tok['v'] = j['access_token']
        _tok['exp'] = time.time() + j.get('expires_in', 3600)
        return _tok['v']


def ensure_root():
    if acc.get('root_folder_id'):
        return acc['root_folder_id']
    body = json.dumps({'name': acc['root_folder_name'] or 'Media Situs',
                       'mimeType': 'application/vnd.google-apps.folder'}).encode()
    with req('https://www.googleapis.com/drive/v3/files?fields=id', data=body,
             headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'}) as r:
        fid = json.loads(r.read())['id']
    sb(f"/rest/v1/gdrive_accounts?id=eq.{acc['id']}", 'PATCH', {'root_folder_id': fid}, 'return=minimal')
    acc['root_folder_id'] = fid
    return fid


ROOT = ensure_root()


def drive_upload(name, mime, blob):
    boundary = '----lv' + base64.b16encode(os.urandom(8)).decode()
    meta = json.dumps({'name': name, 'parents': [ROOT]}).encode()
    body = (f'--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'.encode() + meta
            + f'\r\n--{boundary}\r\nContent-Type: {mime}\r\n\r\n'.encode() + blob
            + f'\r\n--{boundary}--\r\n'.encode())
    last = ''
    for attempt in range(3):
        try:
            with req('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
                     data=body, headers={'Authorization': 'Bearer ' + token(),
                                         'Content-Type': f'multipart/related; boundary={boundary}'},
                     timeout=300) as r:
                return json.loads(r.read())['id']
        except urllib.error.HTTPError as e:
            last = f'{e.code} {e.read()[:120]!r}'
            if e.code in (401, 403, 408, 429, 500, 502, 503, 504):
                time.sleep(2 * (attempt + 1))
                continue
            raise
        except Exception as e:  # noqa: BLE001
            last = str(e)
            time.sleep(2 * (attempt + 1))
    raise RuntimeError('unggah gagal: ' + last)


# ---------------- sumber media lama ----------------
def enc(rel):
    return '/'.join(urllib.parse.quote(p) for p in rel.split('/'))


def b64url(s):
    return base64.b64encode(s.encode()).decode().replace('+', '-').replace('/', '_').rstrip('=')


def fetch_legacy(rel):
    urls = [(f'{SB}/storage/v1/object/public/legacy-images/{enc(rel)}', {})]
    if FM_BASE and FM_ROOT:
        auth = base64.b64encode(f'{FM_USER}:{FM_PASS}'.encode()).decode()
        urls.append((f'{FM_BASE}/php/connector.minimal.php?cmd=file&download=1'
                     f'&target=l1_{b64url(FM_ROOT + "/" + rel)}', {'Authorization': 'Basic ' + auth}))
    urls.append((f'https://web.archive.org/web/2016id_/http://jadwalevent.web.id/wp-content/uploads/{enc(rel)}', {}))
    for url, h in urls:
        try:
            with req(url, headers=h, timeout=90) as r:
                ct = r.headers.get('content-type', '')
                if ct.startswith('text/html'):
                    continue
                data = r.read()
                if len(data) < 64:
                    continue
                m = guess_mime(rel)
                return data, (m if m != 'application/octet-stream' else (ct or m))
        except Exception:  # noqa: BLE001
            continue
    return None


# ---------------- inti ----------------
def media_paths(post):
    hay = (post.get('content') or '') + ' ' + (post.get('featured_image') or '')
    out = []
    for m in list(PATH_RE.finditer(hay)) + list(OLD_RE.finditer(hay)):
        raw = urllib.parse.unquote(m.group(1).replace('&amp;', '&').strip())
        if raw and '..' not in raw and len(raw) < 300 and raw not in out:
            out.append(raw)
    return out


def existing_paths(paths):
    got = set()
    for i in range(0, len(paths), 60):
        chunk = paths[i:i + 60]
        q = ','.join('"' + p.replace('"', '') + '"' for p in chunk)
        rows = sb(f'/rest/v1/media_assets?select=path&path=in.({urllib.parse.quote(q)})')
        got.update(r['path'] for r in rows)
    return got


def upsert(rows):
    sb('/rest/v1/media_assets?on_conflict=path', 'POST', rows,
       'resolution=merge-duplicates,return=minimal')


def article_html(p):
    return (f"<!doctype html><meta charset=\"utf-8\"><title>{p['title']}</title>\n"
            f"<!-- slug: {p['slug']} | id: {p['id']} | terbit: {p['published_at']} -->\n"
            f"<h1>{p['title']}</h1>\n<p>{p.get('excerpt') or ''}</p>\n{p.get('content') or ''}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0, help='jumlah artikel (0 = semua)')
    ap.add_argument('--offset', type=int, default=0)
    ap.add_argument('--articles', action='store_true', help='cadangkan HTML artikel ke Drive')
    ap.add_argument('--workers', type=int, default=6)
    a = ap.parse_args()

    sel = 'id,slug,title,content,excerpt,featured_image,published_at'
    page = 100
    offset = a.offset
    total_target = a.limit or 10**9
    done_posts = up = skip = miss = arts = 0
    t0 = time.time()

    while done_posts < total_target:
        take = min(page, total_target - done_posts)
        posts = sb(f'/rest/v1/posts?select={sel}&order=id.asc&offset={offset}&limit={take}')
        if not posts:
            break
        offset += len(posts)
        done_posts += len(posts)

        wanted = []
        for p in posts:
            wanted += [x for x in media_paths(p) if x not in wanted]
        have = existing_paths(wanted) if wanted else set()
        todo = [x for x in wanted if x not in have]
        skip += len(wanted) - len(todo)

        rows, errs = [], 0

        def work(path):
            try:
                got = fetch_legacy(path)
                if not got:
                    return None
                blob, mime = got
                fid = drive_upload(path.replace('/', '__'), mime, blob)
                return {'path': path, 'drive_file_id': fid, 'account_id': acc['id'],
                        'mime': mime, 'size': len(blob)}
            except Exception:  # noqa: BLE001
                return None

        if todo:
            with ThreadPoolExecutor(max_workers=a.workers) as ex:
                for res in ex.map(lambda p: (lambda: work(p))(), todo):
                    if res:
                        rows.append(res)
                    else:
                        errs += 1
            if rows:
                upsert(rows)
            up += len(rows)
            miss += errs

        if a.articles:
            art_paths = [f"artikel/{p['slug']}.html" for p in posts]
            have_a = existing_paths(art_paths)
            def art(p):
                path = f"artikel/{p['slug']}.html"
                if path in have_a:
                    return None
                blob = article_html(p).encode()
                try:
                    fid = drive_upload(path.replace('/', '__'), 'text/html', blob)
                except Exception:  # noqa: BLE001
                    return None
                return {'path': path, 'drive_file_id': fid, 'account_id': acc['id'],
                        'mime': 'text/html', 'size': len(blob)}

            with ThreadPoolExecutor(max_workers=a.workers) as ex:
                arows = [r for r in ex.map(art, posts) if r]
            if arows:
                upsert(arows)
            arts += len(arows)

        print(f'{done_posts} artikel · {up} media baru · {skip} sudah ada · {miss} tak ditemukan'
              f' · {arts} cadangan artikel · {int(time.time() - t0)}s', flush=True)
        if len(posts) < take:
            break

    print('selesai')


if __name__ == '__main__':
    main()
