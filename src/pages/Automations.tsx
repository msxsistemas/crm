import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Condition {
  field: string;
  operator: string;
  value: string;
}

interface Action {
  type: string;
  team_id?: string;
  label?: string;
  message?: string;
}

interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  conditions: Condition[];
  actions: Action[];
  is_active: boolean;
  created_at: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  conversation_created: "Nova conversa",
  message_received: "Mensagem recebida",
  conversation_closed: "Conversa fechada",
  contact_created: "Novo contato",
};

const ACTION_TYPE_LABELS: Record<string, string> = {
  assign_team: "Atribuir equipe",
  assign_agent: "Atribuir agente",
  add_label: "Adicionar label",
  send_message: "Enviar mensagem",
  add_tag: "Adicionar tag",
};

const emptyRule = (): Omit<AutomationRule, "id" | "created_at"> => ({
  name: "",
  trigger: "message_received",
  conditions: [],
  actions: [],
  is_active: true,
});

export default function Automations() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AutomationRule | null>(null);
  const [form, setForm] = useState(emptyRule());

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<AutomationRule[]>("/automations");
      setRules(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Erro ao carregar automações");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyRule());
    setModalOpen(true);
  };

  const openEdit = (rule: AutomationRule) => {
    setEditing(rule);
    setForm({
      name: rule.name,
      trigger: rule.trigger,
      conditions: rule.conditions || [],
      actions: rule.actions || [],
      is_active: rule.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    try {
      if (editing) {
        await api.patch(`/automations/${editing.id}`, form);
        toast.success("Automação atualizada");
      } else {
        await api.post("/automations", form);
        toast.success("Automação criada");
      }
      setModalOpen(false);
      fetchRules();
    } catch {
      toast.error("Erro ao salvar automação");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover esta automação?")) return;
    try {
      await api.delete(`/automations/${id}`);
      toast.success("Automação removida");
      fetchRules();
    } catch {
      toast.error("Erro ao remover");
    }
  };

  const handleToggle = async (rule: AutomationRule) => {
    try {
      await api.patch(`/automations/${rule.id}`, { is_active: !rule.is_active });
      fetchRules();
    } catch {
      toast.error("Erro ao atualizar status");
    }
  };

  // Condition helpers
  const addCondition = () => {
    setForm(f => ({ ...f, conditions: [...f.conditions, { field: "content", operator: "contains", value: "" }] }));
  };
  const updateCondition = (idx: number, key: keyof Condition, value: string) => {
    setForm(f => {
      const conds = [...f.conditions];
      conds[idx] = { ...conds[idx], [key]: value };
      return { ...f, conditions: conds };
    });
  };
  const removeCondition = (idx: number) => {
    setForm(f => ({ ...f, conditions: f.conditions.filter((_, i) => i !== idx) }));
  };

  // Action helpers
  const addAction = () => {
    setForm(f => ({ ...f, actions: [...f.actions, { type: "send_message", message: "" }] }));
  };
  const updateAction = (idx: number, key: keyof Action, value: string) => {
    setForm(f => {
      const acts = [...f.actions];
      acts[idx] = { ...acts[idx], [key]: value };
      return { ...f, actions: acts };
    });
  };
  const removeAction = (idx: number) => {
    setForm(f => ({ ...f, actions: f.actions.filter((_, i) => i !== idx) }));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-yellow-500" />
          <h1 className="text-2xl font-bold">Automações</h1>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Nova Automação
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Zap className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma automação criada ainda.</p>
          <p className="text-sm mt-1">Clique em "Nova Automação" para começar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <div
              key={rule.id}
              className="border rounded-lg p-4 flex items-center justify-between bg-card shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Switch
                  checked={rule.is_active}
                  onCheckedChange={() => handleToggle(rule)}
                />
                <div className="min-w-0">
                  <p className="font-medium truncate">{rule.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {TRIGGER_LABELS[rule.trigger] || rule.trigger}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {rule.conditions?.length || 0} condição(ões) · {rule.actions?.length || 0} ação(ões)
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Button size="sm" variant="ghost" onClick={() => openEdit(rule)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(rule.id)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Automação" : "Nova Automação"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Name */}
            <div className="space-y-1">
              <Label>Nome da automação</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Boas-vindas automático"
              />
            </div>

            {/* Trigger */}
            <div className="space-y-1">
              <Label>Gatilho</Label>
              <Select value={form.trigger} onValueChange={v => setForm(f => ({ ...f, trigger: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Conditions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Condições (todas devem ser verdadeiras)</Label>
                <Button size="sm" variant="outline" onClick={addCondition}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>
              {form.conditions.length === 0 && (
                <p className="text-xs text-muted-foreground">Sem condições — aplica a todos os eventos.</p>
              )}
              {form.conditions.map((cond, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select value={cond.field} onValueChange={v => updateCondition(idx, "field", v)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="content">Conteúdo</SelectItem>
                      <SelectItem value="channel">Canal</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={cond.operator} onValueChange={v => updateCondition(idx, "operator", v)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">contém</SelectItem>
                      <SelectItem value="equals">é igual a</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="flex-1"
                    value={cond.value}
                    onChange={e => updateCondition(idx, "value", e.target.value)}
                    placeholder="Valor"
                  />
                  <Button size="sm" variant="ghost" onClick={() => removeCondition(idx)}>
                    <X className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Ações</Label>
                <Button size="sm" variant="outline" onClick={addAction}>
                  <Plus className="h-3 w-3 mr-1" /> Adicionar
                </Button>
              </div>
              {form.actions.length === 0 && (
                <p className="text-xs text-muted-foreground">Adicione ao menos uma ação.</p>
              )}
              {form.actions.map((act, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select
                    value={act.type}
                    onValueChange={v => updateAction(idx, "type", v)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(ACTION_TYPE_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {act.type === "assign_team" && (
                    <Input
                      className="flex-1"
                      value={act.team_id || ""}
                      onChange={e => updateAction(idx, "team_id", e.target.value)}
                      placeholder="ID da equipe"
                    />
                  )}
                  {act.type === "add_label" && (
                    <Input
                      className="flex-1"
                      value={act.label || ""}
                      onChange={e => updateAction(idx, "label", e.target.value)}
                      placeholder="Nome da label"
                    />
                  )}
                  {act.type === "send_message" && (
                    <Input
                      className="flex-1"
                      value={act.message || ""}
                      onChange={e => updateAction(idx, "message", e.target.value)}
                      placeholder="Texto da mensagem"
                    />
                  )}
                  {(act.type === "assign_agent" || act.type === "add_tag") && (
                    <Input
                      className="flex-1"
                      value={(act as any).value || ""}
                      onChange={e => updateAction(idx, "value" as any, e.target.value)}
                      placeholder="Valor"
                    />
                  )}
                  <Button size="sm" variant="ghost" onClick={() => removeAction(idx)}>
                    <X className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_active}
                onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))}
              />
              <Label>Ativa</Label>
            </div>

            {/* Save button */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave}>Salvar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
