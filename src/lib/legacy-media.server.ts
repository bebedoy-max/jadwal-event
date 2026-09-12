/** Pengambilan berkas media lama (storage lama, file manager VPS, arsip web). Server-only. */

export const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  pdf: 'application/pdf',
};

export function guessMime(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_TYPES[ext] ?? 'application/octet-stream';
}

function b64url(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function encPath(rel: string) {
  return rel.split('/').map(encodeURIComponent).join('/');
}

export type LegacyFile = { bytes: ArrayBuffer; mime: string };

/** Coba semua sumber lama secara berurutan. Mengembalikan null jika tidak ketemu. */
export async function fetchLegacyMedia(rel: string): Promise<LegacyFile | null> {
  const mime = guessMime(rel);
  const storageBase = (process.env['SELFHOST_SB_URL'] ?? '').replace(/\/+$/, '');
  const base = (process.env['FM_BASE_URL'] ?? '').replace(/\/+$/, '');
  const root = (process.env['FM_ROOT'] ?? '').replace(/^\/+|\/+$/g, '');
  const user = process.env['FM_USER'] ?? '';
  const pass = process.env['FM_PASS'] ?? '';

  const take = async (res: Response) => {
    const ct = res.headers.get('content-type') ?? '';
    if (!res.ok || ct.startsWith('text/html')) return null;
    const bytes = await res.arrayBuffer();
    if (bytes.byteLength < 64) return null;
    return { bytes, mime: mime !== 'application/octet-stream' ? mime : ct || mime } as LegacyFile;
  };

  if (storageBase) {
    try {
      const r = await fetch(`${storageBase}/storage/v1/object/public/legacy-images/${encPath(rel)}`);
      const got = await take(r);
      if (got) return got;
    } catch {
      /* lanjut */
    }
  }

  if (base && root) {
    try {
      const target = `l1_${b64url(`${root}/${rel}`)}`;
      const r = await fetch(`${base}/php/connector.minimal.php?cmd=file&target=${target}&download=1`, {
        headers: { Authorization: `Basic ${btoa(`${user}:${pass}`)}` },
      });
      const got = await take(r);
      if (got) return got;
    } catch {
      /* lanjut */
    }
  }

  try {
    const r = await fetch(
      `https://web.archive.org/web/2016id_/http://jadwalevent.web.id/wp-content/uploads/${encPath(rel)}`,
      { redirect: 'follow' },
    );
    const got = await take(r);
    if (got) return got;
  } catch {
    /* abaikan */
  }

  return null;
}
