import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, Pencil, Trash2, LayoutTemplate, ChevronUp, ChevronDown,
  MessageSquare, Tag, Clock, CheckCircle, User, FileText, Palette, RotateCw, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db } from "@/lib/db";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export interface FlowTemplateStep {
  id: string;
  type:
    | "send_message"
    | "add_tag"
    | "remove_tag"
    | "assign_agent"
    | "wait"
    | "close_conversation"
    | "send_note"
    | "add_label";
  config: {
    message?: string;
    tag?: string;
    agent_id?: string;
    wait_minutes?: number;
    note?: string;
    label_id?: string;
  };
  order: number;
}

export interface FlowTemplate {
  id: string;
  name: string;
  description: string | null;
  steps: FlowTemplateStep[];
  created_by: string | null;
  usage_count: number;
  created_at: string;
}

const STEP_TYPE_META: Record<
  FlowTemplateStep["type"],
  { label: string; icon: React.ReactNode; color: string }
> = {
  send_message:      { label: "Enviar mensagem",    icon: <MessageSquare className="h-4 w-4" />, color: "bg-blue-500/10 text-blue-600 border-blue-200" },
  add_tag:           { label: "Adicionar tag",       icon: <Tag className="h-4 w-4" />,           color: "bg-amber-500/10 text-amber-600 border-amber-200" },
  remove_tag:        { label: "Remover tag",         icon: <Tag className="h-4 w-4" />,           color: "bg-orange-500/10 text-orange-600 border-orange-200" },
  assign_agent:      { label: "Atribuir agente",     icon: <User className="h-4 w-4" />,          color: "bg-purple-500/10 text-purple-600 border-purple-200" },
  wait:              { label: "Aguardar",            icon: <Clock className="h-4 w-4" />,         color: "bg-yellow-500/10 text-yellow-600 border-yellow-200" },
  close_conversation:{ label: "Encerrar conversa",  icon: <CheckCircle className="h-4 w-4" />,   color: "bg-green-500/10 text-green-600 border-green-200" },
  send_note:         { label: "Enviar nota interna", icon: <FileText className="h-4 w-4" />,      color: "bg-indigo-500/10 text-indigo-600 border-indigo-200" },
  add_label:         { label: "Adicionar etiqueta",  icon: <Palette className="h-4 w-4" />,       color: "bg-pink-500/10 text-pink-600 border-pink-200" },
};

function newStep(type: FlowTemplateStep["type"], order: number): FlowTemplateStep {
  return { id: crypto.randomUUID(), type, config: {}, order };
}

