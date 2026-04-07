import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Search, Paintbrush, X, Layers, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatingInput } from "@/components/ui/floating-input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import ColorPicker from "@/components/shared/ColorPicker";

type Category = { id: string; name: string; description: string | null; color: string };

const Categories = () => {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [catToDelete, setCatToDelete] = useState<Category | null>(null);
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState("#2196F3");
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showError, setShowError] = useState(false);

  const fetchCats = useCallback(async () => {
    if (!user) return;
    const { data } = await db.from("categories").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (data) setCategories(data as Category[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchCats(); }, [fetchCats]);

  const openCreate = () => {
    setEditingCat(null);
    setCatName("");
    setCatColor("#2196F3");
    setShowError(false);
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatColor(cat.color?.startsWith("#") ? cat.color : "#2196F3");
    setShowError(false);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !catName.trim()) {
      setShowError(true);
      return;
    }
    if (editingCat) {
      const { error } = await db.from("categories").update({ name: catName.trim(), description: null, color: catColor }).eq("id", editingCat.id);
      if (error) { toast.error("Erro ao atualizar categoria"); return; }
      toast.success("Categoria atualizada!");
    } else {
      const { error } = await db.from("categories").insert({ name: catName.trim(), description: null, color: catColor, user_id: user.id });
      if (error) { toast.error("Erro ao criar categoria"); return; }
      toast.success("Categoria criada!");
    }
    setDialogOpen(false);
    fetchCats();
  };

  const confirmDelete = (cat: Category) => {
    setCatToDelete(cat);
    setDeleteDialogOpen(true);
  };

  const handleDeleteCat = async () => {
    if (!catToDelete) return;
    const { error } = await db.from("categories").delete().eq("id", catToDelete.id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Categoria excluída!");
    setDeleteDialogOpen(false);
    setCatToDelete(null);
    fetchCats();
  };

  const filtered = categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-blue-600">Categorias de Filas</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar categorias..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 w-52"
            />
          </div>
          <Button variant="action" className="gap-2 px-5 uppercase text-xs font-semibold" onClick={openCreate}>
            <Plus className="h-4 w-4" /> ADICIONAR
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-4">
      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Tag className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Nenhuma categoria encontrada</p>
        </div>
      ) : (
        <Card className="divide-y divide-border">
          {filtered.map(cat => (
            <div key={cat.id} className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-4">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: cat.color?.startsWith("#") ? `${cat.color}20` : "hsl(var(--primary) / 0.1)" }}
                >
                  <Layers
                    className="h-5 w-5"
                    style={{ color: cat.color?.startsWith("#") ? cat.color : "hsl(var(--primary))" }}
                  />
                </div>
                <div>
                  <p className="font-medium text-foreground">{cat.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div
                      className="h-3.5 w-3.5 rounded"
                      style={{ backgroundColor: cat.color?.startsWith("#") ? cat.color : "hsl(var(--primary))" }}
                    />
                    <span className="text-xs text-muted-foreground">Cor selecionada: {cat.color}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(cat)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => confirmDelete(cat)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) { setEditingCat(null); setCatName(""); setCatColor("#2196F3"); setShowError(false); } setDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
          {/* Header */}
          <div className="bg-blue-600 px-6 py-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <Layers className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">
                {editingCat ? "Editar Categoria" : "Nova Categoria"}
              </h2>
              <p className="text-xs text-white/70">
                {editingCat ? "Atualize as informações da categoria" : "Crie uma nova categoria para organizar suas filas"}
              </p>
            </div>
            <button onClick={() => setDialogOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
            {/* Name */}
             <Card className="p-4 space-y-2">
              <div className="flex items-center gap-2 mb-4">
                <Layers className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm text-foreground">Informações da Categoria</span>
              </div>
              <div>
                <FloatingInput
                  label="Nome da Categoria"
                  value={catName}
                  onChange={e => { setCatName(e.target.value); setShowError(false); }}
                  placeholder="Ex: Vendas, Suporte, Cobrança"
                  className={showError && !catName.trim() ? "border-destructive focus-visible:border-destructive" : ""}
                />
                <p className={`text-[11px] pl-1 mt-1 ${showError && !catName.trim() ? "text-destructive" : "text-muted-foreground"}`}>
                  {showError && !catName.trim() ? "Campo obrigatório" : "Digite um nome descritivo"}
                </p>
              </div>
            </Card>

            {/* Color */}
            <Card className="p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Paintbrush className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm text-foreground">Cor da Categoria</span>
              </div>

              <div className="h-12 rounded-lg border border-border" style={{ backgroundColor: catColor }} />

              <ColorPicker color={catColor} onChange={setCatColor} />

              <p className="text-[11px] text-muted-foreground text-center">Cor selecionada: {catColor}</p>
            </Card>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave} disabled={!catName.trim()}>
              {editingCat ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-xl p-0 gap-0">
          <div className="bg-blue-600 text-white px-6 py-4 rounded-t-lg">
            <h3 className="text-lg font-bold">Excluir {catToDelete?.name}?</h3>
            <p className="text-sm text-white/80">Esta ação não pode ser desfeita</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-foreground">
              A categoria <strong>{catToDelete?.name}</strong> será excluída permanentemente.
            </p>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-4">
            <Button variant="outline" className="uppercase font-semibold text-xs" onClick={() => setDeleteDialogOpen(false)}>CANCELAR</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white uppercase font-semibold text-xs px-6" onClick={handleDeleteCat}>OK</Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default Categories;
