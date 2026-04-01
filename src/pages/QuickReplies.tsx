import { useState, useRef, useEffect } from "react";
import { Zap, Search, Pencil, Trash2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatingInput, FloatingTextarea, FloatingSelectWrapper } from "@/components/ui/floating-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface QuickReply {
  id: string;
  shortcut: string;
  message: string;
  is_global: boolean;
  attachment_name?: string | null;
  attachment_url?: string | null;
}

const VARIABLES = [
  { label: "Primeiro Nome", value: "{{primeiro_nome}}" },
  { label: "Nome", value: "{{nome}}" },
  { label: "Saudação", value: "{{saudacao}}" },
  { label: "Protocolo", value: "{{protocolo}}" },
  { label: "Protocolo Aleatório", value: "{{protocolo_aleatorio}}" },
  { label: "Data", value: "{{data}}" },
  { label: "Hora", value: "{{hora}}" },
  { label: "Nº do Cliente / Ticket", value: "{{numero_cliente}}" },
  { label: "Setor", value: "{{setor}}" },
  { label: "Conexão", value: "{{conexao}}" },
];

const QuickReplies = () => {
  const { user } = useAuth();
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [shortcut, setShortcut] = useState("");
  const [message, setMessage] = useState("");
  const [globalScope, setGlobalScope] = useState("personal");
  const [attachmentName, setAttachmentName] = useState("");
  const [errors, setErrors] = useState<{ shortcut?: boolean; message?: boolean }>({});

  const fetchReplies = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("quick_replies")
      .select("*")
      .order("created_at", { ascending: true });
    if (!error && data) {
      setReplies(data.map(r => ({
        id: r.id,
        shortcut: r.shortcut,
        message: r.message,
        is_global: r.is_global,
        attachment_name: r.attachment_name,
        attachment_url: r.attachment_url,
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReplies();
  }, [user]);

  const resetForm = () => {
    setShortcut("");
    setMessage("");
    setGlobalScope("personal");
    setEditingReply(null);
    setAttachmentName("");
    setErrors({});
  };

  const openAdd = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (reply: QuickReply) => {
    setEditingReply(reply);
    setShortcut(reply.shortcut);
    setMessage(reply.message);
    setGlobalScope(reply.is_global ? "global" : "personal");
    setAttachmentName(reply.attachment_name || "");
    setErrors({});
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const newErrors: { shortcut?: boolean; message?: boolean } = {};
    if (!shortcut.trim()) newErrors.shortcut = true;
    if (!message.trim()) newErrors.message = true;
    if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
    if (!user) return;

    if (editingReply) {
      const { error } = await supabase
        .from("quick_replies")
        .update({
          shortcut: shortcut.trim(),
          message: message.trim(),
          is_global: globalScope === "global",
          attachment_name: attachmentName || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingReply.id);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Resposta rápida atualizada!");
    } else {
      const { error } = await supabase
        .from("quick_replies")
        .insert({
          user_id: user.id,
          shortcut: shortcut.trim(),
          message: message.trim(),
          is_global: globalScope === "global",
          attachment_name: attachmentName || null,
        });
      if (error) { toast.error("Erro ao criar"); return; }
      toast.success("Resposta rápida criada!");
    }
    setDialogOpen(false);
    resetForm();
    fetchReplies();
    window.dispatchEvent(new Event("quick_replies_updated"));
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("quick_replies").delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Resposta rápida removida!");
    setDeleteId(null);
    fetchReplies();
    window.dispatchEvent(new Event("quick_replies_updated"));
  };

  const insertVariable = (variableValue: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newMessage = message.substring(0, start) + variableValue + message.substring(end);
      setMessage(newMessage);
      setTimeout(() => {
        textarea.focus();
        const newPos = start + variableValue.length;
        textarea.setSelectionRange(newPos, newPos);
      }, 0);
    } else {
      setMessage((prev) => prev + variableValue);
    }
    setErrors((p) => ({ ...p, message: false }));
  };

  const handleAttachClick = () => { fileInputRef.current?.click(); };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachmentName(file.name);
      toast.success(`Arquivo "${file.name}" anexado`);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const filtered = replies.filter(
    (r) =>
      r.shortcut.toLowerCase().includes(search.toLowerCase()) ||
      r.message.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-2xl font-bold text-primary">Respostas Rápidas</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Procurar" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 w-56" />
          </div>
          <Button onClick={openAdd} className="bg-primary hover:bg-primary/90 uppercase font-semibold text-xs">Adicionar</Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Carregando...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Zap className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-semibold">Nenhuma resposta rápida cadastrada</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((reply) => (
              <div key={reply.id} className="flex items-center gap-4 p-4 bg-card rounded-lg border border-border hover:shadow-sm transition-shadow">
                <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <Zap className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">/{reply.shortcut}</p>
                  <p className="text-sm text-muted-foreground truncate">{reply.message}</p>
                </div>
                {reply.attachment_name && (
                  <Badge variant="outline" className="gap-1 text-xs shrink-0">
                    <Paperclip className="h-3 w-3" />
                    {reply.attachment_name}
                  </Badge>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(reply)}>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteId(reply.id)}>
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" />

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setDialogOpen(false); resetForm(); } }}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 [&>button.absolute]:hidden overflow-hidden">
          <DialogHeader className="bg-blue-600 text-white p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <DialogTitle className="text-white text-lg">
                  {editingReply ? "Editar" : "Adicionar"}
                </DialogTitle>
                <p className="text-xs text-white/80">
                  {editingReply ? "Modifique a resposta rápida existente" : "Crie uma nova resposta rápida para agilizar o atendimento"}
                </p>
              </div>
              <button onClick={() => { setDialogOpen(false); resetForm(); }} className="p-1 rounded hover:bg-white/20 transition-colors shrink-0">
                <X className="h-5 w-5 text-white" />
              </button>
            </div>
          </DialogHeader>

          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            <div>
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-4">
                <Zap className="h-3.5 w-3.5" /> INFORMAÇÕES BÁSICAS
              </p>
              <div className="space-y-4">
                <div>
                  <FloatingInput label="Atalho" value={shortcut} onChange={(e) => { setShortcut(e.target.value); setErrors((p) => ({ ...p, shortcut: false })); }} className={errors.shortcut ? "border-destructive" : ""} />
                  <p className={`text-xs mt-1 ${errors.shortcut ? "text-destructive" : "text-muted-foreground"}`}>
                    {errors.shortcut ? "Obrigatório" : "Atalho para usar a resposta rápida (ex: /ola)"}
                  </p>
                </div>
                <div>
                  <FloatingTextarea ref={textareaRef} label="Mensagem" value={message} onChange={(e) => { setMessage(e.target.value); setErrors((p) => ({ ...p, message: false })); }} className={`min-h-[120px] ${errors.message ? "border-destructive" : ""}`} />
                  <p className={`text-xs mt-1 ${errors.message ? "text-destructive" : "text-muted-foreground"}`}>
                    {errors.message ? "Obrigatório" : "Mensagem que será enviada"}
                  </p>
                </div>
                <fieldset className="border border-border rounded-md p-3">
                  <legend className="text-xs text-muted-foreground px-1">Variáveis disponíveis</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIABLES.map((v) => (
                      <Badge key={v.label} variant="default" className="cursor-pointer bg-primary hover:bg-primary/80 text-primary-foreground text-xs" onClick={() => insertVariable(v.value)}>
                        {v.label}
                      </Badge>
                    ))}
                  </div>
                </fieldset>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-4">CONFIGURAÇÕES AVANÇADAS</p>
              <FloatingSelectWrapper label="Global" hasValue={true}>
                <Select value={globalScope} onValueChange={setGlobalScope}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Ativo (Global)</SelectItem>
                    <SelectItem value="personal">Inativo (Pessoal)</SelectItem>
                  </SelectContent>
                </Select>
              </FloatingSelectWrapper>
            </div>

            {attachmentName && (
              <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                <Paperclip className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-foreground truncate flex-1">{attachmentName}</span>
                <button onClick={() => setAttachmentName("")} className="p-0.5 rounded hover:bg-background transition-colors shrink-0">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleAttachClick}>
                <Paperclip className="h-4 w-4" /> Anexar
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }} className="uppercase font-semibold text-xs text-primary border-primary hover:bg-primary/5">Cancelar</Button>
              <Button onClick={handleSave} className="bg-primary hover:bg-primary/90 uppercase font-semibold text-xs">Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="p-0 gap-0 [&>button.absolute]:hidden overflow-hidden">
          <AlertDialogHeader className="bg-blue-600 text-white p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <AlertDialogTitle className="text-white">Excluir</AlertDialogTitle>
                <AlertDialogDescription className="text-white/80 text-xs">
                  Tem certeza que deseja excluir esta resposta rápida?
                </AlertDialogDescription>
              </div>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter className="p-4">
            <AlertDialogCancel className="uppercase font-semibold text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90 uppercase font-semibold text-xs">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QuickReplies;
