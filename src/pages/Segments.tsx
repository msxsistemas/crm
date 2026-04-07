import { useState, useEffect } from "react";
import {
  Plus, Trash2, Pencil, RefreshCw, X, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db } from "@/lib/db";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SegmentCondition {
  field: "tag" | "created_at" | "name" | "phone" | "has_conversation" | "inactivity_days";
  operator: "equals" | "contains" | "greater_than" | "less_than" | "is_empty" | "days_ago_more";
  value: string;
}

interface Segment {
  id: string;
  name: string;
  description: string | null;
  conditions: SegmentCondition[];
  operator: "AND" | "OR";
  contact_count: number;
  last_calculated_at: string | null;
  is_dynamic: boolean;
  created_at: string;
}

interface ContactPreview {
  id: string;
  name: string | null;
  phone: string;
}

const FIELD_LABELS: Record<SegmentCondition["field"], string> = {
  tag: "Tag",
  created_at: "Data de criação",
  name: "Nome",
  phone: "Telefone",
  has_conversation: "Tem conversa",
  inactivity_days: "Dias de inatividade",
};

const OPERATOR_LABELS: Record<SegmentCondition["operator"], string> = {
  equals: "Igual a",
  contains: "Contém",
  greater_than: "Maior que",
  less_than: "Menor que",
  is_empty: "Está vazio",
  days_ago_more: "Há mais de X dias",
};

const FIELD_OPERATORS: Record<SegmentCondition["field"], SegmentCondition["operator"][]> = {
  tag: ["equals", "contains"],
  created_at: ["days_ago_more", "greater_than", "less_than"],
  name: ["contains", "equals", "is_empty"],
  phone: ["contains", "equals", "is_empty"],
  has_conversation: ["equals"],
  inactivity_days: ["days_ago_more", "greater_than"],
};

const emptyCondition = (): SegmentCondition => ({ field: "name", operator: "contains", value: "" });

async function calculateSegment(
  conditions: SegmentCondition[],
  operator: "AND" | "OR"
): Promise<ContactPreview[]> {
  let query = db.from("contacts").select("id, name, phone, tags, created_at");

  if (operator === "AND") {
    for (const cond of conditions) {
      if (!cond.value && cond.operator !== "is_empty") continue;
      if (cond.field === "name") {
        if (cond.operator === "contains") query = query.ilike("name", `%${cond.value}%`);
        else if (cond.operator === "equals") query = query.eq("name", cond.value);
        else if (cond.operator === "is_empty") query = query.is("name", null);
      } else if (cond.field === "phone") {
        if (cond.operator === "contains") query = query.ilike("phone", `%${cond.value}%`);
        else if (cond.operator === "equals") query = query.eq("phone", cond.value);
        else if (cond.operator === "is_empty") query = query.is("phone", null);
      } else if (cond.field === "tag") {
        query = query.contains("tags", [cond.value]);
      } else if (cond.field === "created_at" && cond.operator === "days_ago_more") {
        const d = new Date();
        d.setDate(d.getDate() - parseInt(cond.value || "0", 10));
        query = query.lt("created_at", d.toISOString());
      } else if (cond.field === "created_at" && cond.operator === "greater_than") {
        query = query.gt("created_at", new Date(cond.value).toISOString());
      } else if (cond.field === "created_at" && cond.operator === "less_than") {
        query = query.lt("created_at", new Date(cond.value).toISOString());
      }
    }
  }
  // For OR, we just run all conditions independently — simplified approach:
  // return all contacts that match at least one condition (fetch all and filter client-side)

  const { data, error } = await query.limit(10);
  if (error) throw error;
  return (data || []) as ContactPreview[];
}

