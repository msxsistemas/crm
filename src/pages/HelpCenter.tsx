import { useState, useEffect, useCallback } from "react";
import {
  BookOpen, Search, Plus, Pencil, Trash2, Pin, Eye,
  Tag, RefreshCw, ChevronRight, Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { db } from "@/lib/db";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ---- Types ----
interface HelpArticle {
  id: string;
  user_id: string | null;
  title: string;
  content: string;
  category: string;
  tags: string[] | null;
  pinned: boolean;
  views: number;
  created_at: string;
  updated_at: string;
  author_name?: string;
}

// ---- Constants ----
const PRESET_CATEGORIES = ["Geral", "Produto", "Atendimento", "Técnico", "Vendas"];

const CATEGORY_COLORS: Record<string, string> = {
  Geral:        "bg-gray-100 text-gray-700",
  Produto:      "bg-blue-100 text-blue-700",
  Atendimento:  "bg-green-100 text-green-700",
  Técnico:      "bg-orange-100 text-orange-700",
  Vendas:       "bg-purple-100 text-purple-700",
};

const getCategoryColor = (cat: string) =>
  CATEGORY_COLORS[cat] ?? "bg-slate-100 text-slate-700";

// ---- Empty form ----
const emptyForm = {
  title: "",
  category: "Geral",
  customCategory: "",
  tagsRaw: "",
  content: "",
  pinned: false,
};

// ---- Helpers ----
const parseTags = (raw: string): string[] =>
  raw.split(",").map(t => t.trim()).filter(Boolean);

const formatDate = (d: string) =>
  format(new Date(d), "dd/MM/yyyy", { locale: ptBR });

// ---- Component ----
const HelpCenter = () => {
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");

  // Dialog states
  const [articleDialog, setArticleDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  // View dialog
  const [viewArticle, setViewArticle] = useState<HelpArticle | null>(null);

  // ---- Fetch ----
  const fetchArticles = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await db
        .from("help_articles")
        .select("*")
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as HelpArticle[];

      // Enrich with author names from profiles
      const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))] as string[];
      let profileMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profData } = await db
          .from("profiles")
          .select("id, full_name")
          .in("id", userIds);
        if (profData) {
          (profData as { id: string; full_name: string | null }[]).forEach(p => {
            profileMap[p.id] = p.full_name ?? "Desconhecido";
          });
        }
      }

      setArticles(rows.map(r => ({
        ...r,
        author_name: r.user_id ? (profileMap[r.user_id] ?? "Desconhecido") : "Sistema",
      })));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar artigos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  // ---- Derived data ----
  const allCategories = ["Todos", ...Array.from(new Set(articles.map(a => a.category)))];

  const filtered = articles.filter(a => {
    const matchCat = selectedCategory === "Todos" || a.category === selectedCategory;
    const q = search.toLowerCase();
    const matchSearch = !q ||
      a.title.toLowerCase().includes(q) ||
      a.content.toLowerCase().includes(q) ||
      (a.tags ?? []).some(t => t.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  // Stats
  const totalArticles = articles.length;
  const totalPinned = articles.filter(a => a.pinned).length;
  const totalCategories = new Set(articles.map(a => a.category)).size;
  const totalViews = articles.reduce((s, a) => s + (a.views ?? 0), 0);

  // ---- Category article counts ----
  const categoryCounts = allCategories.reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = cat === "Todos"
      ? articles.length
      : articles.filter(a => a.category === cat).length;
    return acc;
  }, {});

  // ---- Handlers ----
  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setArticleDialog(true);
  };

  const openEdit = (article: HelpArticle) => {
    setEditingId(article.id);
    const isPreset = PRESET_CATEGORIES.includes(article.category);
    setForm({
      title: article.title,
      category: isPreset ? article.category : "custom",
      customCategory: isPreset ? "" : article.category,
      tagsRaw: (article.tags ?? []).join(", "),
      content: article.content,
      pinned: article.pinned,
    });
    setArticleDialog(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Título é obrigatório"); return; }
    if (!form.content.trim()) { toast.error("Conteúdo é obrigatório"); return; }

    const finalCategory = form.category === "custom"
      ? (form.customCategory.trim() || "Geral")
      : form.category;

    const { data: { user } } = await db.auth.getUser();

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        category: finalCategory,
        tags: parseTags(form.tagsRaw),
        content: form.content.trim(),
        pinned: form.pinned,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await db
          .from("help_articles")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        toast.success("Artigo atualizado!");
      } else {
        const { error } = await db
          .from("help_articles")
          .insert({ ...payload, user_id: user?.id ?? null });
        if (error) throw error;
        toast.success("Artigo criado!");
      }

      setArticleDialog(false);
      fetchArticles();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja excluir este artigo?")) return;
    try {
      const { error } = await db.from("help_articles").delete().eq("id", id);
      if (error) throw error;
      toast.success("Artigo excluído!");
      setArticles(prev => prev.filter(a => a.id !== id));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao excluir");
    }
  };

  const handlePinToggle = async (article: HelpArticle) => {
    try {
      const { error } = await db
        .from("help_articles")
        .update({ pinned: !article.pinned, updated_at: new Date().toISOString() })
        .eq("id", article.id);
      if (error) throw error;
      setArticles(prev =>
        prev.map(a => a.id === article.id ? { ...a, pinned: !a.pinned } : a)
      );
      toast.success(article.pinned ? "Artigo desafixado" : "Artigo fixado no topo");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar fixação");
    }
  };

  const handleViewOpen = async (article: HelpArticle) => {
    setViewArticle(article);
    // Increment views
    const newViews = (article.views ?? 0) + 1;
    await db
      .from("help_articles")
      .update({ views: newViews })
      .eq("id", article.id);
    setArticles(prev =>
      prev.map(a => a.id === article.id ? { ...a, views: newViews } : a)
    );
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-blue-600">Central de Ajuda</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar artigos..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchArticles} title="Atualizar">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Novo Artigo
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total artigos", value: totalArticles, icon: BookOpen, color: "text-blue-600" },
          { label: "Fixados", value: totalPinned, icon: Star, color: "text-yellow-600" },
          { label: "Categorias", value: totalCategories, icon: Tag, color: "text-purple-600" },
          { label: "Visualizações", value: totalViews, icon: Eye, color: "text-green-600" },
        ].map(stat => (
          <Card key={stat.label} className="shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className={`w-8 h-8 ${stat.color} opacity-80`} />
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main: sidebar + articles */}
      <div className="flex gap-6">
        {/* Categories sidebar */}
        <aside className="w-52 shrink-0">
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 px-1">Categorias</p>
          <nav className="space-y-1">
            {allCategories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedCategory === cat
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "hover:bg-gray-50 text-gray-700"
                }`}
              >
                <span className="flex items-center gap-2">
                  <ChevronRight className={`w-3.5 h-3.5 ${selectedCategory === cat ? "opacity-100" : "opacity-0"}`} />
                  {cat}
                </span>
                <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                  {categoryCounts[cat] ?? 0}
                </span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Articles list */}
        <div className="flex-1 min-w-0">
          {loading ? (
            <div className="text-center py-16 text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-lg font-medium">Nenhum artigo encontrado</p>
              <p className="text-sm mt-1">Clique em &quot;Novo Artigo&quot; para começar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(article => (
                <Card key={article.id} className="shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        {/* Title row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {article.pinned && (
                            <Pin className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                          )}
                          <button
                            className="font-semibold text-base hover:text-blue-600 transition-colors text-left"
                            onClick={() => handleViewOpen(article)}
                          >
                            {article.title}
                          </button>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(article.category)}`}>
                            {article.category}
                          </span>
                        </div>

                        {/* Tags */}
                        {(article.tags ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {(article.tags ?? []).map(tag => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Content preview */}
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {article.content.slice(0, 120)}{article.content.length > 120 ? "..." : ""}
                        </p>

                        {/* Meta */}
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span>{article.author_name}</span>
                          <span>{formatDate(article.created_at)}</span>
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            {article.views ?? 0}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handlePinToggle(article)}
                          title={article.pinned ? "Desafixar" : "Fixar no topo"}
                          className={article.pinned ? "text-yellow-500" : ""}
                        >
                          <Pin className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(article)}
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(article.id)}
                          title="Excluir"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- Article Create/Edit Dialog ---- */}
      <Dialog open={articleDialog} onOpenChange={setArticleDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Artigo" : "Novo Artigo"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Título */}
            <div>
              <label className="text-sm font-medium mb-1 block">Título *</label>
              <Input
                placeholder="Título do artigo"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            {/* Categoria */}
            <div>
              <label className="text-sm font-medium mb-1 block">Categoria</label>
              <Select
                value={form.category}
                onValueChange={v => setForm(f => ({ ...f, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar categoria" />
                </SelectTrigger>
                <SelectContent>
                  {PRESET_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                  <SelectItem value="custom">Personalizada...</SelectItem>
                </SelectContent>
              </Select>
              {form.category === "custom" && (
                <Input
                  className="mt-2"
                  placeholder="Digite a categoria personalizada"
                  value={form.customCategory}
                  onChange={e => setForm(f => ({ ...f, customCategory: e.target.value }))}
                />
              )}
            </div>

            {/* Tags */}
            <div>
              <label className="text-sm font-medium mb-1 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                Tags (separadas por vírgula)
              </label>
              <Input
                placeholder="ex: tutorial, onboarding, produto"
                value={form.tagsRaw}
                onChange={e => setForm(f => ({ ...f, tagsRaw: e.target.value }))}
              />
              {/* Tag chips preview */}
              {parseTags(form.tagsRaw).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {parseTags(form.tagsRaw).map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Conteúdo */}
            <div>
              <label className="text-sm font-medium mb-1 block">Conteúdo *</label>
              <Textarea
                placeholder="Escreva o conteúdo do artigo aqui..."
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={10}
              />
            </div>

            {/* Fixar no topo */}
            <div className="flex items-center gap-3">
              <Switch
                checked={form.pinned}
                onCheckedChange={v => setForm(f => ({ ...f, pinned: v }))}
              />
              <label className="text-sm font-medium cursor-pointer select-none">
                Fixar no topo
              </label>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setArticleDialog(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar artigo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Article View Dialog ---- */}
      <Dialog open={!!viewArticle} onOpenChange={open => { if (!open) setViewArticle(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {viewArticle && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 flex-wrap">
                  {viewArticle.pinned && <Pin className="w-4 h-4 text-yellow-500" />}
                  <DialogTitle className="text-xl">{viewArticle.title}</DialogTitle>
                </div>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                {/* Meta */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getCategoryColor(viewArticle.category)}`}>
                    {viewArticle.category}
                  </span>
                  {(viewArticle.tags ?? []).map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{viewArticle.author_name}</span>
                  <span>{formatDate(viewArticle.created_at)}</span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {viewArticle.views ?? 0} visualizações
                  </span>
                </div>

                <hr />

                {/* Content */}
                <div className="text-sm whitespace-pre-wrap leading-relaxed">
                  {viewArticle.content}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default HelpCenter;
