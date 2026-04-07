import { useState, useEffect, useCallback } from "react";
import { Globe, Plus, Info, RefreshCw, Play, Pencil, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import api from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const WEBHOOK_EVENTS = [
  { value: "conversation.created", label: "Nova conversa iniciada" },
  { value: "conversation.closed", label: "Conversa encerrada" },
  { value: "message.received", label: "Mensagem recebida do cliente" },
  { value: "message.sent", label: "Mensagem enviada pelo atendente" },
  { value: "contact.created", label: "Novo contato criado" },
  { value: "task.created", label: "Nova tarefa criada" },
  { value: "campaign.sent", label: "Campanha enviada" },
];

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secret: string | null;
  last_triggered_at: string | null;
  failure_count: number;
}

const WebhooksTab = () => {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [formActive, setFormActive] = useState(true);

  const fetchWebhooks = useCallback(async () => {
    try {
      const data = await api.get<Webhook[]>('/webhooks');
      setWebhooks(data || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  const openCreate = () => {
    setEditingWebhook(null);
    setFormName(""); setFormUrl(""); setFormSecret(""); setFormEvents([]); setFormActive(true);
    setDialogOpen(true);
  };

  const openEdit = (wh: Webhook) => {
    setEditingWebhook(wh);
    setFormName(wh.name); setFormUrl(wh.url); setFormSecret(wh.secret || ""); setFormEvents(wh.events); setFormActive(wh.active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formUrl.trim()) { toast.error("Preencha nome e URL"); return; }
    if (!formUrl.startsWith("https://")) { toast.error("A URL deve começar com https://"); return; }
    if (formEvents.length === 0) { toast.error("Selecione pelo menos um evento"); return; }
    setSaving(true);
    const payload = {
      name: formName.trim(),
      url: formUrl.trim(),
      events: formEvents,
      active: formActive,
      secret: formSecret.trim() || null,
    };
    try {
      if (editingWebhook) {
        await api.patch(`/webhooks/${editingWebhook.id}`, payload);
        toast.success("Webhook atualizado!");
      } else {
        await api.post('/webhooks', payload);
        toast.success("Webhook criado!");
      }
      setDialogOpen(false);
      fetchWebhooks();
    } catch { toast.error(editingWebhook ? "Erro ao atualizar webhook" : "Erro ao criar webhook"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/webhooks/${id}`);
      toast.success("Webhook excluído!");
      fetchWebhooks();
    } catch { toast.error("Erro ao excluir webhook"); }
  };

  const handleToggleActive = async (wh: Webhook) => {
    try {
      await api.patch(`/webhooks/${wh.id}`, { active: !wh.active });
      setWebhooks(prev => prev.map(w => w.id === wh.id ? { ...w, active: !w.active } : w));
    } catch { toast.error("Erro ao atualizar"); }
  };

  const handleTest = async (wh: Webhook) => {
    setTestingId(wh.id);
    const testPayload = { event: "test", timestamp: new Date().toISOString(), data: { message: "Teste do CRM MSX" } };
    try {
      const res = await fetch(wh.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
      });
      if (res.ok) {
        toast.success(`Teste enviado com sucesso! Status: ${res.status}`);
      } else {
        toast.error(`Erro no teste: HTTP ${res.status}`);
      }
    } catch (err: any) {
      toast.error(`Falha ao enviar teste: ${err.message || "Erro de rede"}`);
    }
    setTestingId(null);
  };

  const toggleEvent = (event: string) => {
    setFormEvents(prev => prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Webhooks</h3>
            <p className="text-sm text-muted-foreground">{webhooks.length} webhook(s) configurado(s)</p>
          </div>
        </div>
        <Button variant="action" className="gap-2 px-5" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo Webhook
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-lg bg-primary/10 border border-primary/20 p-4">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Webhooks enviam notificações automáticas para URLs externas quando eventos ocorrem no CRM. Útil para integrar com n8n, Zapier ou sistemas próprios.
        </p>
      </div>

      <Card className="p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Globe className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-foreground">Nenhum webhook configurado</p>
            <p className="text-sm text-muted-foreground">Crie webhooks para integrar o CRM com sistemas externos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map(wh => (
              <div key={wh.id} className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/20">
                <div className={cn("mt-1 h-2.5 w-2.5 rounded-full shrink-0", wh.active ? "bg-green-500" : "bg-muted-foreground/40")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-foreground text-sm">{wh.name}</p>
                    {wh.failure_count > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        {wh.failure_count} falha(s)
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{wh.url}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {wh.events.map(ev => (
                      <Badge key={ev} variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">{ev}</Badge>
                    ))}
                  </div>
                  {wh.last_triggered_at && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Último disparo: {new Date(wh.last_triggered_at).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch checked={wh.active} onCheckedChange={() => handleToggleActive(wh)} />
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => handleTest(wh)}
                    disabled={testingId === wh.id}
                    title="Testar webhook"
                  >
                    {testingId === wh.id
                      ? <RefreshCw className="h-4 w-4 animate-spin" />
                      : <Play className="h-4 w-4 text-green-500" />
                    }
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(wh)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(wh.id)} title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingWebhook ? "Editar Webhook" : "Novo Webhook"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nome *</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Notificação n8n" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">URL *</label>
              <Input
                type="url"
                value={formUrl}
                onChange={e => setFormUrl(e.target.value)}
                placeholder="https://seu-sistema.com/webhook"
              />
              {formUrl && !formUrl.startsWith("https://") && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> A URL deve começar com https://
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Segredo (opcional)</label>
              <Input
                value={formSecret}
                onChange={e => setFormSecret(e.target.value)}
                placeholder="Para verificação HMAC de assinatura"
              />
              <p className="text-xs text-muted-foreground mt-1">Usado para validar a autenticidade do webhook</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Eventos *</label>
              <div className="grid grid-cols-1 gap-2">
                {WEBHOOK_EVENTS.map(ev => (
                  <label key={ev.value} className="flex items-center gap-2.5 cursor-pointer group">
                    <Checkbox
                      checked={formEvents.includes(ev.value)}
                      onCheckedChange={() => toggleEvent(ev.value)}
                    />
                    <div>
                      <span className="text-sm font-mono text-foreground">{ev.value}</span>
                      <span className="text-xs text-muted-foreground ml-2">— {ev.label}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-foreground">Ativo</p>
                <p className="text-xs text-muted-foreground">Webhook receberá eventos imediatamente</p>
              </div>
              <Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editingWebhook ? "Atualizar" : "Criar Webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WebhooksTab;
