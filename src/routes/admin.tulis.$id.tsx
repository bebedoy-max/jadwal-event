import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { adminGetPost, adminSavePost } from '@/lib/admin.functions';
import { driveUpload } from '@/lib/gdrive.functions';
import { getToken } from '@/lib/useAdminToken';

async function toBase64(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 8192) {
    bin += String.fromCharCode(...buf.subarray(i, i + 8192));
  }
  return btoa(bin);
}

export const Route = createFileRoute('/admin/tulis/$id')({ component: Editor });

function Editor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const isNew = id === 'baru';

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [image, setImage] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState('publish');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [uploading, setUploading] = useState(false);

  /** Unggah berkas ke Google Drive aktif, lalu pakai alamatnya di artikel. */
  const upload = async (file: File, target: 'utama' | 'isi') => {
    setUploading(true);
    setMsg('');
    try {
      const { url } = await driveUpload({
        data: {
          token: getToken(),
          name: file.name,
          mime: file.type || 'application/octet-stream',
          dataBase64: await toBase64(file),
        },
      });
      if (target === 'utama') setImage(url);
      else setContent((c) => `${c}\n<figure><img src="${url}" alt="${file.name}" /></figure>\n`);
      setMsg('Berkas tersimpan di Google Drive.');
    } catch (error) {
      setMsg(error instanceof Error ? error.message : 'Unggah gagal.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (isNew) return;
    void (async () => {
      const p = await adminGetPost({ data: { token: getToken(), id: Number(id) } });
      if (!p) return;
      setTitle(p.title);
      setSlug(p.slug);
      setExcerpt(p.excerpt ?? '');
      setImage(p.featured_image ?? '');
      setContent(p.content ?? '');
      setStatus(p.status);
    })();
  }, [id, isNew]);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg('');
        try {
          await adminSavePost({
            data: {
              token: getToken(),
              ...(isNew ? {} : { id: Number(id) }),
              title,
              slug,
              excerpt,
              featured_image: image,
              content,
              status,
            },
          });
          setMsg('Artikel tersimpan.');
          if (isNew) navigate({ to: '/admin' });
        } catch (error) {
          setMsg(error instanceof Error ? error.message : 'Gagal menyimpan.');
        } finally {
          setBusy(false);
        }
      }}
    >
      <h1 className="font-display text-xl font-bold">{isNew ? 'Tulis Artikel' : 'Edit Artikel'}</h1>

      <input
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Judul artikel"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-lg outline-none focus:border-primary"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="URL (kosongkan untuk otomatis)"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <input
          value={image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="URL gambar utama"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border p-3 text-sm">
        <span className="text-muted-foreground">
          {uploading ? 'Mengunggah ke Google Drive…' : 'Unggah gambar/video ke Google Drive:'}
        </span>
        <label className="cursor-pointer rounded-md border border-border px-3 py-1.5">
          Jadikan gambar utama
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void upload(f, 'utama');
            }}
          />
        </label>
        <label className="cursor-pointer rounded-md border border-border px-3 py-1.5">
          Sisipkan ke isi artikel
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void upload(f, 'isi');
            }}
          />
        </label>
      </div>

      <textarea
        value={excerpt}
        onChange={(e) => setExcerpt(e.target.value)}
        rows={2}
        placeholder="Ringkasan singkat"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={20}
        placeholder="Isi artikel (boleh HTML)"
        className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
      />
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="publish">Terbit</option>
          <option value="draft">Draf</option>
        </select>
        <button
          disabled={busy}
          className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? 'Menyimpan…' : 'Simpan'}
        </button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </form>
  );
}
