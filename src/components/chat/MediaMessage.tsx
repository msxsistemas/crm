import { useState } from "react";
import { FileText, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface MediaMessageProps {
  mediaUrl: string;
  mediaType: string | null;
  body?: string;
  fromMe?: boolean;
}

const MediaMessage = ({ mediaUrl, mediaType, body, fromMe }: MediaMessageProps) => {
  const [imageOpen, setImageOpen] = useState(false);
  const type = mediaType?.toLowerCase() || "";
  const normalizedBody = body?.trim().toLowerCase() || "";
  const isGenericLabel = ["📷 imagem", "imagem", "🎤 áudio", "áudio", "🎥 vídeo", "vídeo", "📄 documento", "documento"].includes(normalizedBody);

  if (type.startsWith("image") || type === "image") {
    return (
      <>
        <div className="space-y-1">
          <button
            type="button"
            className="block w-full"
            onClick={() => setImageOpen(true)}
          >
            <img
              src={mediaUrl}
              alt={body || "Imagem"}
              className="w-full max-w-[220px] max-h-[280px] rounded-md cursor-pointer hover:opacity-90 transition-opacity object-cover"
              loading="lazy"
            />
          </button>
          {!isGenericLabel && body && (
            <p className="text-[14.2px] whitespace-pre-wrap px-1 leading-[19px]">{body}</p>
          )}
        </div>

        <Dialog open={imageOpen} onOpenChange={setImageOpen}>
          <DialogContent className="max-w-4xl border-[#2a3942] bg-[#111b21] p-2 sm:p-4">
            <img
              src={mediaUrl}
              alt={body || "Imagem ampliada"}
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (type.startsWith("audio") || type === "audio") {
    return (
      <div className="space-y-1 min-w-[240px] max-w-[280px]">
        <div className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2",
          fromMe ? "bg-[#025144]" : "bg-[#1a2930]"
        )}>
          <div className="relative shrink-0">
            <div className="w-[40px] h-[40px] rounded-full bg-[#00a884] flex items-center justify-center">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="white">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
              </svg>
            </div>
          </div>
          <audio controls className="flex-1 h-[32px] [&::-webkit-media-controls-panel]:bg-transparent [&::-webkit-media-controls-enclosure]:bg-transparent" preload="metadata">
            <source src={mediaUrl} />
          </audio>
        </div>
        {!isGenericLabel && body && (
          <p className="text-[13px] whitespace-pre-wrap px-1 leading-[18px]">{body}</p>
        )}
      </div>
    );
  }

  if (type.startsWith("video") || type === "video") {
    return (
      <>
        <div className="space-y-1">
          <button type="button" className="block w-full" onClick={() => setImageOpen(true)}>
            <video
              className="w-full max-w-[260px] rounded-md cursor-pointer hover:opacity-90 transition-opacity"
              preload="metadata"
              playsInline
              muted
            >
              <source src={mediaUrl} />
            </video>
          </button>
          {!isGenericLabel && body && (
            <p className="text-[14.2px] whitespace-pre-wrap px-1 leading-[19px]">{body}</p>
          )}
        </div>
        <Dialog open={imageOpen} onOpenChange={setImageOpen}>
          <DialogContent className="max-w-4xl border-[#2a3942] bg-[#111b21] p-2 sm:p-4">
            <video
              controls
              autoPlay
              className="max-h-[80vh] w-full rounded-lg"
            >
              <source src={mediaUrl} />
            </video>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Document / other file
  return (
    <div className="space-y-1">
      <a
        href={mediaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 rounded-md transition-colors min-w-[200px]",
          fromMe
            ? "bg-[#025144] hover:bg-[#026d5b]"
            : "bg-[#1a2930] hover:bg-[#223640]"
        )}
      >
        <FileText className="h-9 w-9 shrink-0 text-[#8696a0]" />
        <div className="flex-1 min-w-0">
          <span className="text-[13px] truncate block text-[#e9edef]">{body || "Documento"}</span>
          <span className="text-[11px] text-[#8696a0]">Arquivo</span>
        </div>
        <Download className="h-4 w-4 shrink-0 text-[#8696a0]" />
      </a>
    </div>
  );
};

export default MediaMessage;
