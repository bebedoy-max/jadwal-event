/** Alihkan URL gambar situs lama (domain sudah kedaluwarsa) ke proksi internal. */
const OLD_UPLOADS = /(?:https?:)?\/\/(?:www\.)?jadwalevent\.web\.id\/wp-content\/uploads\//gi;

export function fixMediaUrls<T>(value: T): T {
  if (value == null) return value;
  const json = JSON.stringify(value);
  if (!json) return value;
  return JSON.parse(json.replace(OLD_UPLOADS, '/api/public/gambar/')) as T;
}
