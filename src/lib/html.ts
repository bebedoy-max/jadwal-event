/**
 * Pembersih sisa-sisa WordPress pada isi artikel/halaman:
 * - buang komentar blok Gutenberg (<!-- wp:... -->)
 * - buang shortcode plugin yang tidak lagi ada ([sharethis-...], [APT id=...], dll)
 * - alihkan semua tautan domain lama ke domain aktif dan jadikan tautan internal relatif
 */

const OLD_HOSTS = /https?:\/\/(?:www\.)?jadwalevent\.(?:web\.id|com)/gi;

export function cleanExcerpt(text: string): string {
  return (text ?? '')
    .replace(/\[[^\]\n]{0,120}\]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function cleanArticleHtml(html: string): string {
  let out = html ?? '';

  // Komentar blok Gutenberg
  out = out.replace(/<!--\s*\/?wp:[\s\S]*?-->/g, '');

  // Shortcode plugin lama, baik berdiri sendiri maupun di dalam <p>
  out = out.replace(/<p[^>]*>\s*(?:\[[^\]\n]{0,120}\]\s*)+<\/p>/gi, '');
  out = out.replace(/\[[a-z0-9_-]+[^\]\n]{0,120}\]/gi, '');

  // Domain lama -> internal (relatif) agar semua tautan tetap di jadwalevent.com
  out = out.replace(OLD_HOSTS, '');
  out = out.replace(/\shref="\/?"/gi, ' href="/"');
  // Tautan internal tidak perlu membuka tab baru
  out = out.replace(
    /<a\s([^>]*href="\/[^"]*"[^>]*)>/gi,
    (_m, attrs: string) =>
      `<a ${attrs.replace(/\s*target="[^"]*"/gi, '').replace(/\s*rel="[^"]*"/gi, '')}>`,
  );

  // Paragraf kosong sisa pembersihan
  out = out.replace(/<p[^>]*>(\s|&nbsp;)*<\/p>/gi, '');

  return out.trim();
}
