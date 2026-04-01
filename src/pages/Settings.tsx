import { useState, useEffect, useCallback } from "react";
import {
  Settings as SettingsIcon, User, Lock, Eye, EyeOff, Save, Tag, Search, Plus,
  Building2, Zap, CheckCircle, Clock, Users2, X, Info, Pencil,
  Shuffle, UserPlus, Building
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Color palette for tags/categories ───
const colorPalette = [
  "bg-white", "bg-red-500", "bg-orange-500", "bg-amber-400", "bg-yellow-300",
  "bg-lime-400", "bg-green-500", "bg-emerald-500", "bg-teal-500", "bg-cyan-400",
  "bg-sky-500", "bg-blue-500", "bg-indigo-500", "bg-violet-500", "bg-purple-500",
  "bg-fuchsia-500", "bg-pink-500", "bg-rose-500", "bg-gray-400", "bg-indigo-900",
  "bg-purple-300", "bg-slate-400", "bg-blue-800", "bg-sky-300", "bg-amber-700",
  "bg-gray-600",
];

// ─── Geral Tab ───
const GeralTab = () => {
  const { user, signOut } = useAuth();
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (user) {
      supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle().then(({ data }) => {
        if (data?.full_name) setFullName(data.full_name);
      });
    }
  }, [user]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
      if (error) throw error;
      toast.success("Perfil atualizado!");
    } catch {
      toast.error("Erro ao salvar perfil");
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPwd.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    if (newPwd !== confirmPwd) { toast.error("Senhas não conferem"); return; }
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      toast.success("Senha alterada!");
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar senha");
    }
  };

  const initial = (fullName || user?.email || "U").charAt(0).toUpperCase();

  return (
    <div className="space-y-6">
      {/* Profile */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <User className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Meu Perfil</h3>
            <p className="text-sm text-muted-foreground">Atualize suas informações pessoais</p>
          </div>
        </div>
        <div className="flex items-start gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="h-24 w-24 rounded-xl bg-primary flex items-center justify-center text-3xl font-bold text-primary-foreground">
              {initial}
            </div>
            <span className="text-xs text-muted-foreground">Clique para alterar</span>
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-sm font-medium text-foreground">Nome</label>
                <Input value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>
              <Button className="gap-2" onClick={handleSaveProfile} disabled={saving}>
                <Save className="h-4 w-4" /> Salvar
              </Button>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">E-mail</label>
              <Input value={user?.email || ""} disabled />
              <p className="text-xs text-muted-foreground mt-1">O e-mail não pode ser alterado</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Change Password */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Alterar Senha</h3>
            <p className="text-sm text-muted-foreground">Atualize sua senha de acesso</p>
          </div>
        </div>
        <div className="space-y-4 max-w-md">
          <div>
            <label className="text-sm font-medium text-foreground">Senha atual</label>
            <div className="relative">
              <Input
                type={showCurrent ? "text" : "password"}
                value={currentPwd}
                onChange={e => setCurrentPwd(e.target.value)}
                placeholder="Digite sua senha atual"
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowCurrent(!showCurrent)}>
                {showCurrent ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Nova senha</label>
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
                placeholder="Digite a nova senha (mínimo 6 caracteres)"
              />
              <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setShowNew(!showNew)}>
                {showNew ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">Confirmar nova senha</label>
            <Input
              type="password"
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
              placeholder="Confirme a nova senha"
            />
          </div>
          <Button className="gap-2" onClick={handleChangePassword}>
            <Lock className="h-4 w-4" /> Alterar Senha
          </Button>
        </div>
      </Card>
    </div>
  );
};

