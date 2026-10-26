import { useRef, useState } from 'react';
import { ImageUp, Loader2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { ProductImage } from './menu';
import { Field, Input } from './ui';

/** Imagem por URL (ex.: Unsplash/Pexels) ou upload (JPG/PNG/WEBP até 3 MB). */
export function ImageField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const upload = async (file: File) => {
    setBusy(true);
    setErr('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await api<{ url: string }>('/admin/uploads', { method: 'POST', body: fd });
      onChange(r.url);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Field label="Imagem" error={err} hint="Envie uma foto ou cole o endereço de uma imagem com licença de uso.">
      <div className="flex gap-3">
        <ProductImage src={value || null} alt="Pré-visualização" className="size-20 shrink-0 rounded-xl" sizes="80px" />
        <div className="min-w-0 flex-1 space-y-2">
          <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://… ou /uploads/…" className="h-11 text-sm" />
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-verde-50 px-3 text-sm font-bold text-verde-800 hover:bg-verde-100">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />} Enviar imagem
          </button>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
      </div>
    </Field>
  );
}
