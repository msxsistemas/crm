import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { supabase } from "@/lib/db";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---- Types ----
type Priority = "low" | "normal" | "high" | "urgent";
type TimeUnit = "minutos" | "horas";

interface SLARule {
  id: string;
  name: string;
  description: string | null;
  priority: Priority;
  first_response_minutes: number;
  resolution_minutes: number;
  warning_threshold: number;
  applies_to_tags: string[];
  is_active: boolean;
  created_at: string;
}

interface RuleForm {
  name: string;
  description: string;
  priority: Priority;
  firstResponseValue: number;
  firstResponseUnit: TimeUnit;
  resolutionValue: number;
  resolutionUnit: TimeUnit;
  warningThreshold: number;
  appliesTo: string[];
}

// ---- Helpers ----
const PRIORITY_CONFIG: Record<Priority, { label: string; emoji: string; color: string }> = {
  urgent: { label: "Urgente", emoji: "🔴", color: "text-red-600" },
  high: { label: "Alto", emoji: "🟠", color: "text-orange-500" },
  normal: { label: "Normal", emoji: "🟡", color: "text-yellow-600" },
  low: { label: "Baixo", emoji: "🔵", color: "text-blue-500" },
};

const toMinutes = (value: number, unit: TimeUnit): number =>
  unit === "horas" ? value * 60 : value;

const fromMinutes = (minutes: number): { value: number; unit: TimeUnit } => {
  if (minutes % 60 === 0 && minutes >= 60) {
    return { value: minutes / 60, unit: "horas" };
  }
  return { value: minutes, unit: "minutos" };
};

const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
};

const defaultForm = (): RuleForm => ({
  name: "",
  description: "",
  priority: "normal",
  firstResponseValue: 60,
  firstResponseUnit: "minutos",
  resolutionValue: 8,
  resolutionUnit: "horas",
  warningThreshold: 80,
  appliesTo: [],
});

const ruleToForm = (rule: SLARule): RuleForm => {
  const fr = fromMinutes(rule.first_response_minutes);
  const res = fromMinutes(rule.resolution_minutes);
  return {
    name: rule.name,
    description: rule.description ?? "",
    priority: rule.priority,
    firstResponseValue: fr.value,
    firstResponseUnit: fr.unit,
    resolutionValue: res.value,
    resolutionUnit: res.unit,
    warningThreshold: rule.warning_threshold,
    appliesTo: rule.applies_to_tags ?? [],
  };
};

// ---- Tag chip input ----
interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
}

const TagInput = ({ tags, onChange }: TagInputProps) => {
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput("");
  };

  const removeTag = (tag: string) => onChange(tags.filter((t) => t !== tag));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Adicionar tag..."
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addTag();
            }
          }}
        />
        <Button type="button" size="sm" variant="outline" onClick={addTag} className="h-8 px-3">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 text-xs px-2.5 py-0.5"
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="hover:text-blue-900 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

// ---- Form Dialog ----
interface FormDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (form: RuleForm) => Promise<void>;
  initial?: RuleForm;
  title: string;
  saving: boolean;
}

