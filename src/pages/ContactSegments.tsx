import React, { useState, useEffect, useCallback } from "react";
import { Plus, Edit2, Trash2, Eye, Users, Download, ChevronLeft, ChevronRight, Target, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import api from "@/lib/api";
import { useNavigate } from "react-router-dom";

interface FilterItem {
  type: string;
  value: string | string[] | boolean;
  key?: string;
}

interface Segment {
  id: string;
  name: string;
  filters: FilterItem[];
  contact_count: number;
  created_by_name: string | null;
  created_at: string;
}

interface PreviewContact {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  organization: string | null;
  created_at: string;
}

const FILTER_TYPES = [
  { value: "tag", label: "Tag" },
  { value: "custom_field", label: "Campo personalizado" },
  { value: "created_at_after", label: "Criado após" },
  { value: "created_at_before", label: "Criado antes" },
  { value: "phone_starts_with", label: "Telefone começa com" },
  { value: "has_conversation", label: "Tem conversa" },
  { value: "last_message_before", label: "Última mensagem há mais de (dias)" },
];

export default function ContactSegments() {
  const navigate = useNavigate();
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal criar/editar
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<Segment | null>(null);
  const [formName, setFormName] = useState("");
  const [formFilters, setFormFilters] = useState<FilterItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSegment, setPreviewSegment] = useState<Segment | null>(null);
  const [previewContacts, setPreviewContacts] = useState<PreviewContact[]>([]);
  const [previewTotal, setPreviewTotal] = useState(0);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchSegments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/contact-segments") as Segment[];
      setSegments(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Erro ao carregar segmentos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSegments(); }, [fetchSegments]);

  const openCreate = () => {
    setEditingSegment(null);
    setFormName("");
    setFormFilters([]);
    setModalOpen(true);
  };

  const openEdit = (seg: Segment) => {
    setEditingSegment(seg);
    setFormName(seg.name);
    setFormFilters(seg.filters ? [...seg.filters] : []);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error("Nome obrigatório"); return; }
    setSaving(true);
    try {
      if (editingSegment) {
        await api.put(`/contact-segments/${editingSegment.id}`, { name: formName, filters: formFilters });
        toast.success("Segmento atualizado!");
      } else {
        await api.post("/contact-segments", { name: formName, filters: formFilters });
        toast.success("Segmento criado!");
      }
      setModalOpen(false);
      fetchSegments();
    } catch {
      toast.error("Erro ao salvar segmento");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/contact-segments/${id}`);
      toast.success("Segmento removido");
      setDeleteId(null);
      fetchSegments();
    } catch {
      toast.error("Erro ao remover segmento");
    }
  };

  const openPreview = async (seg: Segment, page = 1) => {
    setPreviewSegment(seg);
    setPreviewPage(page);
    setPreviewOpen(true);
    setPreviewLoading(true);
    try {
      const data = await api.get(`/contact-segments/${seg.id}/preview?page=${page}&limit=20`) as { contacts: PreviewContact[]; total: number };
      setPreviewContacts(data.contacts || []);
      setPreviewTotal(data.total || 0);
    } catch {
      toast.error("Erro ao carregar preview");
    } finally {
      setPreviewLoading(false);
    }
  };

  const exportCSV = () => {
    if (!previewContacts.length) return;
    const headers = ["Nome", "Telefone", "Email", "Empresa", "Criado em"];
    const rows = previewContacts.map(c => [
      c.name || "",
      c.phone,
      c.email || "",
      c.organization || "",
      new Date(c.created_at).toLocaleDateString("pt-BR"),
    ]);
    const csvContent = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `segmento-${previewSegment?.name || "export"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addFilter = () => {
    setFormFilters(prev => [...prev, { type: "tag", value: "" }]);
  };

  const updateFilter = (idx: number, field: keyof FilterItem, val: string | boolean) => {
    setFormFilters(prev => {
      const next = [...prev];
      if (field === "type") {
        next[idx] = { type: val as string, value: val === "has_conversation" ? true : "" };
      } else {
        next[idx] = { ...next[idx], [field]: val };
      }
      return next;
    });
  };

  const removeFilter = (idx: number) => {
    setFormFilters(prev => prev.filter((_, i) => i !== idx));
  };

  const renderFilterValueInput = (f: FilterItem, idx: number) => {
    if (f.type === "has_conversation") {
      return (
        <Select value={String(f.value)} onValueChange={v => updateFilter(idx, "value", v === "true")}>
          <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Sim</SelectItem>
            <SelectItem value="false">Não</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    if (f.type === "custom_field") {
      return (
        <div className="flex gap-1 flex-1">
          <Input
            className="h-8 text-xs"
            placeholder="Campo (ex: plano)"
            value={f.key || ""}
            onChange={e => updateFilter(idx, "key", e.target.value)}
          />
          <Input
            className="h-8 text-xs"
            placeholder="Valor"
            value={String(f.value)}
            onChange={e => updateFilter(idx, "value", e.target.value)}
          />
        </div>
      );
    }
    if (f.type === "created_at_before" || f.type === "created_at_after") {
      return (
        <Input
          type="date"
          className="h-8 text-xs flex-1"
          value={String(f.value)}
          onChange={e => updateFilter(idx, "value", e.target.value)}
        />
      );
    }
    return (
      <Input
        className="h-8 text-xs flex-1"
        placeholder={
          f.type === "tag" ? "ex: cliente, vip" :
          f.type === "phone_starts_with" ? "ex: 55" :
          f.type === "last_message_before" ? "ex: 30 (dias)" :
          "Valor"
        }
        value={String(f.value)}
        onChange={e => updateFilter(idx, "value", e.target.value)}
      />
    );
  };

  const totalPages = Math.ceil(previewTotal / 20);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Filter className="h-6 w-6 text-primary" />
              Segmentação Dinâmica
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Crie segmentos de contatos com filtros dinâmicos para campanhas e análises.
            </p>
          </div>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Segmento
          </Button>
        </div>

        {/* Segments list */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Carregando...</div>
        ) : segments.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Target className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Nenhum segmento criado</p>
            <p className="text-sm mt-1">Clique em "Novo Segmento" para começar</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {segments.map(seg => (
              <div key={seg.id} className="bg-card border border-border rounded-xl p-5 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-foreground">{seg.name}</h3>
                    <Badge variant="secondary" className="text-xs">
                      <Users className="h-3 w-3 mr-1" />
                      {seg.contact_count ?? 0} contatos
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(seg.filters || []).map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-[11px] px-2 py-0.5 font-medium">
                        {FILTER_TYPES.find(t => t.value === f.type)?.label || f.type}
                        {f.type !== "has_conversation" && `: ${Array.isArray(f.value) ? f.value.join(", ") : String(f.value)}`}
                      </span>
                    ))}
                    {(!seg.filters || seg.filters.length === 0) && (
                      <span className="text-xs text-muted-foreground">Sem filtros</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Criado por {seg.created_by_name || "—"} em {new Date(seg.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => openPreview(seg)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => navigate(`/campanhas?segment_id=${seg.id}`)}
                  >
                    <Target className="h-3.5 w-3.5" />
                    Usar em Campanha
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(seg)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(seg.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingSegment ? "Editar Segmento" : "Novo Segmento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div>
              <Label className="text-sm">Nome do segmento</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="ex: Clientes VIP"
                className="mt-1"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm">Filtros</Label>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={addFilter}>
                  <Plus className="h-3 w-3" /> Adicionar filtro
                </Button>
              </div>
              <div className="space-y-2">
                {formFilters.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Nenhum filtro — todos os contatos serão incluídos</p>
                )}
                {formFilters.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select value={f.type} onValueChange={v => updateFilter(idx, "type", v)}>
                      <SelectTrigger className="h-8 text-xs w-44 shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FILTER_TYPES.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {renderFilterValueInput(f, idx)}
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={() => removeFilter(idx)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Preview: {previewSegment?.name}</span>
              <Badge variant="secondary">
                {previewTotal} contato(s)
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {previewLoading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : previewContacts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum contato encontrado com esses filtros</p>
            ) : (
              <div className="overflow-auto max-h-80">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-2 px-2 font-medium">Nome</th>
                      <th className="text-left py-2 px-2 font-medium">Telefone</th>
                      <th className="text-left py-2 px-2 font-medium">Email</th>
                      <th className="text-left py-2 px-2 font-medium">Empresa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewContacts.map(c => (
                      <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-1.5 px-2">{c.name || "—"}</td>
                        <td className="py-1.5 px-2">{c.phone}</td>
                        <td className="py-1.5 px-2">{c.email || "—"}</td>
                        <td className="py-1.5 px-2">{c.organization || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={previewPage <= 1}
                  onClick={() => previewSegment && openPreview(previewSegment, previewPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span>Página {previewPage} de {totalPages}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  disabled={previewPage >= totalPages}
                  onClick={() => previewSegment && openPreview(previewSegment, previewPage + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="gap-2" onClick={exportCSV} disabled={previewContacts.length === 0}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
            <Button
              className="gap-2"
              onClick={() => { if (previewSegment) navigate(`/campanhas?segment_id=${previewSegment.id}`); }}
            >
              <Target className="h-4 w-4" /> Usar em Campanha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar exclusão</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir este segmento? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteId && handleDelete(deleteId)}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
