import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Plus, Trash2, Copy, MessageSquarePlus, Code, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

interface ChatWidget {
  id: string;
  name: string;
  greeting: string;
  color: string;
  team_id: string | null;
  collect_email: boolean;
  token: string;
  created_at: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "https://api.msxzap.pro";

export default function ChatWidgetConfig() {
  const queryClient = useQueryClient();

  const { data: widgets = [], isLoading } = useQuery<ChatWidget[]>({
    queryKey: ["chat-widgets"],
    queryFn: () => api.get<ChatWidget[]>("/chat-widget"),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formGreeting, setFormGreeting] = useState("Olá! Como posso ajudar?");
  const [formColor, setFormColor] = useState("#25D366");
  const [formCollectEmail, setFormCollectEmail] = useState(false);

  const [embedWidget, setEmbedWidget] = useState<ChatWidget | null>(null);
  const [copied, setCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: (body: object) => api.post<ChatWidget>("/chat-widget", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-widgets"] });
      toast.success("Widget criado com sucesso!");
      setModalOpen(false);
      resetForm();
    },
    onError: () => toast.error("Erro ao criar widget"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/chat-widget/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-widgets"] });
      toast.success("Widget excluído");
    },
    onError: () => toast.error("Erro ao excluir widget"),
  });

  function resetForm() {
    setFormName("");
    setFormGreeting("Olá! Como posso ajudar?");
    setFormColor("#25D366");
    setFormCollectEmail(false);
  }

  function handleCreate() {
    if (!formName.trim()) { toast.error("Nome é obrigatório"); return; }
    createMutation.mutate({
      name: formName.trim(),
      greeting: formGreeting,
      color: formColor,
      collect_email: formCollectEmail,
    });
  }

  function getEmbedCode(token: string) {
    return `<script src="${API_BASE}/widget.js" data-token="${token}"></script>`;
  }

  function copyEmbed(token: string) {
    navigator.clipboard.writeText(getEmbedCode(token));
    setCopied(true);
    toast.success("Código copiado!");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <MessageSquarePlus className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Widget de Chat</h1>
            <p className="text-sm text-muted-foreground">Adicione um chat ao seu site para receber mensagens</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setModalOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Widget
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Carregando widgets...</div>
      ) : widgets.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MessageSquarePlus className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Nenhum widget criado</p>
          <p className="text-sm mt-1">Clique em "Novo Widget" para criar seu primeiro widget de chat</p>
        </div>
      ) : (
        <div className="space-y-4">
          {widgets.map((w) => (
            <div key={w.id} className="border rounded-lg p-4 bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center text-white shadow"
                    style={{ backgroundColor: w.color }}
                  >
                    <MessageSquarePlus className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{w.name}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-xs">{w.greeting}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setEmbedWidget(w)}
                  >
                    <Code className="h-3.5 w-3.5" />
                    Ver código
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => copyEmbed(w.token)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar código
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(w.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 bg-muted/50 rounded px-3 py-2 text-xs font-mono break-all text-muted-foreground">
                {getEmbedCode(w.token)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Widget de Chat</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome do widget</Label>
              <Input
                placeholder="Ex: Suporte do Site"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Mensagem de saudação</Label>
              <Input
                placeholder="Olá! Como posso ajudar?"
                value={formGreeting}
                onChange={(e) => setFormGreeting(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cor do widget</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="h-10 w-14 rounded border cursor-pointer"
                />
                <span className="text-sm text-muted-foreground">{formColor}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="collect-email"
                checked={formCollectEmail}
                onCheckedChange={setFormCollectEmail}
              />
              <Label htmlFor="collect-email">Solicitar e-mail do visitante</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Criando..." : "Criar Widget"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Embed code modal */}
      <Dialog open={!!embedWidget} onOpenChange={(o) => { if (!o) setEmbedWidget(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Code className="h-5 w-5 text-primary" />
              Código de Incorporação — {embedWidget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Cole este código no HTML do seu site, antes do fechamento da tag <code className="bg-muted px-1 rounded">&lt;/body&gt;</code>:
            </p>
            <div className="bg-muted rounded-lg p-4">
              <code className="text-sm break-all text-foreground">
                {embedWidget ? getEmbedCode(embedWidget.token) : ""}
              </code>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => embedWidget && copyEmbed(embedWidget.token)}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copiado!" : "Copiar código"}
            </Button>
            <Button onClick={() => setEmbedWidget(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