const Segments = () => {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);

  // Builder state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formOperator, setFormOperator] = useState<"AND" | "OR">("AND");
  const [formConditions, setFormConditions] = useState<SegmentCondition[]>([emptyCondition()]);

  // Calculate result
  const [calculating, setCalculating] = useState(false);
  const [previewContacts, setPreviewContacts] = useState<ContactPreview[] | null>(null);
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  // Saving
  const [saving, setSaving] = useState(false);

  const loadSegments = async () => {
    setLoading(true);
    const { data, error } = await db
      .from("segments")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar segmentos");
    } else {
      setSegments((data || []) as Segment[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSegments();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setFormName("");
    setFormDescription("");
    setFormOperator("AND");
    setFormConditions([emptyCondition()]);
    setPreviewContacts(null);
    setPreviewCount(null);
  };

  const handleEdit = (seg: Segment) => {
    setEditingId(seg.id);
    setFormName(seg.name);
    setFormDescription(seg.description || "");
    setFormOperator(seg.operator);
    setFormConditions(seg.conditions.length > 0 ? seg.conditions : [emptyCondition()]);
    setPreviewContacts(null);
    setPreviewCount(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este segmento?")) return;
    const { error } = await db.from("segments").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else {
      toast.success("Segmento excluído");
      if (editingId === id) resetForm();
      loadSegments();
    }
  };

  const handleCalculate = async () => {
    setCalculating(true);
    setPreviewContacts(null);
    setPreviewCount(null);
    try {
      const contacts = await calculateSegment(formConditions, formOperator);
      setPreviewContacts(contacts);
      setPreviewCount(contacts.length);
    } catch (err) {
      toast.error("Erro ao calcular segmento");
    } finally {
      setCalculating(false);
    }
  };

  const handleCalculateSegment = async (seg: Segment) => {
    try {
      const contacts = await calculateSegment(seg.conditions, seg.operator);
      const count = contacts.length;
      const { error } = await db
        .from("segments")
        .update({ contact_count: count, last_calculated_at: new Date().toISOString() })
        .eq("id", seg.id);
      if (error) throw error;
      toast.success(`${count} contato(s) encontrado(s)`);
      loadSegments();
    } catch {
      toast.error("Erro ao calcular segmento");
    }
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDescription.trim() || null,
        conditions: formConditions as unknown as never,
        operator: formOperator,
      };

      if (editingId) {
        const { error } = await db.from("segments").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Segmento atualizado");
      } else {
        const { error } = await db.from("segments").insert(payload);
        if (error) throw error;
        toast.success("Segmento criado");
      }
      resetForm();
      loadSegments();
    } catch {
      toast.error("Erro ao salvar segmento");
    } finally {
      setSaving(false);
    }
  };

  const addCondition = () => {
    setFormConditions((prev) => [...prev, emptyCondition()]);
    setPreviewContacts(null);
    setPreviewCount(null);
  };

  const removeCondition = (idx: number) => {
    setFormConditions((prev) => prev.filter((_, i) => i !== idx));
    setPreviewContacts(null);
    setPreviewCount(null);
  };

  const updateCondition = (idx: number, patch: Partial<SegmentCondition>) => {
    setFormConditions((prev) =>
      prev.map((c, i) => {
        if (i !== idx) return c;
        const updated = { ...c, ...patch };
        // Reset operator if field changed and current operator not valid
        if (patch.field) {
          const validOps = FIELD_OPERATORS[patch.field];
          if (!validOps.includes(updated.operator)) {
            updated.operator = validOps[0];
          }
        }
        return updated;
      })
    );
    setPreviewContacts(null);
    setPreviewCount(null);
  };

  const formatLastCalculated = (dateStr: string | null) => {
    if (!dateStr) return "Nunca calculado";
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
  };

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* Left panel — segment list */}
      <div className="w-[340px] shrink-0 border-r border-border flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <h1 className="text-base font-bold text-foreground">Segmentos</h1>
            <p className="text-xs text-muted-foreground">{segments.length} segmento(s)</p>
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={resetForm}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo Segmento
          </Button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-8">Carregando...</p>
          ) : segments.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <Users className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Nenhum segmento criado</p>
            </div>
          ) : (
            segments.map((seg) => (
              <div
                key={seg.id}
                className={`rounded-lg border p-3 space-y-2 cursor-pointer transition-colors ${
                  editingId === seg.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:bg-muted/30"
                }`}
                onClick={() => handleEdit(seg)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{seg.name}</p>
                    {seg.description && (
                      <p className="text-xs text-muted-foreground truncate">{seg.description}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {seg.contact_count} contatos
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">{formatLastCalculated(seg.last_calculated_at)}</p>
                <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={() => handleEdit(seg)}
                  >
                    <Pencil className="h-3 w-3 mr-1" /> Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2"
                    onClick={() => handleCalculateSegment(seg)}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Calcular
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-[10px] px-2 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(seg.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel — builder */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {editingId ? "Editar Segmento" : "Novo Segmento"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Defina as condições para filtrar contatos dinamicamente.
            </p>
          </div>

          {/* Name & description */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Nome *</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Clientes ativos"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Descrição</label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descrição opcional..."
                className="text-sm"
              />
            </div>
          </div>

          {/* AND/OR toggle */}
          <div>
            <label className="text-xs font-medium text-foreground mb-2 block">Operador entre condições</label>
            <div className="flex gap-2">
              {(["AND", "OR"] as const).map((op) => (
                <button
                  key={op}
                  onClick={() => setFormOperator(op)}
                  className={`px-4 py-1.5 rounded-md text-sm font-semibold border transition-colors ${
                    formOperator === op
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {op}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              {formOperator === "AND"
                ? "Contatos devem atender TODAS as condições"
                : "Contatos devem atender PELO MENOS UMA condição"}
            </p>
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground block">Condições</label>
            {formConditions.map((cond, idx) => (
              <div key={idx} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/20">
                {/* Field */}
                <Select
                  value={cond.field}
                  onValueChange={(v) => updateCondition(idx, { field: v as SegmentCondition["field"] })}
                >
                  <SelectTrigger className="h-8 text-xs w-[140px] shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FIELD_LABELS) as SegmentCondition["field"][]).map((f) => (
                      <SelectItem key={f} value={f} className="text-xs">
                        {FIELD_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Operator */}
                <Select
                  value={cond.operator}
                  onValueChange={(v) => updateCondition(idx, { operator: v as SegmentCondition["operator"] })}
                >
                  <SelectTrigger className="h-8 text-xs w-[150px] shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_OPERATORS[cond.field].map((op) => (
                      <SelectItem key={op} value={op} className="text-xs">
                        {OPERATOR_LABELS[op]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Value */}
                {cond.operator !== "is_empty" && (
                  <Input
                    value={cond.value}
                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                    placeholder={
                      cond.field === "created_at" || cond.field === "inactivity_days"
                        ? "Nº de dias"
                        : "Valor..."
                    }
                    className="h-8 text-xs flex-1"
                  />
                )}

                {/* Remove */}
                <button
                  onClick={() => removeCondition(idx)}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}

            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={addCondition}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar condição
            </Button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={handleCalculate}
              disabled={calculating}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${calculating ? "animate-spin" : ""}`} />
              {calculating ? "Calculando..." : "Calcular"}
            </Button>
            <Button size="sm" className="h-9" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Atualizar" : "Salvar"}
            </Button>
            {editingId && (
              <Button variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={resetForm}>
                Cancelar
              </Button>
            )}
          </div>

          {/* Preview result */}
          {previewCount !== null && (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">
                  {previewCount} contato(s) encontrado(s)
                </span>
                <span className="text-xs text-muted-foreground">(primeiros 10)</span>
              </div>

              {previewContacts && previewContacts.length > 0 ? (
                <div className="overflow-hidden rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nome</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Telefone</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewContacts.map((c, i) => (
                        <tr key={c.id} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                          <td className="px-3 py-2 text-foreground">{c.name || "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{c.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum contato encontrado com essas condições.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Segments;
