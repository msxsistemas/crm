import { useState, useEffect, useCallback } from "react";
import { FileText, Download, Image, Film, Music, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";

interface MediaFile {
  id: string;
  media_url: string;
  media_type: string;
  body: string;
  created_at: string;
  from_me: boolean;
}

interface ConversationFilesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  contactName?: string;
}

const ITEMS_PER_PAGE = 8;

const ConversationFilesDialog = ({ open, onOpenChange, conversationId, contactName }: ConversationFilesDialogProps) => {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !conversationId) return;
    setLoading(true);
    setPage(1);
    db
      .from("messages")
      .select("id, media_url, media_type, body, created_at, from_me")
      .eq("conversation_id", conversationId)
      .not("media_url", "is", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setFiles((data as MediaFile[]) || []);
        setLoading(false);
      });
  }, [open, conversationId]);

  const totalPages = Math.max(1, Math.ceil(files.length / ITEMS_PER_PAGE));
  const pagedFiles = files.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const getTypeBadge = (type: string) => {
    if (type === "image") return { icon: Image, label: "Imagem", color: "bg-blue-600" };
    if (type === "video") return { icon: Film, label: "Vídeo", color: "bg-purple-600" };
    if (type === "audio") return { icon: Music, label: "Áudio", color: "bg-orange-600" };
    return { icon: FileText, label: "Documento", color: "bg-muted" };
  };

  const getFileName = (f: MediaFile) => {
    if (f.media_url) {
      try {
        const url = new URL(f.media_url);
        const segments = url.pathname.split("/");
        const name = segments[segments.length - 1];
        if (name && name.length > 0) return decodeURIComponent(name);
      } catch {}
    }
    return f.body || f.media_type || "Arquivo";
  };

  const handleDownload = async (url: string, fileName: string, mediaType: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();

      if (mediaType === "image") {
        // Convert to PNG
        const img = document.createElement("img");
        img.crossOrigin = "anonymous";
        const imgLoaded = new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
        });
        img.src = URL.createObjectURL(blob);
        await imgLoaded;

        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(img.src);

        canvas.toBlob((pngBlob) => {
          if (!pngBlob) return;
          const blobUrl = URL.createObjectURL(pngBlob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = fileName.replace(/\.\w+$/, "") + ".png";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        }, "image/png");
      } else {
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Arquivos da Conversa</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Carregando...</p>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mb-3 opacity-40" />
            <p className="font-medium text-foreground">Nenhum arquivo encontrado</p>
            <p className="text-sm">Esta conversa não possui arquivos de mídia.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-sm text-muted-foreground">Total de arquivos: {files.length}</span>
              <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-1">
                {pagedFiles.map((f) => {
                  const badge = getTypeBadge(f.media_type);
                  const BadgeIcon = badge.icon;
                  const fileName = getFileName(f);
                  const senderName = f.from_me ? "Você" : (contactName || "Contato");

                  return (
                    <div
                      key={f.id}
                      className="rounded-lg border border-border bg-card overflow-hidden flex flex-col group"
                    >
                      {/* Thumbnail */}
                      <div className="relative aspect-square bg-muted flex items-center justify-center overflow-hidden">
                        {f.media_type === "image" ? (
                          <img
                            src={f.media_url}
                            alt={fileName}
                            className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => setPreviewUrl(f.media_url)}
                          />
                        ) : f.media_type === "video" ? (
                          <video
                            src={f.media_url}
                            className="w-full h-full object-cover"
                            muted
                          />
                        ) : (
                          <BadgeIcon className="h-10 w-10 text-muted-foreground/50" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="p-2 flex flex-col gap-1 flex-1">
                        <p className="text-xs font-medium text-foreground truncate" title={fileName}>
                          {fileName}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(f.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{senderName}</p>
                      </div>

                      {/* Footer */}
                      <div className="flex items-center justify-between px-2 pb-2">
                        <Badge variant="default" className={`${badge.color} text-white text-[10px] gap-1 px-1.5 py-0.5`}>
                          <BadgeIcon className="h-3 w-3" />
                          {badge.label}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => window.open(f.media_url, "_blank")}
                            className="p-1 rounded hover:bg-muted transition-colors"
                            title="Abrir"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => handleDownload(f.media_url, fileName, f.media_type)}
                            className="p-1 rounded hover:bg-muted transition-colors"
                            title="Baixar"
                          >
                            <Download className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 text-sm rounded border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  Anterior
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1 text-sm rounded border border-border hover:bg-muted disabled:opacity-40 transition-colors"
                >
                  Próxima
                </button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>

    <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
      <DialogContent className="max-w-4xl border-border bg-background p-2 sm:p-4">
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Imagem ampliada"
            className="max-h-[80vh] w-full rounded-lg object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  </>
  );
};

export default ConversationFilesDialog;
