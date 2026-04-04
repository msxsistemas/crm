import { useState, useEffect, useCallback } from "react";
import {
  Package, DollarSign, CheckCircle, XCircle,
  Plus, Search, RefreshCw, Pencil, Trash2, Image, Tag, ToggleLeft, ToggleRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/db";

interface Product {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  price: number;
  sku: string | null;
  image_url: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const emptyForm = {
  name: "",
  description: "",
  price: "",
  sku: "",
  image_url: "",
  active: true,
};

const Products = () => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const fetchProducts = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProducts((data ?? []) as Product[]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar produtos";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description ?? "",
      price: String(product.price ?? ""),
      sku: product.sku ?? "",
      image_url: product.image_url ?? "",
      active: product.active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        name: form.name.trim(),
        description: form.description || null,
        price: parseFloat(form.price) || 0,
        sku: form.sku || null,
        image_url: form.image_url || null,
        active: form.active,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", user.id);
        if (error) throw error;
        toast.success("Produto atualizado!");
      } else {
        const { error } = await supabase
          .from("products")
          .insert(payload);
        if (error) throw error;
        toast.success("Produto criado!");
      }

      setDialogOpen(false);
      fetchProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (!confirm("Deseja excluir este produto?")) return;
    try {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Produto excluído!");
      fetchProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao excluir";
      toast.error(msg);
    }
  };

  const handleToggleActive = async (product: Product) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("products")
        .update({ active: !product.active, updated_at: new Date().toISOString() })
        .eq("id", product.id)
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success(product.active ? "Produto inativado" : "Produto ativado");
      fetchProducts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao atualizar";
      toast.error(msg);
    }
  };

  const filtered = products.filter(p => {
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(search.toLowerCase());
    const matchActive =
      activeFilter === "all" ||
      (activeFilter === "active" && p.active) ||
      (activeFilter === "inactive" && !p.active);
    return matchSearch && matchActive;
  });

  const totalActive = products.filter(p => p.active).length;
  const totalInactive = products.filter(p => !p.active).length;
  const avgPrice = products.length > 0
    ? products.reduce((s, p) => s + (p.price ?? 0), 0) / products.length
    : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-blue-600">Produtos</h1>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Novo Produto
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Total produtos</span>
            </div>
            <span className="text-xl font-bold">{products.length}</span>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Ativos</span>
            </div>
            <span className="text-xl font-bold">{totalActive}</span>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="text-xs text-muted-foreground">Inativos</span>
            </div>
            <span className="text-xl font-bold">{totalInactive}</span>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              <span className="text-xs text-muted-foreground">Valor médio</span>
            </div>
            <span className="text-xl font-bold">{formatCurrency(avgPrice)}</span>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, SKU ou descrição..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchProducts} title="Atualizar">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Nenhum produto encontrado</p>
          <p className="text-sm mt-1">Clique em &quot;Novo Produto&quot; para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(product => (
            <Card key={product.id} className="shadow-sm hover:shadow-md transition-shadow overflow-hidden">
              {/* Image area */}
              <div className="h-36 bg-gray-100 flex items-center justify-center overflow-hidden">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <Image className="w-10 h-10 text-gray-300" />
                )}
              </div>

              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-base leading-tight line-clamp-2">{product.name}</h3>
                  <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    product.active
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {product.active ? "Ativo" : "Inativo"}
                  </span>
                </div>

                {product.sku && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Tag className="w-3.5 h-3.5" />
                    SKU: {product.sku}
                  </div>
                )}

                {product.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
                )}

                <div className="flex items-center gap-1 font-bold text-lg text-foreground">
                  <DollarSign className="w-4 h-4 text-emerald-600" />
                  {formatCurrency(product.price ?? 0)}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 pt-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleActive(product)}
                    title={product.active ? "Inativar" : "Ativar"}
                    className={product.active ? "text-green-600 hover:text-green-700" : "text-gray-400 hover:text-gray-600"}
                  >
                    {product.active
                      ? <ToggleRight className="w-5 h-5" />
                      : <ToggleLeft className="w-5 h-5" />
                    }
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(product)} title="Editar">
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(product.id)}
                    title="Excluir"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Produto" : "Novo Produto"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Nome */}
            <div>
              <label className="text-sm font-medium mb-1 block">Nome *</label>
              <Input
                placeholder="Nome do produto"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Descrição */}
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Textarea
                placeholder="Descrição do produto..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Preço */}
            <div>
              <label className="text-sm font-medium mb-1 block">Preço (R$)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
              />
            </div>

            {/* SKU */}
            <div>
              <label className="text-sm font-medium mb-1 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5" />
                SKU
              </label>
              <Input
                placeholder="Código do produto"
                value={form.sku}
                onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
              />
            </div>

            {/* URL da imagem */}
            <div>
              <label className="text-sm font-medium mb-1 flex items-center gap-1">
                <Image className="w-3.5 h-3.5" />
                URL da imagem
              </label>
              <Input
                placeholder="https://exemplo.com/imagem.jpg"
                value={form.image_url}
                onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
              />
            </div>

            {/* Ativo */}
            <div className="flex items-center gap-3">
              <Switch
                checked={form.active}
                onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
                id="active-switch"
              />
              <label htmlFor="active-switch" className="text-sm font-medium cursor-pointer">
                {form.active ? "Produto ativo" : "Produto inativo"}
              </label>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar produto"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Products;
