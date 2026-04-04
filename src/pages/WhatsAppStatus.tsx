import { useState, useEffect, useRef, useCallback } from "react";
import {
  Radio, Plus, Image, Video, Type, Clock, CheckCircle,
  RefreshCw, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/db";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ─────────────────────────────────────────────────────────────────────

type StatusType = "text" | "image" | "video";

interface WhatsAppStatus {
  id: string;
  instance_name: string;
  type: StatusType;
  content: string | null;
  caption: string | null;
  background_color: string | null;
  published_at: string;
  expires_at: string | null;
  created_at: string;
}

interface Connection {
  instance_name: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const BG_COLORS = [
  { label: "Preto", value: "#111827" },
  { label: "Verde (WhatsApp)", value: "#075e54" },
  { label: "Roxo", value: "#7c3aed" },
  { label: "Vermelho", value: "#dc2626" },
  { label: "Azul", value: "#2563eb" },
  { label: "Verde Claro", value: "#16a34a" },
  { label: "Rosa", value: "#db2777" },
  { label: "Laranja", value: "#ea580c" },
];

const FONTS = [
  { label: "Sem serifa", value: "sans-serif" },
  { label: "Com serifa", value: "serif" },
];

const DURATION_OPTIONS = [
  { label: "6 horas", value: 6 },
  { label: "12 horas", value: 12 },
  { label: "24 horas", value: 24 },
];

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix, only keep the base64 portion
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatRelative(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "agora há pouco";
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `há ${days}d`;
}

// ─── Component ─────────────────────────────────────────────────────────────────

const WhatsAppStatusPage = () => {
  const { user } = useAuth();

  // Connections
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>("");

  // Statuses
  const [statuses, setStatuses] = useState<WhatsAppStatus[]>([]);
  const [loadingStatuses, setLoadingStatuses] = useState(false);

  // Publish dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<StatusType>("text");
  const [publishing, setPublishing] = useState(false);

  // Text form
  const [textContent, setTextContent] = useState("");
  const [bgColor, setBgColor] = useState(BG_COLORS[0].value);
  const [fontFamily, setFontFamily] = useState(FONTS[0].value);
  const [duration, setDuration] = useState(24);

  // Image form
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageCaption, setImageCaption] = useState("");

  // Video form
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoCaption, setVideoCaption] = useState("");

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // ── Load connections ────────────────────────────────────────────────────────

  useEffect(() => {
    supabase
      .from("evolution_connections" as never)
      .select("instance_name")
      .then(({ data }) => {
        const list = (data || []) as Connection[];
        setConnections(list);
        if (list.length > 0 && !selectedInstance) {
          setSelectedInstance(list[0].instance_name);
        }
      });
  }, []);

  // ── Load statuses ───────────────────────────────────────────────────────────

  const fetchStatuses = useCallback(async () => {
    if (!selectedInstance) return;
    setLoadingStatuses(true);
    try {
      const { data, error } = await supabase
        .from("whatsapp_statuses" as never)
        .select("*")
        .eq("instance_name", selectedInstance)
        .order("published_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setStatuses((data || []) as WhatsAppStatus[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar status";
      toast.error(msg);
    } finally {
      setLoadingStatuses(false);
    }
  }, [selectedInstance]);

  useEffect(() => {
    fetchStatuses();
  }, [fetchStatuses]);

  // ── Image file handler ──────────────────────────────────────────────────────

  const handleImageFile = (file: File) => {
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  };

  // ── Publish ─────────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!selectedInstance) {
      toast.error("Selecione uma instância");
      return;
    }

    setPublishing(true);
    try {
      const expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString();

      if (activeTab === "text") {
        if (!textContent.trim()) { toast.error("Digite o texto do status"); return; }

        await supabase.functions.invoke("evolution-api", {
          body: {
            action: "send_status",
            instanceName: selectedInstance,
            data: {
              type: "text",
              content: textContent,
              backgroundColor: bgColor,
            },
          },
        });

        await supabase.from("whatsapp_statuses" as never).insert({
          instance_name: selectedInstance,
          type: "text",
          content: textContent,
          background_color: bgColor,
          published_at: new Date().toISOString(),
          expires_at: expiresAt,
          created_by: user?.id,
        });

      } else if (activeTab === "image") {
        if (!imageFile) { toast.error("Selecione uma imagem"); return; }
        const base64 = await toBase64(imageFile);

        await supabase.functions.invoke("evolution-api", {
          body: {
            action: "send_status",
            instanceName: selectedInstance,
            data: {
              type: "image",
              content: base64,
              caption: imageCaption || undefined,
            },
          },
        });

        await supabase.from("whatsapp_statuses" as never).insert({
          instance_name: selectedInstance,
          type: "image",
          content: imageFile.name,
          caption: imageCaption || null,
          published_at: new Date().toISOString(),
          expires_at: expiresAt,
          created_by: user?.id,
        });

      } else if (activeTab === "video") {
        if (!videoFile) { toast.error("Selecione um vídeo"); return; }
        const base64 = await toBase64(videoFile);

        await supabase.functions.invoke("evolution-api", {
          body: {
            action: "send_status",
            instanceName: selectedInstance,
            data: {
              type: "video",
              content: base64,
              caption: videoCaption || undefined,
            },
          },
        });

        await supabase.from("whatsapp_statuses" as never).insert({
          instance_name: selectedInstance,
          type: "video",
          content: videoFile.name,
          caption: videoCaption || null,
          published_at: new Date().toISOString(),
          expires_at: expiresAt,
          created_by: user?.id,
        });
      }

      toast.success("Status publicado com sucesso!");
      setDialogOpen(false);
      resetForm();
      fetchStatuses();

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao publicar status";
      toast.error(msg);
    } finally {
      setPublishing(false);
    }
  };

  const resetForm = () => {
    setTextContent("");
    setBgColor(BG_COLORS[0].value);
    setFontFamily(FONTS[0].value);
    setDuration(24);
    setImageFile(null);
    setImagePreviewUrl(null);
    setImageCaption("");
    setVideoFile(null);
    setVideoCaption("");
    setActiveTab("text");
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const getTypeBadge = (type: StatusType) => {
    switch (type) {
      case "text": return { label: "Texto", icon: <Type className="w-3 h-3" /> };
      case "image": return { label: "Imagem", icon: <Image className="w-3 h-3" /> };
      case "video": return { label: "Vídeo", icon: <Video className="w-3 h-3" /> };
    }
  };

  const isExpired = (status: WhatsAppStatus) => {
    if (!status.expires_at) return false;
    return new Date(status.expires_at) < new Date();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Radio className="w-5 h-5 text-green-600" />
          <h1 className="text-xl font-bold text-foreground">Status do WhatsApp</h1>
        </div>
        <div className="flex items-center gap-3">
          {/* Instance selector */}
          {connections.length > 0 && (
            <Select value={selectedInstance} onValueChange={setSelectedInstance}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Selecionar instância" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((c) => (
                  <SelectItem key={c.instance_name} value={c.instance_name}>
                    {c.instance_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
            onClick={() => setDialogOpen(true)}
            disabled={!selectedInstance}
          >
            <Plus className="w-4 h-4" />
            Publicar Status
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left – Status list */}
        <div className="w-1/3 border-r border-border flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-foreground">Meus Status</span>
            <Button variant="ghost" size="icon" onClick={fetchStatuses} className="h-8 w-8">
              {loadingStatuses
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <RefreshCw className="w-4 h-4" />}
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {statuses.length === 0 && !loadingStatuses ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-6">
                <Radio className="w-10 h-10 opacity-20" />
                <p className="text-sm text-center">Nenhum status publicado ainda</p>
                <p className="text-xs text-center opacity-70">Clique em "Publicar Status" para começar</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {statuses.map((status) => {
                  const badge = getTypeBadge(status.type);
                  const expired = isExpired(status);
                  return (
                    <div key={status.id} className="flex items-start gap-3 p-4 hover:bg-muted/50 transition-colors">
                      {/* Color preview / type icon */}
                      <div
                        className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center text-white text-xs font-bold overflow-hidden"
                        style={{
                          backgroundColor: status.background_color || (
                            status.type === "image" ? "#e5e7eb" : status.type === "video" ? "#1f2937" : "#075e54"
                          ),
                        }}
                      >
                        {status.type === "text"
                          ? (status.content?.slice(0, 2) || "📝")
                          : status.type === "image"
                            ? <Image className="w-5 h-5 text-gray-500" />
                            : <Video className="w-5 h-5 text-white" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="secondary" className="text-[10px] gap-1 py-0 px-1.5 h-4">
                            {badge.icon}
                            {badge.label}
                          </Badge>
                          {expired ? (
                            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 text-muted-foreground">
                              Expirado
                            </Badge>
                          ) : (
                            <Badge className="text-[10px] py-0 px-1.5 h-4 bg-green-100 text-green-700 hover:bg-green-100">
                              <CheckCircle className="w-2.5 h-2.5 mr-0.5" />
                              Publicado
                            </Badge>
                          )}
                        </div>

                        {status.type === "text" && status.content && (
                          <p className="text-xs text-foreground mt-1 line-clamp-2">{status.content}</p>
                        )}
                        {status.caption && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">{status.caption}</p>
                        )}
                        {status.content && status.type !== "text" && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{status.content}</p>
                        )}

                        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {formatRelative(status.published_at)}
                          {status.expires_at && (
                            <span className="opacity-60">
                              · expira {formatRelative(status.expires_at).replace("há ", "em ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right – Info / placeholder */}
        <div className="flex-1 flex items-center justify-center text-muted-foreground bg-muted/20">
          <div className="text-center space-y-3">
            <Radio className="w-16 h-16 mx-auto opacity-10" />
            <p className="text-base font-medium opacity-40">Status do WhatsApp</p>
            <p className="text-sm opacity-30 max-w-xs">
              Publique atualizações de status que desaparecem automaticamente após o prazo configurado.
            </p>
          </div>
        </div>
      </div>

      {/* ── Publish Dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-green-600" />
              Publicar Status
            </DialogTitle>
          </DialogHeader>

          {/* Tab selector */}
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            {(["text", "image", "video"] as StatusType[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors",
                  activeTab === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "text" && <><Type className="w-4 h-4" /> Texto</>}
                {tab === "image" && <><Image className="w-4 h-4" /> Imagem</>}
                {tab === "video" && <><Video className="w-4 h-4" /> Vídeo</>}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {/* ── TEXT TAB ── */}
            {activeTab === "text" && (
              <div className="flex gap-4">
                {/* Left: form */}
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">
                      Texto do status <span className="text-xs opacity-60">(máx. 700 caracteres)</span>
                    </label>
                    <Textarea
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value.slice(0, 700))}
                      placeholder="O que está acontecendo?"
                      rows={5}
                      className="resize-none"
                    />
                    <p className="text-[11px] text-muted-foreground text-right mt-1">{textContent.length}/700</p>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">Cor de fundo</label>
                    <div className="flex gap-2 flex-wrap">
                      {BG_COLORS.map((color) => (
                        <button
                          key={color.value}
                          title={color.label}
                          onClick={() => setBgColor(color.value)}
                          className={cn(
                            "w-8 h-8 rounded-full border-2 transition-all",
                            bgColor === color.value ? "border-foreground scale-110" : "border-transparent"
                          )}
                          style={{ backgroundColor: color.value }}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Fonte</label>
                    <Select value={fontFamily} onValueChange={setFontFamily}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONTS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Right: preview */}
                <div className="w-40 shrink-0">
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Preview</label>
                  <div
                    className="w-full aspect-[9/16] rounded-xl flex items-center justify-center p-3 text-center overflow-hidden shadow-md"
                    style={{ backgroundColor: bgColor, fontFamily }}
                  >
                    <p
                      className="text-white text-xs font-medium leading-tight break-words"
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                    >
                      {textContent || "Seu texto aqui..."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── IMAGE TAB ── */}
            {activeTab === "image" && (
              <div className="space-y-3">
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageFile(file);
                  }}
                />
                <div
                  className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-green-500 transition-colors"
                  onClick={() => imageInputRef.current?.click()}
                >
                  {imagePreviewUrl ? (
                    <img
                      src={imagePreviewUrl}
                      alt="preview"
                      className="mx-auto max-h-48 object-contain rounded-lg"
                    />
                  ) : (
                    <>
                      <Image className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
                      <p className="text-sm text-muted-foreground">Clique para selecionar uma imagem</p>
                    </>
                  )}
                </div>
                {imageFile && (
                  <p className="text-xs text-muted-foreground">{imageFile.name}</p>
                )}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Legenda (opcional)</label>
                  <Input
                    value={imageCaption}
                    onChange={(e) => setImageCaption(e.target.value)}
                    placeholder="Adicione uma legenda..."
                  />
                </div>
              </div>
            )}

            {/* ── VIDEO TAB ── */}
            {activeTab === "video" && (
              <div className="space-y-3">
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setVideoFile(file);
                  }}
                />
                <div
                  className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-green-500 transition-colors"
                  onClick={() => videoInputRef.current?.click()}
                >
                  {videoFile ? (
                    <div className="space-y-2">
                      <Video className="w-10 h-10 mx-auto text-green-600" />
                      <p className="text-sm text-foreground font-medium">{videoFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(videoFile.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                  ) : (
                    <>
                      <Video className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-40" />
                      <p className="text-sm text-muted-foreground">Clique para selecionar um vídeo</p>
                    </>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Legenda (opcional)</label>
                  <Input
                    value={videoCaption}
                    onChange={(e) => setVideoCaption(e.target.value)}
                    placeholder="Adicione uma legenda..."
                  />
                </div>
              </div>
            )}

            {/* Duration */}
            <div className="flex items-center gap-3">
              <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Duração do status:</label>
              <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATION_OPTIONS.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>
                Cancelar
              </Button>
              <Button
                onClick={handlePublish}
                disabled={publishing || !selectedInstance}
                className="bg-green-600 hover:bg-green-700 text-white gap-2"
              >
                {publishing && <Loader2 className="w-4 h-4 animate-spin" />}
                {publishing ? "Publicando..." : "Publicar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WhatsAppStatusPage;
