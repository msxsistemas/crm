import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Eye, Power, PowerOff, Repeat2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Campaign {
  id: string;
  name: string;
  type: "birthday" | "followup" | "date_field";
  message: string;
  connection_name: string;
  active: boolean;
  delay_days: number;
  custom_field_key: string | null;
  created_at: string;
  total_sent: number;
}

interface CampaignLog {
  id: string;
  contact_name: string | null;
  contact_phone: string | null;
  sent_at: string;
  status: string;
}

const TYPE_LABELS: Record<string, string> = {
  birthday: "Aniversário",
  followup: "Follow-up pós-fechamento",
  date_field: "Campo de data personalizado",
};

const EMPTY_FORM = {
  name: "",
  type: "birthday" as Campaign["type"],
  message: "",
  connection_name: "",
  active: true,
  delay_days: 1,
  custom_field_key: "",
};

export default function RecurringCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [connections, setConnections] = useState<{ instance_name: string; name: string }[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  const [showLogs, setShowLogs] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [logs, setLogs] = useState<CampaignLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      const data = await api.get<Campaign[]>("/recurring-campaigns");
      setCampaigns(data);
    } catch {
      toast.error("Erro ao carregar campanhas");
    } finally {
      setLoading(false);
    }
  };

  const loadConnections = async () => {
    try {
      const data = await api.get<{ instance_name: string; name: string }[]>("/evolution-connections");
      setConnections(data);
    } catch {}
  };

  useEffect(() => {
    loadCampaigns();
    loadConnections();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowForm(true);
  };

  const openEdit = (c: Campaign) => {
    setEditing(c);
    setForm({
      name: c.name,
      type: c.type,
      message: c.message,
      connection_name: c.connection_name,
      active: c.active,
      delay_days: c.delay_days,
      custom_field_key: c.custom_field_key || "",
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.message.trim() || !form.connection_name) {
      toast.error("Preencha nome, mensagem e conexão");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        custom_field_key: form.custom_field_key || null,
      };
      if (editing) {
        await api.put(`/recurring-campaigns/${editing.id}`, payload);
        toast.success("Campanha atualizada");
      } else {
        await api.post("/recurring-campaigns", payload);
        toast.success("Campanha criada");
      }
      setShowForm(false);
      loadCampaigns();
    } catch {
      toast.error("Erro ao salvar campanha");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta campanha?")) return;
    try {
      await api.delete(`/recurring-campaigns/${id}`);
      toast.success("Campanha removida");
      loadCampaigns();
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const handleToggle = async (c: Campaign) => {
    try {
      await api.put(`/recurring-campaigns/${c.id}`, { active: !c.active });
      toast.success(c.active ? "Campanha pausada" : "Campanha ativada");
      loadCampaigns();
    } catch {
      toast.error("Erro ao alterar status");
    }
  };

  const openLogs = async (c: Campaign) => {
    setSelectedCampaign(c);
    setShowLogs(true);
    setLoadingLogs(true);
    try {
      const data = await api.get<CampaignLog[]>(`/recurring-campaigns/${c.id}/logs`);
      setLogs(data);
    } catch {
      toast.error("Erro ao carregar logs");
    } finally {
      setLoadingLogs(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Repeat2 className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Campanhas Recorrentes</h1>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Nenhuma campanha recorrente criada ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-base">{c.name}</span>
                    <Badge variant={c.active ? "default" : "secondary"}>
                      {c.active ? "Ativa" : "Pausada"}
                    </Badge>
                    <Badge variant="outline">{TYPE_LABELS[c.type] || c.type}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{c.message}</p>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span>Conexão: <strong>{c.connection_name}</strong></span>
                    {c.type === "followup" && (
                      <span>Delay: <strong>{c.delay_days} dia(s)</strong></span>
                    )}
                    {c.type === "date_field" && c.custom_field_key && (
                      <span>Campo: <strong>{c.custom_field_key}</strong></span>
                    )}
                    <span>Total enviados: <strong>{c.total_sent}</strong></span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => openLogs(c)} title="Ver logs">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleToggle(c)} title={c.active ? "Pausar" : "Ativar"}>
                    {c.active ? <PowerOff className="h-4 w-4 text-yellow-500" /> : <Power className="h-4 w-4 text-green-500" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(c)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} title="Excluir">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Campanha" : "Nova Campanha Recorrente"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Nome da campanha</label>
              <Input
                placeholder="Ex: Feliz Aniversário"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Tipo</label>
              <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v as Campaign["type"] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="birthday">Aniversário do contato</SelectItem>
                  <SelectItem value="followup">Follow-up pós-fechamento</SelectItem>
                  <SelectItem value="date_field">Campo de data personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.type === "followup" && (
              <div>
                <label className="text-sm font-medium mb-1 block">Dias após fechamento</label>
                <Input
                  type="number"
                  min={1}
                  value={form.delay_days}
                  onChange={(e) => setForm(f => ({ ...f, delay_days: parseInt(e.target.value) || 1 }))}
                />
              </div>
            )}
            {form.type === "date_field" && (
              <div>
                <label className="text-sm font-medium mb-1 block">Chave do campo personalizado</label>
                <Input
                  placeholder="Ex: data_renovacao"
                  value={form.custom_field_key}
                  onChange={(e) => setForm(f => ({ ...f, custom_field_key: e.target.value }))}
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Conexão WhatsApp</label>
              <Select value={form.connection_name} onValueChange={(v) => setForm(f => ({ ...f, connection_name: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conexão" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map(cn => (
                    <SelectItem key={cn.instance_name} value={cn.instance_name}>
                      {cn.name || cn.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">
                Mensagem <span className="text-muted-foreground text-xs">(use {"{{"+"nome}}"} e {"{{"+"empresa}}"})</span>
              </label>
              <Textarea
                placeholder="Olá {{nome}}, parabéns pelo seu aniversário!"
                rows={4}
                value={form.message}
                onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Logs Modal */}
      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Histórico de Envios — {selectedCampaign?.name}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {loadingLogs ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum envio registrado.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4">Contato</th>
                    <th className="py-2 pr-4">Telefone</th>
                    <th className="py-2 pr-4">Enviado em</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b hover:bg-muted/30">
                      <td className="py-2 pr-4">{log.contact_name || "—"}</td>
                      <td className="py-2 pr-4">{log.contact_phone || "—"}</td>
                      <td className="py-2 pr-4">
                        {format(new Date(log.sent_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </td>
                      <td className="py-2">
                        <Badge variant={log.status === "sent" ? "default" : "destructive"}>
                          {log.status === "sent" ? "Enviado" : "Erro"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogs(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
