import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Upload, File, Image, Video, FileText, Folder,
  Copy, Download, Trash2, Search, RefreshCw, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type FileType = "all" | "images" | "videos" | "documents" | "others";

interface StorageFile {
  name: string;
  id: string | null;
  updated_at: string | null;
  created_at: string | null;
  last_accessed_at: string | null;
  metadata: {
    size?: number;
    mimetype?: string;
    [key: string]: unknown;
  } | null;
  path: string;
  publicUrl: string;
}

const BUCKET = "file-manager";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMime(file: StorageFile): string {
  return file.metadata?.mimetype ?? "";
}

function getFileCategory(mime: string): FileType {
  if (mime.startsWith("image/")) return "images";
  if (mime.startsWith("video/")) return "videos";
  if (
    mime.startsWith("application/pdf") ||
    mime.startsWith("application/msword") ||
    mime.startsWith("application/vnd") ||
    mime.startsWith("text/")
  ) return "documents";
  return "others";
}

function FileIcon({ mime, className }: { mime: string; className?: string }) {
  if (mime.startsWith("image/")) return <Image className={className ?? "w-8 h-8 text-blue-400"} />;
  if (mime.startsWith("video/")) return <Video className={className ?? "w-8 h-8 text-purple-400"} />;
  if (
    mime.startsWith("application/pdf") ||
    mime.startsWith("application/msword") ||
    mime.startsWith("application/vnd") ||
    mime.startsWith("text/")
  ) return <FileText className={className ?? "w-8 h-8 text-orange-400"} />;
  return <File className={className ?? "w-8 h-8 text-gray-400"} />;
}

const FileManager = () => {
  const { user } = useAuth();
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [filterType, setFilterType] = useState<FileType>("all");
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<StorageFile | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await db.storage
        .from(BUCKET)
        .list(user.id + "/", {
          limit: 200,
          offset: 0,
          sortBy: { column: "created_at", order: "desc" },
        });
      if (error) throw error;

      const mapped: StorageFile[] = (data ?? [])
        .filter((f) => f.name !== ".emptyFolderPlaceholder")
        .map((f) => {
          const path = `${user.id}/${f.name}`;
          const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path);
          return {
            ...f,
            path,
            publicUrl: urlData.publicUrl,
          };
        });

      setFiles(mapped);
    } catch {
      toast.error("Erro ao carregar arquivos");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || !user) return;
    setUploading(true);

    const filesArray = Array.from(fileList);
    let successCount = 0;

    for (const file of filesArray) {
      const path = `${user.id}/${Date.now()}_${file.name}`;
      const { error } = await db.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true });
      if (error) {
        toast.error(`Erro ao enviar ${file.name}`);
      } else {
        successCount++;
      }
    }

    if (successCount > 0) {
      toast.success(
        successCount === 1
          ? "Arquivo enviado com sucesso!"
          : `${successCount} arquivos enviados com sucesso!`
      );
      await loadFiles();
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const { error } = await db.storage.from(BUCKET).remove([deleteConfirm.path]);
      if (error) throw error;
      toast.success("Arquivo excluído");
      setDeleteConfirm(null);
      await loadFiles();
    } catch {
      toast.error("Erro ao excluir arquivo");
    } finally {
      setDeleting(false);
    }
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url)
      .then(() => toast.success("URL copiada!"))
      .catch(() => toast.error("Erro ao copiar URL"));
  };

  // Stats
  const stats = useMemo(() => {
    const total = files.length;
    const images = files.filter((f) => getFileCategory(getMime(f)) === "images").length;
    const videos = files.filter((f) => getFileCategory(getMime(f)) === "videos").length;
    const documents = files.filter((f) => getFileCategory(getMime(f)) === "documents").length;
    const others = files.filter((f) => getFileCategory(getMime(f)) === "others").length;
    return { total, images, videos, documents, others };
  }, [files]);

  const filteredFiles = useMemo(() => {
    let result = files;
    if (filterType !== "all") {
      result = result.filter((f) => getFileCategory(getMime(f)) === filterType);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    }
    return result;
  }, [files, filterType, search]);

  const filterLabels: { key: FileType; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "images", label: "Imagens" },
    { key: "videos", label: "Vídeos" },
    { key: "documents", label: "Documentos" },
    { key: "others", label: "Outros" },
  ];

  const statCards = [
    { label: "Total de arquivos", value: stats.total, icon: <Folder className="w-5 h-5 text-blue-500" /> },
    { label: "Imagens", value: stats.images, icon: <Image className="w-5 h-5 text-green-500" /> },
    { label: "Vídeos", value: stats.videos, icon: <Video className="w-5 h-5 text-purple-500" /> },
    { label: "Documentos", value: stats.documents, icon: <FileText className="w-5 h-5 text-orange-500" /> },
    { label: "Outros", value: stats.others, icon: <File className="w-5 h-5 text-gray-500" /> },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-blue-600">Gerenciador de Arquivos</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadFiles} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            {uploading ? "Enviando..." : "Upload"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {statCards.map((card) => (
          <div key={card.label} className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">{card.icon}<span className="text-xs text-gray-500">{card.label}</span></div>
            <div className="text-2xl font-bold text-gray-800">{card.value}</div>
          </div>
        ))}
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            className="pl-9"
            placeholder="Buscar arquivos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {filterLabels.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterType(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterType === key
                  ? "bg-blue-600 text-white"
                  : "bg-white border text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* File Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Carregando...
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Folder className="w-12 h-12 mb-3 text-gray-300" />
          <p className="text-base font-medium">Nenhum arquivo encontrado</p>
          <p className="text-sm mt-1">Clique em "Upload" para enviar seus primeiros arquivos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredFiles.map((file) => {
            const mime = getMime(file);
            const isImage = mime.startsWith("image/");
            const size = file.metadata?.size ?? 0;
            const date = file.created_at
              ? format(new Date(file.created_at), "dd/MM/yyyy", { locale: ptBR })
              : "—";

            return (
              <div
                key={file.path}
                className="bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow"
              >
                {/* Thumbnail / Icon */}
                <div className="h-36 bg-gray-50 flex items-center justify-center overflow-hidden">
                  {isImage ? (
                    <img
                      src={file.publicUrl}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <FileIcon mime={mime} className="w-12 h-12" />
                  )}
                </div>

                {/* Info */}
                <div className="p-3 flex-1 flex flex-col gap-1">
                  <p className="text-sm font-medium text-gray-800 truncate" title={file.name}>
                    {file.name}
                  </p>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{formatBytes(size)}</span>
                    <span>{date}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 px-3 pb-3">
                  <button
                    title="Copiar URL"
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs text-gray-500 hover:bg-gray-100 transition-colors"
                    onClick={() => handleCopy(file.publicUrl)}
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copiar
                  </button>
                  <a
                    href={file.publicUrl}
                    download={file.name}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Download"
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar
                  </a>
                  <button
                    title="Excluir"
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 transition-colors"
                    onClick={() => setDeleteConfirm(file)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm p-0 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-800">Excluir arquivo</h2>
            <button
              className="text-gray-400 hover:text-gray-600"
              onClick={() => setDeleteConfirm(null)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-gray-600">
              Tem certeza que deseja excluir{" "}
              <span className="font-semibold text-gray-800">{deleteConfirm?.name}</span>?
              Esta ação não pode ser desfeita.
            </p>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Excluir
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FileManager;