interface StepEditorProps {
  step: FlowTemplateStep;
  index: number;
  total: number;
  agents: { id: string; full_name: string | null }[];
  labels: { id: string; name: string; color: string }[];
  onChange: (updated: FlowTemplateStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const StepEditor: React.FC<StepEditorProps> = ({
  step, index, total, agents, labels, onChange, onRemove, onMoveUp, onMoveDown,
}) => {
  const meta = STEP_TYPE_META[step.type];

  return (
    <div className={cn("border rounded-lg p-3 space-y-2", meta.color)}>
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center h-6 w-6 rounded-full bg-background/60 text-xs font-bold shrink-0">
          {index + 1}
        </span>
        <span className="flex items-center gap-1.5 text-sm font-medium flex-1">
          {meta.icon} {meta.label}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 rounded hover:bg-background/60 disabled:opacity-30 transition-colors"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="p-1 rounded hover:bg-background/60 disabled:opacity-30 transition-colors"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 rounded hover:bg-destructive/20 text-destructive transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Config inputs */}
      {step.type === "send_message" && (
        <Textarea
          className="bg-background/70 min-h-[70px] text-sm"
          placeholder="Texto da mensagem..."
          value={step.config.message || ""}
          onChange={(e) => onChange({ ...step, config: { ...step.config, message: e.target.value } })}
        />
      )}
      {step.type === "send_note" && (
        <Textarea
          className="bg-background/70 min-h-[70px] text-sm"
          placeholder="Conteúdo da nota interna..."
          value={step.config.note || ""}
          onChange={(e) => onChange({ ...step, config: { ...step.config, note: e.target.value } })}
        />
      )}
      {(step.type === "add_tag" || step.type === "remove_tag") && (
        <Input
          className="bg-background/70 h-8 text-sm"
          placeholder="Nome da tag..."
          value={step.config.tag || ""}
          onChange={(e) => onChange({ ...step, config: { ...step.config, tag: e.target.value } })}
        />
      )}
      {step.type === "wait" && (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            className="bg-background/70 h-8 text-sm w-24"
            placeholder="30"
            value={step.config.wait_minutes ?? ""}
            onChange={(e) =>
              onChange({ ...step, config: { ...step.config, wait_minutes: Number(e.target.value) } })
            }
          />
          <span className="text-sm text-muted-foreground">minutos</span>
        </div>
      )}
      {step.type === "assign_agent" && (
        <Select
          value={step.config.agent_id || ""}
          onValueChange={(v) => onChange({ ...step, config: { ...step.config, agent_id: v } })}
        >
          <SelectTrigger className="h-8 bg-background/70 text-sm">
            <SelectValue placeholder="Selecione um agente..." />
          </SelectTrigger>
          <SelectContent>
            {agents.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.full_name || "Sem nome"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {step.type === "add_label" && (
        <Select
          value={step.config.label_id || ""}
          onValueChange={(v) => onChange({ ...step, config: { ...step.config, label_id: v } })}
        >
          <SelectTrigger className="h-8 bg-background/70 text-sm">
            <SelectValue placeholder="Selecione uma etiqueta..." />
          </SelectTrigger>
          <SelectContent>
            {labels.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
};

const EMPTY_TEMPLATE: Omit<FlowTemplate, "id" | "created_at" | "created_by" | "usage_count"> = {
  name: "",
  description: null,
  steps: [],
};

const FlowTemplates: React.FC = () => {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<FlowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<FlowTemplate | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSteps, setFormSteps] = useState<FlowTemplateStep[]>([]);
  const [addingStepType, setAddingStepType] = useState<FlowTemplateStep["type"]>("send_message");
  const [saving, setSaving] = useState(false);

  // Meta state for step editors
  const [agents, setAgents] = useState<{ id: string; full_name: string | null }[]>([]);
  const [labels, setLabels] = useState<{ id: string; name: string; color: string }[]>([]);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    const { data } = await (db.from("attendance_flow_templates" as any) as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      setTemplates(
        (data as any[]).map((t) => ({
          ...t,
          steps: Array.isArray(t.steps) ? (t.steps as FlowTemplateStep[]) : [],
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  useEffect(() => {
    db.from("profiles").select("id, full_name").then(({ data }) => {
      if (data) setAgents(data);
    });
    (db.from("conversation_labels" as any) as any).select("*").order("name").then(({ data }: { data: any }) => {
      if (data) setLabels(data);
    });
  }, []);

  const openCreate = () => {
    setEditingTemplate(null);
    setFormName("");
    setFormDescription("");
    setFormSteps([]);
    setDialogOpen(true);
  };

  const openEdit = (tpl: FlowTemplate) => {
    setEditingTemplate(tpl);
    setFormName(tpl.name);
    setFormDescription(tpl.description || "");
    setFormSteps(tpl.steps.slice().sort((a, b) => a.order - b.order));
    setDialogOpen(true);
  };

  const handleAddStep = () => {
    const step = newStep(addingStepType, formSteps.length);
    setFormSteps((prev) => [...prev, step]);
  };

  const handleStepChange = (index: number, updated: FlowTemplateStep) => {
    setFormSteps((prev) => prev.map((s, i) => (i === index ? updated : s)));
  };

  const handleRemoveStep = (index: number) => {
    setFormSteps((prev) => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i })));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    setFormSteps((prev) => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr.map((s, i) => ({ ...s, order: i }));
    });
  };

  const handleMoveDown = (index: number) => {
    if (index === formSteps.length - 1) return;
    setFormSteps((prev) => {
      const arr = [...prev];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      return arr.map((s, i) => ({ ...s, order: i }));
    });
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error("Informe o nome do template"); return; }
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim() || null,
        steps: formSteps,
        created_by: user?.id,
      };

      if (editingTemplate) {
        await (db.from("attendance_flow_templates" as any) as any)
          .update(payload)
          .eq("id", editingTemplate.id);
        toast.success("Template atualizado!");
      } else {
        await (db.from("attendance_flow_templates" as any) as any).insert({ ...payload, usage_count: 0 });
        toast.success("Template criado!");
      }

      setDialogOpen(false);
      loadTemplates();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err?.message || "Tente novamente"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este template?")) return;
    await (db.from("attendance_flow_templates" as any) as any).delete().eq("id", id);
    toast.success("Template excluído!");
    loadTemplates();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <LayoutTemplate className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Templates de Atendimento</h1>
            <p className="text-xs text-muted-foreground">Sequências de ações reutilizáveis</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Template
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-3">
            <RotateCw className="h-5 w-5 animate-spin" />
            <span className="text-sm">Carregando...</span>
          </div>
        ) : templates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <LayoutTemplate className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-base font-medium mb-1">Nenhum template criado</p>
            <p className="text-sm mb-4">Crie seu primeiro template de atendimento</p>
            <Button onClick={openCreate} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" /> Criar template
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="border border-border rounded-xl p-4 bg-card hover:shadow-md transition-shadow flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{tpl.name}</h3>
                    {tpl.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tpl.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-xs gap-1">
                    <LayoutTemplate className="h-3 w-3" />
                    {tpl.steps.length} passo{tpl.steps.length !== 1 ? "s" : ""}
                  </Badge>
                  <Badge variant="outline" className="text-xs gap-1">
                    usado {tpl.usage_count}x
                  </Badge>
                </div>

                {/* Steps preview */}
                {tpl.steps.length > 0 && (
                  <div className="space-y-1">
                    {tpl.steps.slice(0, 4).map((step, i) => {
                      const meta = STEP_TYPE_META[step.type];
                      return (
                        <div key={step.id} className={cn("flex items-center gap-1.5 text-xs px-2 py-1 rounded border", meta.color)}>
                          {meta.icon}
                          <span className="truncate">{meta.label}{step.config.message ? `: "${step.config.message.slice(0, 30)}${step.config.message.length > 30 ? "..." : ""}"` : ""}</span>
                        </div>
                      );
                    })}
                    {tpl.steps.length > 4 && (
                      <p className="text-xs text-muted-foreground pl-2">+{tpl.steps.length - 4} mais...</p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 gap-1.5 text-xs h-8"
                    onClick={() => openEdit(tpl)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1 gap-1.5 text-xs h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(tpl.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Builder Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-primary" />
              {editingTemplate ? "Editar Template" : "Novo Template"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Ex: Boas-vindas + Follow-up"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                placeholder="Descreva o que este template faz..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>

            {/* Steps list */}
            <div className="space-y-2">
              <Label>Passos ({formSteps.length})</Label>
              {formSteps.length === 0 && (
                <p className="text-sm text-muted-foreground py-3 text-center border border-dashed border-border rounded-lg">
                  Nenhum passo adicionado. Adicione abaixo.
                </p>
              )}
              {formSteps.map((step, i) => (
                <StepEditor
                  key={step.id}
                  step={step}
                  index={i}
                  total={formSteps.length}
                  agents={agents}
                  labels={labels}
                  onChange={(updated) => handleStepChange(i, updated)}
                  onRemove={() => handleRemoveStep(i)}
                  onMoveUp={() => handleMoveUp(i)}
                  onMoveDown={() => handleMoveDown(i)}
                />
              ))}
            </div>

            {/* Add step row */}
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Select
                value={addingStepType}
                onValueChange={(v) => setAddingStepType(v as FlowTemplateStep["type"])}
              >
                <SelectTrigger className="flex-1 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(STEP_TYPE_META) as FlowTemplateStep["type"][]).map((type) => (
                    <SelectItem key={type} value={type}>
                      <span className="flex items-center gap-2">
                        {STEP_TYPE_META[type].icon}
                        {STEP_TYPE_META[type].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={handleAddStep}>
                <Plus className="h-4 w-4" />
                Adicionar passo
              </Button>
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <RotateCw className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Salvando..." : "Salvar template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FlowTemplates;