const FormDialog = ({ open, onClose, onSave, initial, title, saving }: FormDialogProps) => {
  const [form, setForm] = useState<RuleForm>(initial ?? defaultForm());

  useEffect(() => {
    setForm(initial ?? defaultForm());
  }, [initial, open]);

  const update = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const firstResponseMinutes = toMinutes(form.firstResponseValue, form.firstResponseUnit);
  const resolutionMinutes = toMinutes(form.resolutionValue, form.resolutionUnit);
  const warningAtMinutes = Math.round((form.warningThreshold / 100) * firstResponseMinutes);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Ex: SLA Premium"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Descrição opcional..."
              rows={2}
              className="resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select
              value={form.priority}
              onValueChange={(v) => update("priority", v as Priority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(PRIORITY_CONFIG) as [Priority, typeof PRIORITY_CONFIG[Priority]][]).map(
                  ([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {cfg.emoji} {cfg.label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Tempo para 1ª Resposta</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={form.firstResponseValue}
                onChange={(e) => update("firstResponseValue", Math.max(1, Number(e.target.value)))}
                className="w-24"
              />
              <Select
                value={form.firstResponseUnit}
                onValueChange={(v) => update("firstResponseUnit", v as TimeUnit)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutos">Minutos</SelectItem>
                  <SelectItem value="horas">Horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tempo para Resolução</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                value={form.resolutionValue}
                onChange={(e) => update("resolutionValue", Math.max(1, Number(e.target.value)))}
                className="w-24"
              />
              <Select
                value={form.resolutionUnit}
                onValueChange={(v) => update("resolutionUnit", v as TimeUnit)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutos">Minutos</SelectItem>
                  <SelectItem value="horas">Horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Limite de Aviso</Label>
              <span className="text-sm font-semibold text-amber-600">{form.warningThreshold}%</span>
            </div>
            <Slider
              min={50}
              max={95}
              step={5}
              value={[form.warningThreshold]}
              onValueChange={([v]) => update("warningThreshold", v)}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>50%</span>
              <span>95%</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Aplica-se a Tags</Label>
            <TagInput tags={form.appliesTo} onChange={(tags) => update("appliesTo", tags)} />
          </div>

          <div className="rounded-lg bg-muted/60 border border-border p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">Prévia das regras:</p>
            <p className="text-muted-foreground">
              Aviso em{" "}
              <span className="font-medium text-amber-600">{formatDuration(warningAtMinutes)}</span>
              , crítico em{" "}
              <span className="font-medium text-red-600">{formatDuration(firstResponseMinutes)}</span>
            </p>
            <p className="text-muted-foreground">
              Resolução esperada em{" "}
              <span className="font-medium text-foreground">{formatDuration(resolutionMinutes)}</span>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={() => onSave(form)}
            disabled={saving || !form.name.trim()}
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ---- Main Component ----
const SLAConfig = () => {
  const [rules, setRules] = useState<SLARule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<SLARule | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("sla_rules" as never)
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      setRules((data as SLARule[]) ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar regras de SLA");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const handleSave = async (form: RuleForm) => {
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        first_response_minutes: toMinutes(form.firstResponseValue, form.firstResponseUnit),
        resolution_minutes: toMinutes(form.resolutionValue, form.resolutionUnit),
        warning_threshold: form.warningThreshold,
        applies_to_tags: form.appliesTo,
      };

      if (editingRule) {
        const { error } = await supabase
          .from("sla_rules" as never)
          .update(payload as never)
          .eq("id" as never, editingRule.id);
        if (error) throw error;
        toast.success("Regra atualizada com sucesso");
      } else {
        const { error } = await supabase
          .from("sla_rules" as never)
          .insert(payload as never);
        if (error) throw error;
        toast.success("Regra criada com sucesso");
      }

      setDialogOpen(false);
      setEditingRule(null);
      await loadRules();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar regra");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const { error } = await supabase
        .from("sla_rules" as never)
        .delete()
        .eq("id" as never, deleteId);
      if (error) throw error;
      toast.success("Regra excluída");
      setDeleteId(null);
      await loadRules();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir regra");
    }
  };

  const handleToggle = async (rule: SLARule) => {
    setToggling(rule.id);
    try {
      const { error } = await supabase
        .from("sla_rules" as never)
        .update({ is_active: !rule.is_active } as never)
        .eq("id" as never, rule.id);
      if (error) throw error;
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r))
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar status");
    } finally {
      setToggling(null);
    }
  };

  const openCreate = () => {
    setEditingRule(null);
    setDialogOpen(true);
  };

  const openEdit = (rule: SLARule) => {
    setEditingRule(rule);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mx-6 py-4 border-b border-border gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-blue-600">Configuração de SLA</h1>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Regra
          </Button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : rules.length === 0 ? (
            <Card className="p-12 text-center">
              <ShieldCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground text-sm mb-4">
                Nenhuma regra de SLA configurada ainda.
              </p>
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                Criar primeira regra
              </Button>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Nome</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Prioridade</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">1ª Resposta</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Resolução</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Aviso em</th>
                      <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rules.map((rule) => {
                      const cfg = PRIORITY_CONFIG[rule.priority];
                      const warningAt = Math.round(
                        (rule.warning_threshold / 100) * rule.first_response_minutes
                      );
                      return (
                        <tr key={rule.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-medium">{rule.name}</p>
                            {rule.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">
                                {rule.description}
                              </p>
                            )}
                            {rule.applies_to_tags && rule.applies_to_tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {rule.applies_to_tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-[10px] bg-blue-100 text-blue-700 rounded-full px-2 py-0"
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {rule.applies_to_tags.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    +{rule.applies_to_tags.length - 3}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("font-medium", cfg.color)}>
                              {cfg.emoji} {cfg.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDuration(rule.first_response_minutes)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDuration(rule.resolution_minutes)}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-amber-600 font-medium">
                              {formatDuration(warningAt)}
                            </span>
                            <span className="text-muted-foreground text-xs ml-1">
                              ({rule.warning_threshold}%)
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={rule.is_active}
                                disabled={toggling === rule.id}
                                onCheckedChange={() => handleToggle(rule)}
                              />
                              <span
                                className={cn(
                                  "text-xs font-medium",
                                  rule.is_active ? "text-green-600" : "text-muted-foreground"
                                )}
                              >
                                {rule.is_active ? "Ativa" : "Inativa"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => openEdit(rule)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                onClick={() => setDeleteId(rule.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>

      <FormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingRule(null);
        }}
        onSave={handleSave}
        initial={editingRule ? ruleToForm(editingRule) : undefined}
        title={editingRule ? "Editar Regra de SLA" : "Nova Regra de SLA"}
        saving={saving}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra de SLA</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta regra? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SLAConfig;
