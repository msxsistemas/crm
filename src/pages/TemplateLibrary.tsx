import { useState, useEffect, useCallback } from "react";
import { Search, Plus, Copy, Download, Pencil, Trash2, Star, X, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import api from "@/lib/api";

const CATEGORIES = [
  { value: "all", label: "Todas" },
  { value: "vendas", label: "Vendas" },
  { value: "suporte", label: "Suporte" },
  { value: "cobranca", label: "Cobrança" },
  { value: "pos_venda", label: "Pós-venda" },
  { value: "agendamento", label: "Agendamento" },
  { value: "boas_vindas", label: "Boas-vindas" },
];

const CATEGORY_COLORS: Record<string, string> = {
  vendas: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  suporte: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  cobranca: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  pos_venda: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  agendamento: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  boas_vindas: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
};

const CATEGORY_LABELS: Record<string, string> = {
  vendas: "Vendas",
  suporte: "Suporte",
  cobranca: "Cobrança",
  pos_venda: "Pós-venda",
  agendamento: "Agendamento",
  boas_vindas: "Boas-vindas",
};

interface Template {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  variables: string[];
  is_default: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

const emptyForm = { title: "", content: "", category: "vendas", tags: "", variables: "" };

export default function TemplateLibrary() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Template | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (selectedCategory !== "all") qs.set("category", selectedCategory);
      if (search.trim()) qs.set("search", search.trim());
      const query = qs.toString() ? `?${qs.toString()}` : "";
      const rows = await api.get<Template[]>(`/template-library${query}`);
      setTemplates(rows);
    } catch {
      toast.error("Erro ao carregar templates");
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, search]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (t: Template) => {
    setEditTarget(t);
    setForm({
      title: t.title,
      content: t.content,
      category: t.category,
      tags: t.tags.join(", "),
      variables: t.variables.join(", "),
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Título e conteúdo são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category,
        tags: form.tags.split(",").map(s => s.trim()).filter(Boolean),
        variables: form.variables.split(",").map(s => s.trim()).filter(Boolean),
      };
      if (editTarget) {
        await api.put(`/template-library/${editTarget.id}`, payload);
        toast.success("Template atualizado!");
      } else {
        await api.post("/template-library", payload);
        toast.success("Template criado!");
      }
      setModalOpen(false);
      load();
    } catch {
      toast.error("Erro ao salvar template");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t: Template) => {
    if (!confirm(`Excluir template "${t.title}"?`)) return;
    try {
      await api.delete(`/template-library/${t.id}`);
      toast.success("Template excluído");
      load();
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const handleImport = async (t: Template) => {
    setImporting(t.id);
    try {
      await api.post(`/template-library/${t.id}/import`, {});
      toast.success(`"${t.title}" adicionado às Respostas Rápidas!`);
    } catch {
      toast.error("Erro ao importar template");
    } finally {
      setImporting(null);
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success("Copiado para a área de transferência!");
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar de categorias */}
      <aside className="w-52 shrink-0 border-r border-border bg-muted/30 p-3 flex flex-col gap-1 overflow-y-auto">
        <p className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase px-2 mb-1">Categorias</p>
        {CATEGORIES.map(cat => (
          <button
            key={cat.value}
            onClick={() => setSelectedCategory(cat.value)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              selectedCategory === cat.value
                ? "bg-primary text-primary-foreground font-medium"
                : "hover:bg-muted text-foreground"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border p-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar templates..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <div className="ml-auto">
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1.5" />
              Novo Template
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center items-center h-40 text-muted-foreground text-sm">Carregando...</div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Tag className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Nenhum template encontrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {templates.map(t => (
                <div key={t.id} className="border border-border rounded-xl p-4 bg-card hover:shadow-md transition-shadow flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-medium text-sm text-foreground truncate">{t.title}</h3>
                        {t.is_default && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-medium">
                            <Star className="h-2.5 w-2.5" />
                            Padrão
                          </span>
                        )}
                      </div>
                      <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mt-1 ${CATEGORY_COLORS[t.category] || "bg-gray-100 text-gray-700"}`}>
                        {CATEGORY_LABELS[t.category] || t.category}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{t.content}</p>

                  {t.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {t.tags.slice(0, 4).map(tag => (
                        <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {t.variables.length > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      Variáveis: {t.variables.map(v => `{{${v}}}`).join(", ")}
                    </p>
                  )}

                  <div className="flex items-center gap-1 mt-auto pt-1 border-t border-border/50">
                    <Button
                      size="sm"
                      className="flex-1 h-7 text-xs"
                      onClick={() => handleImport(t)}
                      disabled={importing === t.id}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {importing === t.id ? "Importando..." : "Usar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      title="Copiar"
                      onClick={() => handleCopy(t.content)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    {!t.is_default && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          title="Editar"
                          onClick={() => openEdit(t)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          title="Excluir"
                          onClick={() => handleDelete(t)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal criar/editar */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? "Editar Template" : "Novo Template"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div>
              <Label htmlFor="tl-title">Título *</Label>
              <Input
                id="tl-title"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Abordagem inicial de vendas"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="tl-category">Categoria *</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter(c => c.value !== "all").map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="tl-content">Mensagem *</Label>
              <Textarea
                id="tl-content"
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Use {{variavel}} para criar variáveis dinâmicas"
                rows={4}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="tl-tags">Tags (separadas por vírgula)</Label>
              <Input
                id="tl-tags"
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="vendas, prospecção, novo-cliente"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="tl-vars">Variáveis (separadas por vírgula)</Label>
              <Input
                id="tl-vars"
                value={form.variables}
                onChange={e => setForm(f => ({ ...f, variables: e.target.value }))}
                placeholder="nome, valor, data"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
