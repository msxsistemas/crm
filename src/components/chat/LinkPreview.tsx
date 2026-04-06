import { useState, useEffect } from "react";
import api from "@/lib/api";

interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const URL_RE = /https?:\/\/[^\s"'<>]+/gi;

function extractFirstUrl(text: string): string | null {
  const matches = text.match(URL_RE);
  return matches?.[0] || null;
}

const cache = new Map<string, LinkPreviewData | null>();

const LinkPreview = ({ text, fromMe }: { text: string; fromMe: boolean }) => {
  const url = extractFirstUrl(text);
  const [preview, setPreview] = useState<LinkPreviewData | null | undefined>(undefined);

  useEffect(() => {
    if (!url) return;
    if (cache.has(url)) { setPreview(cache.get(url)!); return; }
    api.get<LinkPreviewData>(`/link-preview?url=${encodeURIComponent(url)}`)
      .then(data => { cache.set(url, data); setPreview(data); })
      .catch(() => { cache.set(url, null); setPreview(null); });
  }, [url]);

  if (!url || !preview) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-1 block rounded-lg overflow-hidden border text-left transition-opacity hover:opacity-90 ${fromMe ? 'border-[#025144] bg-[#022e26]' : 'border-[#2a3942] bg-[#1a2930]'}`}
    >
      {preview.image && (
        <img src={preview.image} alt="" className="w-full max-h-32 object-cover" loading="lazy" onError={e => (e.currentTarget.style.display = 'none')} />
      )}
      <div className="px-2.5 py-1.5">
        {preview.siteName && <p className="text-[10px] text-[#00a884] font-medium uppercase tracking-wide truncate">{preview.siteName}</p>}
        {preview.title && <p className="text-[12px] font-semibold text-[#e9edef] leading-tight truncate">{preview.title}</p>}
        {preview.description && <p className="text-[11px] text-[#8696a0] leading-snug line-clamp-2 mt-0.5">{preview.description}</p>}
      </div>
    </a>
  );
};

export default LinkPreview;