// ─── Tags Tab ───
const TagsTab = () => {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<{ id: string; name: string; color: string } | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("bg-primary");
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("tags").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (data) setTags(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const openCreate = () => { setEditingTag(null); setTagName(""); setTagColor("bg-primary"); setDialogOpen(true); };
  const openEdit = (tag: { id: string; name: string; color: string }) => { setEditingTag(tag); setTagName(tag.name); setTagColor(tag.color); setDialogOpen(true); };

  const handleSave = async () => {
    if (!user || !tagName.trim()) return;
    if (editingTag) {
      const { error } = await supabase.from("tags").update({ name: tagName.trim(), color: tagColor }).eq("id", editingTag.id);
      if (error) { toast.error("Erro ao atualizar tag"); return; }
      toast.success("Tag atualizada!");
    } else {
      const { error } = await supabase.from("tags").insert({ name: tagName.trim(), color: tagColor, user_id: user.id });
      if (error) { toast.error("Erro ao criar tag"); return; }
      toast.success("Tag criada!");
    }
    setDialogOpen(false);
    fetchTags();
  };

  const handleDeleteTag = async (id: string) => {
    const { error } = await supabase.from("tags").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Tag excluída!");
    fetchTags();
  };

  const filtered = tags.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Tag className="h-5 w-5 text-primary" /></div>
          <div><p className="text-2xl font-bold text-foreground">{tags.length}</p><p className="text-xs text-muted-foreground">Tags criadas</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Users2 className="h-5 w-5 text-amber-500" /></div>
          <div><p className="text-2xl font-bold text-foreground">0</p><p className="text-xs text-muted-foreground">Contatos taggeados</p></div>
        </Card>
      </div>
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar tags..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button variant="action" className="gap-2 px-5" onClick={openCreate}><Plus className="h-4 w-4" /> Nova Tag</Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Tag className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-foreground">Nenhuma tag criada</p>
            <p className="text-sm text-muted-foreground">Crie tags para organizar seus contatos</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {filtered.map(tag => (
              <Badge key={tag.id} className={cn("text-white gap-1.5 py-1.5 px-3 text-sm", tag.color)}>
                {tag.name}
                <button onClick={() => openEdit(tag)} className="ml-0.5 hover:opacity-70"><Pencil className="h-3 w-3" /></button>
                <button onClick={() => handleDeleteTag(tag.id)} className="hover:opacity-70"><X className="h-3 w-3" /></button>
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingTag ? "Editar Tag" : "Nova Tag"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nome da tag</label>
              <Input value={tagName} onChange={e => setTagName(e.target.value)} placeholder="Ex: VIP, Lead..." />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Cor</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {colorPalette.map(c => (
                  <button key={c} onClick={() => setTagColor(c)}
                    className={cn("h-8 w-8 rounded-md transition-all", c, tagColor === c && "ring-2 ring-primary ring-offset-2 ring-offset-background")} />
                ))}
              </div>
            </div>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground mb-2">Preview</p>
              <Badge className={cn("text-white", tagColor)}>{tagName || "Nome da tag"}</Badge>
            </Card>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleSave} disabled={!tagName.trim()}>{editingTag ? "Atualizar" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Categorias Tab ───
const CategoriasTab = () => {
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<{ id: string; name: string; description: string | null; color: string } | null>(null);
  const [catName, setCatName] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catColor, setCatColor] = useState("bg-purple-500");
  const [categories, setCategories] = useState<{ id: string; name: string; description: string | null; color: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCats = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("categories").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (data) setCategories(data);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchCats(); }, [fetchCats]);

  const openCreate = () => { setEditingCat(null); setCatName(""); setCatDesc(""); setCatColor("bg-purple-500"); setDialogOpen(true); };
  const openEdit = (cat: { id: string; name: string; description: string | null; color: string }) => {
    setEditingCat(cat); setCatName(cat.name); setCatDesc(cat.description || ""); setCatColor(cat.color); setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user || !catName.trim()) return;
    if (editingCat) {
      const { error } = await supabase.from("categories").update({ name: catName.trim(), description: catDesc || null, color: catColor }).eq("id", editingCat.id);
      if (error) { toast.error("Erro ao atualizar categoria"); return; }
      toast.success("Categoria atualizada!");
    } else {
      const { error } = await supabase.from("categories").insert({ name: catName.trim(), description: catDesc || null, color: catColor, user_id: user.id });
      if (error) { toast.error("Erro ao criar categoria"); return; }
      toast.success("Categoria criada!");
    }
    setDialogOpen(false);
    fetchCats();
  };

  const handleDeleteCat = async (id: string) => {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Categoria excluída!");
    fetchCats();
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-muted-foreground">Organize seus atendentes em categorias para distribuição de atendimentos</p>
          <Button variant="action" className="gap-2 px-5" onClick={openCreate}><Plus className="h-4 w-4" /> Nova Categoria</Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-foreground">Nenhuma categoria criada</p>
            <p className="text-sm text-muted-foreground">Crie categorias para organizar seus atendimentos</p>
          </div>
        ) : (
          <div className="space-y-2">
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <div className={cn("h-8 w-8 rounded-md", cat.color)} />
                  <div>
                    <p className="text-sm font-medium text-foreground">{cat.name}</p>
                    {cat.description && <p className="text-xs text-muted-foreground">{cat.description}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteCat(cat.id)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingCat ? "Editar Categoria" : "Nova Categoria"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nome *</label>
              <Input value={catName} onChange={e => setCatName(e.target.value)} placeholder="Ex: Vendas, Suporte" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <Input value={catDesc} onChange={e => setCatDesc(e.target.value)} placeholder="Breve descrição" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Cor</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {colorPalette.map(c => (
                  <button key={c} onClick={() => setCatColor(c)}
                    className={cn("h-8 w-8 rounded-md transition-all", c, catColor === c && "ring-2 ring-primary ring-offset-2 ring-offset-background")} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!catName.trim()}>{editingCat ? "Atualizar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Respostas Rápidas Tab ───
const RespostasRapidasTab = () => {
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Zap className="h-5 w-5 text-amber-500" /></div>
          <div><p className="text-2xl font-bold text-foreground">0</p><p className="text-xs text-muted-foreground">Respostas rápidas</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><CheckCircle className="h-5 w-5 text-emerald-500" /></div>
          <div><p className="text-2xl font-bold text-foreground">0</p><p className="text-xs text-muted-foreground">Ativas</p></div>
        </Card>
      </div>
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar respostas rápidas..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button variant="action" className="gap-2 px-5" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> Nova Resposta</Button>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Zap className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="font-medium text-foreground">Nenhuma resposta rápida</p>
          <p className="text-sm text-muted-foreground">Crie respostas para agilizar seus atendimentos</p>
          <p className="text-xs text-muted-foreground mt-1">Use /atalho no chat para inserir rapidamente</p>
        </div>
      </Card>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Nova Resposta Rápida</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Atalho</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">/</span>
                  <Input value={shortcut} onChange={e => setShortcut(e.target.value)} className="pl-7" placeholder="ola" />
                </div>
                <p className="text-xs text-muted-foreground mt-1">Apenas letras e números</p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Título</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Saudação inicial" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Mensagem</label>
              <Textarea value={message} onChange={e => setMessage(e.target.value)} rows={4}
                placeholder="Olá! Seja bem-vindo(a)! Como posso ajudar você hoje?" />
              <p className="text-xs text-muted-foreground mt-1">Use {"{nome}"} para inserir o nome do contato automaticamente</p>
            </div>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground mb-2">Preview</p>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-mono">/{shortcut || "atalho"}</Badge>
                <span className="text-sm font-medium text-foreground">{title || "Título"}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{message || "Sua mensagem aparecerá aqui..."}</p>
            </Card>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={() => { toast.success("Resposta criada!"); setNewOpen(false); setShortcut(""); setTitle(""); setMessage(""); }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Horários Tab ───
const HorariosTab = () => {
  const [enabled, setEnabled] = useState(true);
  const [offMessage, setOffMessage] = useState("No momento estamos fora do horário de atendimento. Retornaremos em breve!");
  const days = [
    { name: "Segunda-feira", active: true, start: "08:00", end: "18:00" },
    { name: "Terça-feira", active: true, start: "08:00", end: "18:00" },
    { name: "Quarta-feira", active: true, start: "08:00", end: "18:00" },
    { name: "Quinta-feira", active: true, start: "08:00", end: "18:00" },
    { name: "Sexta-feira", active: true, start: "08:00", end: "18:00" },
    { name: "Sábado", active: false, start: "", end: "" },
    { name: "Domingo", active: false, start: "", end: "" },
  ];
  const [schedule, setSchedule] = useState(days);

  const toggleDay = (idx: number) => {
    setSchedule(prev => prev.map((d, i) => i === idx ? { ...d, active: !d.active } : d));
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Clock className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="font-semibold text-foreground">Horário de Atendimento</p>
              <p className="text-sm text-muted-foreground">Envia mensagem automática fora do horário</p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </Card>

      {enabled && (
        <>
          <Card className="p-4 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Mensagem Fora do Horário</label>
              <Textarea value={offMessage} onChange={e => setOffMessage(e.target.value)} rows={2} />
              <p className="text-xs text-muted-foreground mt-1">Esta mensagem será enviada automaticamente fora do horário configurado</p>
            </div>

            <div className="space-y-2">
              {schedule.map((day, idx) => (
                <div key={day.name} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
                  <Switch checked={day.active} onCheckedChange={() => toggleDay(idx)} />
                  <span className="text-sm font-medium text-foreground w-32">{day.name}</span>
                  {day.active ? (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Input type="time" value={day.start} className="w-28 text-sm"
                          onChange={e => setSchedule(prev => prev.map((d, i) => i === idx ? { ...d, start: e.target.value } : d))} />
                      </div>
                      <span className="text-sm text-muted-foreground">até</span>
                      <div className="flex items-center gap-1">
                        <Input type="time" value={day.end} className="w-28 text-sm"
                          onChange={e => setSchedule(prev => prev.map((d, i) => i === idx ? { ...d, end: e.target.value } : d))} />
                      </div>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Fechado</span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <div className="flex items-start gap-3 rounded-lg bg-primary/10 border border-primary/20 p-4">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-primary">Como funciona</p>
              <p className="text-sm text-muted-foreground">
                Quando uma mensagem chegar fora do horário configurado, a mensagem automática será enviada. Isso funciona para todas as conversas, mesmo aquelas já em atendimento.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button className="gap-2" onClick={() => toast.success("Configurações salvas!")}>
              <Save className="h-4 w-4" /> Salvar Configurações
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Distribuição Tab ───
const DistribuicaoTab = () => {
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState("round_robin");

  const modes = [
    { id: "round_robin", label: "Round Robin", description: "Distribui de forma rotativa entre os atendentes disponíveis", icon: Shuffle },
    { id: "least_busy", label: "Menos Ocupado", description: "Prioriza atendentes com menos conversas ativas", icon: UserPlus },
    { id: "department", label: "Por Departamento", description: "Distribui para atendentes do departamento da conversa", icon: Building },
  ];

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Users2 className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="font-semibold text-foreground">Distribuição Automática</p>
              <p className="text-sm text-muted-foreground">Atribui conversas automaticamente aos atendentes disponíveis</p>
            </div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </Card>

      {enabled && (
        <>
          <Card className="p-4 space-y-2">
            <div>
              <p className="font-semibold text-foreground">Modo de Distribuição</p>
              <p className="text-sm text-muted-foreground">Escolha como as conversas serão distribuídas</p>
            </div>
            {modes.map(m => (
              <button key={m.id} onClick={() => setMode(m.id)}
                className={cn("w-full flex items-center gap-4 p-4 rounded-lg border transition-colors text-left",
                  mode === m.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"
                )}>
                <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center",
                  mode === m.id ? "bg-primary/20" : "bg-muted"
                )}>
                  <m.icon className={cn("h-5 w-5", mode === m.id ? "text-primary" : "text-muted-foreground")} />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">{m.label}</p>
                  <p className="text-sm text-muted-foreground">{m.description}</p>
                </div>
                <div className={cn("h-5 w-5 rounded-full border-2",
                  mode === m.id ? "border-primary bg-primary" : "border-muted-foreground"
                )}>
                  {mode === m.id && <div className="h-full w-full flex items-center justify-center"><div className="h-2 w-2 rounded-full bg-primary-foreground" /></div>}
                </div>
              </button>
            ))}
          </Card>

          <div className="flex items-start gap-3 rounded-lg bg-primary/10 border border-primary/20 p-4">
            <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-primary">Como funciona</p>
              <p className="text-sm text-muted-foreground">
                Quando uma nova conversa chega e não é tratada pelo Flow Builder, o sistema automaticamente atribui para um atendente online que tenha capacidade disponível.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button className="gap-2" onClick={() => toast.success("Configurações salvas!")}>
              <Save className="h-4 w-4" /> Salvar Configurações
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Main Component ───
const Settings = () => {
  const [activeTab, setActiveTab] = useState("geral");

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-blue-600">Configurações</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50 mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger value="geral" className="gap-1.5"><SettingsIcon className="h-3.5 w-3.5" /> Geral</TabsTrigger>
            <TabsTrigger value="tags" className="gap-1.5"><Tag className="h-3.5 w-3.5" /> Tags</TabsTrigger>
            
            <TabsTrigger value="categorias" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Categorias</TabsTrigger>
            <TabsTrigger value="respostas" className="gap-1.5"><Zap className="h-3.5 w-3.5" /> Respostas Rápidas</TabsTrigger>
            <TabsTrigger value="horarios" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Horários</TabsTrigger>
            <TabsTrigger value="distribuicao" className="gap-1.5"><Users2 className="h-3.5 w-3.5" /> Distribuição</TabsTrigger>
          </TabsList>

          <TabsContent value="geral"><GeralTab /></TabsContent>
          <TabsContent value="tags"><TagsTab /></TabsContent>
          
          <TabsContent value="categorias"><CategoriasTab /></TabsContent>
          <TabsContent value="respostas"><RespostasRapidasTab /></TabsContent>
          <TabsContent value="horarios"><HorariosTab /></TabsContent>
          <TabsContent value="distribuicao"><DistribuicaoTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
