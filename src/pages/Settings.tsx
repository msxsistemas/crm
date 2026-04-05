import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import {
  Settings as SettingsIcon, User, Lock, Eye, EyeOff, Save, Tag, Search, Plus,
  Building2, Zap, CheckCircle, Clock, Users2, X, Info, Pencil,
  Shuffle, UserPlus, Building, Camera, Loader2, Globe, Play, XCircle, RefreshCw, Trash2,
  Key, Copy, ChevronDown, ChevronUp, ShieldAlert, ShieldCheck, Monitor, TrendingUp, Star, Cake
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2 as TabLoader } from "lucide-react";

// Heavy tabs are lazy-loaded for better bundle splitting
const WebhooksTabLazy = lazy(() => import('./settings/WebhooksTab'));
const ApiTokensTabLazy = lazy(() => import('./settings/ApiTokensTab'));
const LeadScoringTabLazy = lazy(() => import('./settings/LeadScoringTab'));

const TabFallback = () => (
  <div className="flex items-center justify-center py-12">
    <TabLoader className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

// ─── Color palette for tags/categories ───
const colorPalette = [
  "bg-white", "bg-red-500", "bg-orange-500", "bg-amber-400", "bg-yellow-300",
  "bg-lime-400", "bg-green-500", "bg-emerald-500", "bg-teal-500", "bg-cyan-400",
  "bg-sky-500", "bg-blue-500", "bg-indigo-500", "bg-violet-500", "bg-purple-500",
  "bg-fuchsia-500", "bg-pink-500", "bg-rose-500", "bg-gray-400", "bg-indigo-900",
  "bg-purple-300", "bg-slate-400", "bg-blue-800", "bg-sky-300", "bg-amber-700",
  "bg-gray-600",
];

// ─── Two-Factor Section ───
const TwoFactorSection = ({ userId }: { userId: string | null }) => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    api.get<any>('/auth/me').then(data => {
      setEnabled(data?.two_factor_enabled ?? false);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  const handleToggle = async (val: boolean) => {
    if (val) {
      // Show confirmation dialog before enabling
      setConfirmOpen(true);
    } else {
      await saveEnabled(false);
    }
  };

  const saveEnabled = async (val: boolean) => {
    if (!userId) return;
    setSaving(true);
    try {
      await api.patch('/auth/me', { two_factor_enabled: val });
      setEnabled(val);
      toast.success(val ? "2FA ativado com sucesso!" : "2FA desativado");
    } catch {
      toast.error("Erro ao salvar configuração de 2FA");
    }
    setSaving(false);
  };

  const confirmEnable = async () => {
    setConfirmOpen(false);
    await saveEnabled(true);
  };

  // Active session info (current)
  const sessionInfo = {
    browser: navigator.userAgent.includes("Chrome")
      ? "Chrome"
      : navigator.userAgent.includes("Firefox")
      ? "Firefox"
      : navigator.userAgent.includes("Safari")
      ? "Safari"
      : "Navegador",
    os: navigator.platform || "Desconhecido",
    lastAccess: new Date().toLocaleString("pt-BR"),
  };

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Autenticação em Dois Fatores</h3>
            <p className="text-sm text-muted-foreground">Proteja sua conta com verificação por e-mail</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
              <div className="flex items-center gap-3">
                {enabled ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700 border border-green-200">
                    <CheckCircle className="h-3.5 w-3.5" /> 2FA ativo
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">2FA desativado</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {enabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => handleToggle(false)}
                    disabled={saving}
                  >
                    Desativar
                  </Button>
                )}
                {!enabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => handleToggle(true)}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                    Ativar 2FA por e-mail
                  </Button>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-muted/30 border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Como funciona</p>
              <ol className="space-y-2 text-sm text-foreground">
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                  Você faz login com e-mail e senha normalmente
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                  Um código de 6 dígitos é enviado para seu e-mail
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">3</span>
                  Você insere o código para concluir o acesso
                </li>
              </ol>
            </div>
          </div>
        )}
      </Card>

      {/* Active Sessions */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Monitor className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Sessões Ativas</h3>
            <p className="text-sm text-muted-foreground">Dispositivos com acesso à sua conta</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-green-50 border-green-200">
          <div className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{sessionInfo.browser} — Sessão atual</p>
            <p className="text-xs text-muted-foreground">{sessionInfo.os}</p>
          </div>
          <p className="text-xs text-muted-foreground shrink-0">{sessionInfo.lastAccess}</p>
        </div>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Ativar Autenticação em Dois Fatores
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-foreground">
              Ao ativar o 2FA, você precisará inserir um código enviado para seu e-mail toda vez que fizer login.
            </p>
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
              <p className="text-sm text-amber-800 font-medium">Importante</p>
              <p className="text-sm text-amber-700 mt-1">
                Certifique-se de ter acesso ao seu e-mail cadastrado antes de ativar. Se perder acesso ao e-mail, não conseguirá fazer login.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancelar</Button>
            <Button onClick={confirmEnable}>Confirmar e Ativar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// ─── Geral Tab ───
const GeralTab = () => {
  const { user, signOut } = useAuth();
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      api.get<any>('/auth/me').then(data => {
        if (data?.name || data?.full_name) setFullName(data.name || data.full_name);
        if (data?.avatar_url) setAvatarUrl(data.avatar_url);
      }).catch(() => {});
    }
  }, [user]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 2 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 2MB"); return; }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const data = await api.upload<{ avatar_url: string }>('/auth/me/avatar', formData);
      setAvatarUrl(data.avatar_url);
      toast.success("Foto atualizada!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar foto");
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await api.patch('/auth/me', { name: fullName });
      toast.success("Perfil atualizado!");
    } catch {
      toast.error("Erro ao salvar perfil");
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPwd.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    if (newPwd !== confirmPwd) { toast.error("Senhas não conferem"); return; }
    if (!currentPwd) { toast.error("Informe a senha atual"); return; }

    try {
      await api.post('/auth/change-password', { currentPassword: currentPwd, newPassword: newPwd });
      toast.success("Senha alterada!");
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
    } catch (err: any) {
      toast.error(err?.data?.error || err.message || "Erro ao alterar senha");
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
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <button
              className="relative h-24 w-24 rounded-xl overflow-hidden group focus:outline-none"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-primary flex items-center justify-center text-3xl font-bold text-primary-foreground">
                  {initial}
                </div>
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploadingAvatar
                  ? <Loader2 className="h-6 w-6 text-white animate-spin" />
                  : <Camera className="h-6 w-6 text-white" />
                }
              </div>
            </button>
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

      {/* Two-Factor Authentication */}
      <TwoFactorSection userId={user?.id ?? null} />
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
    try {
      const data = await api.get<any[]>('/tags');
      setTags(data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchTags(); }, [fetchTags]);

  const openCreate = () => { setEditingTag(null); setTagName(""); setTagColor("bg-primary"); setDialogOpen(true); };
  const openEdit = (tag: { id: string; name: string; color: string }) => { setEditingTag(tag); setTagName(tag.name); setTagColor(tag.color); setDialogOpen(true); };

  const handleSave = async () => {
    if (!tagName.trim()) return;
    try {
      if (editingTag) {
        await api.patch(`/tags/${editingTag.id}`, { name: tagName.trim(), color: tagColor });
        toast.success("Tag atualizada!");
      } else {
        await api.post('/tags', { name: tagName.trim(), color: tagColor });
        toast.success("Tag criada!");
      }
      setDialogOpen(false);
      fetchTags();
    } catch { toast.error(editingTag ? "Erro ao atualizar tag" : "Erro ao criar tag"); }
  };

  const handleDeleteTag = async (id: string) => {
    try {
      await api.delete(`/tags/${id}`);
      toast.success("Tag excluída!");
      fetchTags();
    } catch { toast.error("Erro ao excluir"); }
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
    try {
      const data = await api.get<any[]>('/categories');
      setCategories(data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchCats(); }, [fetchCats]);

  const openCreate = () => { setEditingCat(null); setCatName(""); setCatDesc(""); setCatColor("bg-purple-500"); setDialogOpen(true); };
  const openEdit = (cat: { id: string; name: string; description: string | null; color: string }) => {
    setEditingCat(cat); setCatName(cat.name); setCatDesc(cat.description || ""); setCatColor(cat.color); setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!catName.trim()) return;
    try {
      if (editingCat) {
        await api.patch(`/categories/${editingCat.id}`, { name: catName.trim(), color: catColor });
        toast.success("Categoria atualizada!");
      } else {
        await api.post('/categories', { name: catName.trim(), color: catColor });
        toast.success("Categoria criada!");
      }
      setDialogOpen(false);
      fetchCats();
    } catch { toast.error(editingCat ? "Erro ao atualizar categoria" : "Erro ao criar categoria"); }
  };

  const handleDeleteCat = async (id: string) => {
    try {
      await api.delete(`/categories/${id}`);
      toast.success("Categoria excluída!");
      fetchCats();
    } catch { toast.error("Erro ao excluir"); }
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
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [shortcut, setShortcut] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [replies, setReplies] = useState<{ id: string; shortcut: string; message: string }[]>([]);
  const [saving, setSaving] = useState(false);

  const loadReplies = useCallback(async () => {
    try {
      const data = await api.get<any[]>('/quick-replies');
      setReplies(data || []);
    } catch {}
  }, []);

  useEffect(() => { loadReplies(); }, [loadReplies]);

  const handleSave = async () => {
    if (!shortcut.trim() || !message.trim()) { toast.error("Preencha atalho e mensagem"); return; }
    setSaving(true);
    try {
      await api.post('/quick-replies', { shortcut: shortcut.trim().replace(/\//g, ""), message: message.trim(), title: title.trim() });
      toast.success("Resposta criada!");
      setNewOpen(false);
      setShortcut(""); setTitle(""); setMessage("");
      loadReplies();
    } catch { toast.error("Erro ao salvar resposta"); }
    setSaving(false);
  };

  const filtered = replies.filter(r => r.shortcut.toLowerCase().includes(search.toLowerCase()) || r.message.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Zap className="h-5 w-5 text-amber-500" /></div>
          <div><p className="text-2xl font-bold text-foreground">{replies.length}</p><p className="text-xs text-muted-foreground">Respostas rápidas</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><CheckCircle className="h-5 w-5 text-emerald-500" /></div>
          <div><p className="text-2xl font-bold text-foreground">{replies.length}</p><p className="text-xs text-muted-foreground">Ativas</p></div>
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
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-foreground">Nenhuma resposta rápida</p>
            <p className="text-sm text-muted-foreground">Crie respostas para agilizar seus atendimentos</p>
            <p className="text-xs text-muted-foreground mt-1">Use /atalho no chat para inserir rapidamente</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                <Badge variant="secondary" className="text-xs font-mono shrink-0">/{r.shortcut}</Badge>
                <p className="text-sm text-foreground truncate flex-1">{r.message}</p>
              </div>
            ))}
          </div>
        )}
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
            <Button className="flex-1" onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Horários Tab ───
const DEFAULT_DAYS = [
  { name: "Segunda-feira", active: true, start: "08:00", end: "18:00" },
  { name: "Terça-feira", active: true, start: "08:00", end: "18:00" },
  { name: "Quarta-feira", active: true, start: "08:00", end: "18:00" },
  { name: "Quinta-feira", active: true, start: "08:00", end: "18:00" },
  { name: "Sexta-feira", active: true, start: "08:00", end: "18:00" },
  { name: "Sábado", active: false, start: "", end: "" },
  { name: "Domingo", active: false, start: "", end: "" },
];

const HorariosTab = () => {
  const [enabled, setEnabled] = useState(true);
  const [offMessage, setOffMessage] = useState("No momento estamos fora do horário de atendimento. Retornaremos em breve!");
  const [csatEnabled, setCsatEnabled] = useState(false);
  const [schedule, setSchedule] = useState(DEFAULT_DAYS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<any>('/settings').then(data => {
      if (data.office_hours_enabled !== undefined) setEnabled(data.office_hours_enabled);
      if (data.office_hours_off_message) setOffMessage(data.office_hours_off_message);
      if (data.office_hours_schedule?.length) setSchedule(data.office_hours_schedule);
      if (data.auto_csat_enabled !== undefined) setCsatEnabled(data.auto_csat_enabled);
    }).catch(() => {});
  }, []);

  const handleCsatToggle = async (val: boolean) => {
    setCsatEnabled(val);
    try {
      await api.patch('/settings', { auto_csat_enabled: val });
      toast.success(val ? "Pesquisa de satisfação automática ativada" : "Pesquisa de satisfação automática desativada");
    } catch {
      toast.error("Erro ao salvar configuração");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/settings', {
        office_hours_enabled: enabled,
        office_hours_off_message: offMessage,
        office_hours_schedule: schedule,
        auto_csat_enabled: csatEnabled,
      });
      toast.success("Configurações salvas!");
    } catch {
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

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

      {/* CSAT Survey Toggle */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Pesquisa de Satisfação Automática</p>
              <p className="text-sm text-muted-foreground">Enviar pesquisa de satisfação automaticamente ao encerrar conversa</p>
            </div>
          </div>
          <Switch checked={csatEnabled} onCheckedChange={handleCsatToggle} />
        </div>
        {csatEnabled && (
          <div className="mt-3 rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Mensagem enviada ao encerrar:</p>
            <p className="whitespace-pre-line">{`Olá [nome]! 😊 Como você avalia o atendimento que recebeu hoje?\n\n1️⃣ - Péssimo\n2️⃣ - Ruim\n3️⃣ - Regular\n4️⃣ - Bom\n5️⃣ - Excelente\n\nResponda com o número correspondente.`}</p>
          </div>
        )}
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
            <Button className="gap-2" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Configurações
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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<any>('/auto-distribution-config').then(data => {
      if (data.is_active !== undefined) setEnabled(data.is_active);
      if (data.mode) setMode(data.mode);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/auto-distribution-config', { is_active: enabled, mode });
      toast.success("Configurações salvas!");
    } catch {
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

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
            <Button className="gap-2" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Configurações
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Webhooks Tab ───
const WEBHOOK_EVENTS = [
  { value: "conversation.created", label: "Nova conversa iniciada" },
  { value: "conversation.closed", label: "Conversa encerrada" },
  { value: "message.received", label: "Mensagem recebida do cliente" },
  { value: "message.sent", label: "Mensagem enviada pelo atendente" },
  { value: "contact.created", label: "Novo contato criado" },
  { value: "task.created", label: "Nova tarefa criada" },
  { value: "campaign.sent", label: "Campanha enviada" },
];

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  active: boolean;
  secret: string | null;
  last_triggered_at: string | null;
  failure_count: number;
}

const WebhooksTab = () => {
  const { user } = useAuth();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [formActive, setFormActive] = useState(true);

  const fetchWebhooks = useCallback(async () => {
    try {
      const data = await api.get<Webhook[]>('/webhooks');
      setWebhooks(data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  const openCreate = () => {
    setEditingWebhook(null);
    setFormName(""); setFormUrl(""); setFormSecret(""); setFormEvents([]); setFormActive(true);
    setDialogOpen(true);
  };

  const openEdit = (wh: Webhook) => {
    setEditingWebhook(wh);
    setFormName(wh.name); setFormUrl(wh.url); setFormSecret(wh.secret || ""); setFormEvents(wh.events); setFormActive(wh.active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formUrl.trim()) { toast.error("Preencha nome e URL"); return; }
    if (!formUrl.startsWith("https://")) { toast.error("A URL deve começar com https://"); return; }
    if (formEvents.length === 0) { toast.error("Selecione pelo menos um evento"); return; }
    setSaving(true);
    const payload = {
      name: formName.trim(),
      url: formUrl.trim(),
      events: formEvents,
      active: formActive,
      secret: formSecret.trim() || null,
    };
    try {
      if (editingWebhook) {
        await api.patch(`/webhooks/${editingWebhook.id}`, payload);
        toast.success("Webhook atualizado!");
      } else {
        await api.post('/webhooks', payload);
        toast.success("Webhook criado!");
      }
      setDialogOpen(false);
      fetchWebhooks();
    } catch { toast.error(editingWebhook ? "Erro ao atualizar webhook" : "Erro ao criar webhook"); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/webhooks/${id}`);
      toast.success("Webhook excluído!");
      fetchWebhooks();
    } catch { toast.error("Erro ao excluir webhook"); }
  };

  const handleToggleActive = async (wh: Webhook) => {
    try {
      await api.patch(`/webhooks/${wh.id}`, { active: !wh.active });
      setWebhooks(prev => prev.map(w => w.id === wh.id ? { ...w, active: !w.active } : w));
    } catch { toast.error("Erro ao atualizar"); }
  };

  const handleTest = async (wh: Webhook) => {
    setTestingId(wh.id);
    const testPayload = { event: "test", timestamp: new Date().toISOString(), data: { message: "Teste do CRM MSX" } };
    try {
      const res = await fetch(wh.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
      });
      if (res.ok) {
        toast.success(`Teste enviado com sucesso! Status: ${res.status}`);
      } else {
        toast.error(`Erro no teste: HTTP ${res.status}`);
      }
    } catch (err: any) {
      toast.error(`Falha ao enviar teste: ${err.message || "Erro de rede"}`);
    }
    setTestingId(null);
  };

  const toggleEvent = (event: string) => {
    setFormEvents(prev => prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Globe className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Webhooks</h3>
            <p className="text-sm text-muted-foreground">{webhooks.length} webhook(s) configurado(s)</p>
          </div>
        </div>
        <Button variant="action" className="gap-2 px-5" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo Webhook
        </Button>
      </div>

      {/* Info Banner */}
      <div className="flex items-start gap-3 rounded-lg bg-primary/10 border border-primary/20 p-4">
        <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          Webhooks enviam notificações automáticas para URLs externas quando eventos ocorrem no CRM. Útil para integrar com n8n, Zapier ou sistemas próprios.
        </p>
      </div>

      {/* Webhooks List */}
      <Card className="p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : webhooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Globe className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-foreground">Nenhum webhook configurado</p>
            <p className="text-sm text-muted-foreground">Crie webhooks para integrar o CRM com sistemas externos</p>
          </div>
        ) : (
          <div className="space-y-3">
            {webhooks.map(wh => (
              <div key={wh.id} className="flex items-start gap-3 p-4 rounded-lg border border-border bg-muted/20">
                <div className={cn("mt-1 h-2.5 w-2.5 rounded-full shrink-0", wh.active ? "bg-green-500" : "bg-muted-foreground/40")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-foreground text-sm">{wh.name}</p>
                    {wh.failure_count > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                        {wh.failure_count} falha(s)
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{wh.url}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {wh.events.map(ev => (
                      <Badge key={ev} variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">{ev}</Badge>
                    ))}
                  </div>
                  {wh.last_triggered_at && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Último disparo: {new Date(wh.last_triggered_at).toLocaleString("pt-BR")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch checked={wh.active} onCheckedChange={() => handleToggleActive(wh)} />
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => handleTest(wh)}
                    disabled={testingId === wh.id}
                    title="Testar webhook"
                  >
                    {testingId === wh.id
                      ? <RefreshCw className="h-4 w-4 animate-spin" />
                      : <Play className="h-4 w-4 text-green-500" />
                    }
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(wh)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(wh.id)} title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingWebhook ? "Editar Webhook" : "Novo Webhook"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nome *</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Notificação n8n" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">URL *</label>
              <Input
                type="url"
                value={formUrl}
                onChange={e => setFormUrl(e.target.value)}
                placeholder="https://seu-sistema.com/webhook"
              />
              {formUrl && !formUrl.startsWith("https://") && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> A URL deve começar com https://
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Segredo (opcional)</label>
              <Input
                value={formSecret}
                onChange={e => setFormSecret(e.target.value)}
                placeholder="Para verificação HMAC de assinatura"
              />
              <p className="text-xs text-muted-foreground mt-1">Usado para validar a autenticidade do webhook</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Eventos *</label>
              <div className="grid grid-cols-1 gap-2">
                {WEBHOOK_EVENTS.map(ev => (
                  <label key={ev.value} className="flex items-center gap-2.5 cursor-pointer group">
                    <Checkbox
                      checked={formEvents.includes(ev.value)}
                      onCheckedChange={() => toggleEvent(ev.value)}
                    />
                    <div>
                      <span className="text-sm font-mono text-foreground">{ev.value}</span>
                      <span className="text-xs text-muted-foreground ml-2">— {ev.label}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-foreground">Ativo</p>
                <p className="text-xs text-muted-foreground">Webhook receberá eventos imediatamente</p>
              </div>
              <Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editingWebhook ? "Atualizar" : "Criar Webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── API Tokens Tab ───
interface ApiToken {
  id: string;
  name: string;
  token: string;
  last_used_at: string | null;
  expires_at: string | null;
  scopes: string[];
  is_active: boolean;
  created_at: string;
}

const SCOPE_OPTIONS = [
  { value: "read", label: "Leitura (read)" },
  { value: "write", label: "Escrita (write)" },
  { value: "contacts", label: "Contatos (contacts)" },
  { value: "campaigns", label: "Campanhas (campaigns)" },
];

const EXPIRATION_OPTIONS = [
  { value: "never", label: "Nunca" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "1 ano" },
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

const ApiTokensTab = () => {
  const { user } = useAuth();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [copied, setCopied] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formScopes, setFormScopes] = useState<string[]>(["read", "write"]);
  const [formExpiration, setFormExpiration] = useState("never");

  const fetchTokens = useCallback(async () => {
    try {
      const data = await api.get<ApiToken[]>('/api-tokens');
      setTokens(data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchTokens(); }, [fetchTokens]);

  const openCreate = () => {
    setFormName("");
    setFormScopes(["read", "write"]);
    setFormExpiration("never");
    setDialogOpen(true);
  };

  const toggleScope = (scope: string) => {
    setFormScopes(prev =>
      prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]
    );
  };

  const handleCreate = async () => {
    if (!formName.trim()) { toast.error("Informe um nome para o token"); return; }
    if (formScopes.length === 0) { toast.error("Selecione pelo menos um escopo"); return; }
    setSaving(true);
    try {
      let expiresAt: string | null = null;
      if (formExpiration !== "never") {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(formExpiration));
        expiresAt = d.toISOString();
      }
      const created = await api.post<any>('/api-tokens', {
        name: formName.trim(),
        scopes: formScopes,
        expires_at: expiresAt,
      });
      setDialogOpen(false);
      setCreatedToken(created.token);
      fetchTokens();
    } catch { toast.error("Erro ao criar token"); }
    setSaving(false);
  };

  const handleRevoke = async (id: string) => {
    try {
      await api.patch(`/api-tokens/${id}`, { is_active: false });
      toast.success("Token revogado!");
      setRevokeConfirmId(null);
      fetchTokens();
    } catch { toast.error("Erro ao revogar token"); }
  };

  const copyToken = async (token: string) => {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success("Token copiado!");
  };

  const exampleToken = "msx_...";

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Key className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Tokens de API</h3>
              <p className="text-sm text-muted-foreground">
                Use tokens para autenticar integrações externas via API REST
              </p>
            </div>
          </div>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Gerar Novo Token
          </Button>
        </div>
      </Card>

      {/* Tokens table */}
      <Card className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Key className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-foreground">Nenhum token criado</p>
            <p className="text-sm text-muted-foreground">Gere um token para integrar com APIs externas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Nome</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Escopos</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Criado em</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Última utilização</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Expira em</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="py-2 px-3" />
                </tr>
              </thead>
              <tbody>
                {tokens.map(t => {
                  const expired = isExpired(t.expires_at);
                  const active = t.is_active && !expired;
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-3 font-medium text-foreground">{t.name}</td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {t.scopes.map(s => (
                            <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-muted-foreground">{formatDate(t.created_at)}</td>
                      <td className="py-3 px-3 text-muted-foreground">{formatDate(t.last_used_at)}</td>
                      <td className="py-3 px-3 text-muted-foreground">
                        {t.expires_at ? (
                          expired
                            ? <span className="text-destructive font-medium">{formatDate(t.expires_at)}</span>
                            : formatDate(t.expires_at)
                        ) : "Nunca"}
                      </td>
                      <td className="py-3 px-3">
                        {!t.is_active ? (
                          <Badge variant="destructive" className="text-xs">Revogado</Badge>
                        ) : expired ? (
                          <Badge className="text-xs bg-red-100 text-red-700 border-red-200">Expirado</Badge>
                        ) : (
                          <Badge className="text-xs bg-emerald-100 text-emerald-700 border-emerald-200">Ativo</Badge>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {active && (
                          revokeConfirmId === t.id ? (
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="destructive" className="h-7 text-xs px-2" onClick={() => handleRevoke(t.id)}>
                                Confirmar
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setRevokeConfirmId(null)}>
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30" onClick={() => setRevokeConfirmId(t.id)}>
                              <XCircle className="h-3.5 w-3.5" /> Revogar
                            </Button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Usage example (collapsible) */}
      <Card className="p-4">
        <button
          className="flex items-center justify-between w-full"
          onClick={() => setShowUsage(v => !v)}
        >
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <span className="font-medium text-foreground text-sm">Exemplo de uso</span>
          </div>
          {showUsage ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {showUsage && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-muted-foreground">Envie o token no cabeçalho <code className="bg-muted px-1 rounded text-xs">Authorization</code> das suas requisições:</p>
            <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto text-foreground whitespace-pre-wrap">
{`curl -H "Authorization: Bearer ${exampleToken}" \\
  https://seu-dominio.com/api/contacts`}
            </pre>
          </div>
        )}
      </Card>

      {/* Create token dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar Novo Token de API</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground">Nome</label>
              <Input
                placeholder="Ex: Integração Zapier"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Escopos</label>
              <div className="grid grid-cols-2 gap-2">
                {SCOPE_OPTIONS.map(scope => (
                  <label key={scope.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formScopes.includes(scope.value)}
                      onCheckedChange={() => toggleScope(scope.value)}
                    />
                    <span className="text-sm text-foreground">{scope.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Expiração</label>
              <Select value={formExpiration} onValueChange={setFormExpiration}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRATION_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleCreate} disabled={saving}>
              {saving ? "Gerando..." : "Gerar Token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Show token once dialog */}
      <Dialog open={!!createdToken} onOpenChange={() => setCreatedToken(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Token Gerado com Sucesso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 font-medium">
                Salve este token agora, ele não será exibido novamente
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Seu token</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs font-mono text-foreground break-all">
                  {createdToken}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => createdToken && copyToken(createdToken)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copiado!" : "Copiar"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={() => setCreatedToken(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Lead Scoring Rules Tab ───
interface ScoringRule {
  id: string;
  name: string;
  condition_field: string;
  condition_operator?: string;
  condition_value: string | null;
  score_delta: number;
  is_active: boolean;
  created_at: string;
}

const CONDITION_TYPE_LABELS: Record<string, string> = {
  has_tag: 'Tem tag',
  campaign_opened: 'Respondeu campanha',
  has_conversation: 'Tem conversa',
  inactivity_days: 'Inativo há X dias',
  has_opportunity: 'Tem oportunidade',
  opportunity_stage: 'Etapa da oportunidade',
  message_count: 'Número de mensagens',
  custom_field: 'Campo customizado',
};

const LeadScoringTab = () => {
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<ScoringRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formCondType, setFormCondType] = useState('has_conversation');
  const [formCondValue, setFormCondValue] = useState('');
  const [formPoints, setFormPoints] = useState(10);
  const [formActive, setFormActive] = useState(true);

  const fetchRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const data = await api.get<ScoringRule[]>('/lead-scoring-rules');
      setRules(data || []);
    } catch {}
    setLoadingRules(false);
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const openCreate = () => {
    setEditingRule(null);
    setFormName('');
    setFormCondType('has_conversation');
    setFormCondValue('');
    setFormPoints(10);
    setFormActive(true);
    setDialogOpen(true);
  };

  const openEdit = (rule: ScoringRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormCondType(rule.condition_field);
    setFormCondValue(rule.condition_value || '');
    setFormPoints(rule.score_delta);
    setFormActive(rule.is_active);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error('Nome é obrigatório'); return; }
    setSaving(true);
    const payload = {
      name: formName.trim(),
      condition_field: formCondType,
      condition_value: formCondValue.trim() || null,
      score_delta: formPoints,
      is_active: formActive,
    };
    try {
      if (editingRule) {
        await api.patch(`/lead-scoring-rules/${editingRule.id}`, payload);
        toast.success('Regra atualizada!');
      } else {
        await api.post('/lead-scoring-rules', payload);
        toast.success('Regra criada!');
      }
      setDialogOpen(false);
      fetchRules();
    } catch { toast.error(editingRule ? 'Erro ao salvar regra' : 'Erro ao criar regra'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/lead-scoring-rules/${id}`);
      toast.success('Regra excluída!');
      setDeleteConfirmId(null);
      fetchRules();
    } catch { toast.error('Erro ao excluir regra'); }
  };

  const handleToggleActive = async (rule: ScoringRule) => {
    try {
      await api.patch(`/lead-scoring-rules/${rule.id}`, { is_active: !rule.is_active });
      fetchRules();
    } catch {}
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Star className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Regras de Lead Scoring</h3>
              <p className="text-sm text-muted-foreground">Configure os critérios para calcular o score dos contatos (0-100)</p>
            </div>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nova Regra
          </Button>
        </div>

        {loadingRules ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando regras...
          </div>
        ) : rules.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma regra configurada</p>
            <p className="text-xs mt-1">Crie regras para calcular automaticamente o engajamento dos seus contatos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Nome</th>
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Condição</th>
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Valor</th>
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Pontos</th>
                  <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-right py-2 px-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-2.5 px-3 font-medium text-foreground">{rule.name}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{CONDITION_TYPE_LABELS[rule.condition_field] || rule.condition_field}</td>
                    <td className="py-2.5 px-3 text-muted-foreground">{rule.condition_value || '—'}</td>
                    <td className="py-2.5 px-3">
                      <span className={`font-bold ${rule.score_delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {rule.score_delta >= 0 ? '+' : ''}{rule.score_delta}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <button onClick={() => handleToggleActive(rule)}>
                        {rule.is_active
                          ? <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700"><CheckCircle className="h-3 w-3" /> Ativo</span>
                          : <span className="text-xs text-muted-foreground">Inativo</span>
                        }
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(rule)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={() => setDeleteConfirmId(rule.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Editar Regra' : 'Nova Regra de Scoring'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Nome da regra</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Tem conversa ativa" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Tipo de condição</label>
              <Select value={formCondType} onValueChange={setFormCondType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CONDITION_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Valor da condição <span className="text-muted-foreground text-xs">(opcional)</span></label>
              <Input value={formCondValue} onChange={e => setFormCondValue(e.target.value)} placeholder="Ex: open, 30, negotiation..." />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Pontos (pode ser negativo)</label>
              <Input
                type="number"
                value={formPoints}
                onChange={e => setFormPoints(parseInt(e.target.value) || 0)}
                min={-100}
                max={100}
              />
              <p className="text-xs text-muted-foreground mt-1">Use valores negativos para penalizar (ex: -15 para inatividade)</p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={formActive} onCheckedChange={setFormActive} />
              <span className="text-sm text-foreground">Regra ativa</span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingRule ? 'Salvar alterações' : 'Criar regra'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Excluir regra</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Tem certeza que deseja excluir esta regra? Esta ação não pode ser desfeita.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Preset colors for conversation labels ───
const labelColorPresets = [
  '#3b82f6', '#22c55e', '#ef4444', '#f59e0b', '#dc2626', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16', '#6366f1',
];

interface ConversationLabel {
  id: string;
  name: string;
  color: string;
}

// ─── Etiquetas Tab ───
const EtiquetasTab = () => {
  const [labels, setLabels] = useState<ConversationLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<ConversationLabel | null>(null);
  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState(labelColorPresets[0]);
  const [search, setSearch] = useState("");

  const fetchLabels = useCallback(async () => {
    try {
      const data = await api.get<ConversationLabel[]>('/conversation-labels');
      setLabels(data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchLabels(); }, [fetchLabels]);

  const openCreate = () => {
    setEditingLabel(null);
    setLabelName("");
    setLabelColor(labelColorPresets[0]);
    setDialogOpen(true);
  };

  const openEdit = (label: ConversationLabel) => {
    setEditingLabel(label);
    setLabelName(label.name);
    setLabelColor(label.color);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!labelName.trim()) return;
    try {
      if (editingLabel) {
        await api.patch(`/conversation-labels/${editingLabel.id}`, { name: labelName.trim(), color: labelColor });
        toast.success("Etiqueta atualizada!");
      } else {
        await api.post('/conversation-labels', { name: labelName.trim(), color: labelColor });
        toast.success("Etiqueta criada!");
      }
      setDialogOpen(false);
      fetchLabels();
    } catch { toast.error(editingLabel ? "Erro ao atualizar etiqueta" : "Erro ao criar etiqueta"); }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/conversation-labels/${id}`);
      toast.success("Etiqueta excluída!");
      fetchLabels();
    } catch { toast.error("Erro ao excluir etiqueta"); }
  };

  const filtered = labels.filter(l => l.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar etiquetas..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Button variant="action" className="gap-2 px-5" onClick={openCreate}><Plus className="h-4 w-4" /> Nova Etiqueta</Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-12"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Tag className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-foreground">Nenhuma etiqueta criada</p>
            <p className="text-sm text-muted-foreground">Crie etiquetas coloridas para classificar conversas</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {filtered.map(label => (
              <div
                key={label.id}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold text-white"
                style={{ backgroundColor: label.color }}
              >
                {label.name}
                <button onClick={() => openEdit(label)} className="ml-0.5 opacity-80 hover:opacity-100"><Pencil className="h-3 w-3" /></button>
                <button onClick={() => handleDelete(label.id)} className="opacity-80 hover:opacity-100"><X className="h-3 w-3" /></button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingLabel ? "Editar Etiqueta" : "Nova Etiqueta"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nome</label>
              <Input value={labelName} onChange={e => setLabelName(e.target.value)} placeholder="Ex: Suporte, Venda..." className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Cor</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {labelColorPresets.map(c => (
                  <button
                    key={c}
                    onClick={() => setLabelColor(c)}
                    className={cn("h-8 w-8 rounded-full transition-all border-2", labelColor === c ? "border-foreground scale-110" : "border-transparent")}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground mb-2">Preview</p>
              <span
                className="inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold text-white"
                style={{ backgroundColor: labelColor }}
              >
                {labelName || "Nome da etiqueta"}
              </span>
            </Card>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button className="flex-1" onClick={handleSave} disabled={!labelName.trim()}>{editingLabel ? "Atualizar" : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Birthday Auto Tab ───
const BirthdayAutoTab = () => {
  const [enabled, setEnabled] = useState(false);
  const [template, setTemplate] = useState("🎂 Feliz aniversário, {{nome}}! Que seu dia seja especial! Da equipe MSX CRM");
  const [sendTime, setSendTime] = useState("09:00");
  const [selectedConn, setSelectedConn] = useState("");
  const [connections, setConnections] = useState<{ id: string; instance_name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Load from localStorage
    try {
      const saved = localStorage.getItem('birthday_auto_config');
      if (saved) {
        const cfg = JSON.parse(saved);
        setEnabled(cfg.enabled ?? false);
        setTemplate(cfg.template ?? "🎂 Feliz aniversário, {{nome}}! Que seu dia seja especial! Da equipe MSX CRM");
        setSendTime(cfg.sendTime ?? "09:00");
        setSelectedConn(cfg.selectedConn ?? "");
      }
    } catch { /* ignore */ }

    // Load connections
    api.get<any[]>('/evolution-connections').then(data => {
      setConnections((data || []).map((c: any) => ({ id: c.id, instance_name: c.instance_name })));
    }).catch(() => {});
  }, []);

  const handleSave = () => {
    setSaving(true);
    try {
      localStorage.setItem('birthday_auto_config', JSON.stringify({ enabled, template, sendTime, selectedConn }));
      toast.success("Configurações de aniversário salvas!");
    } catch {
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-1">
          🎂 Aniversários
        </h3>
        <p className="text-sm text-muted-foreground">Configure o envio automático de mensagens de aniversário para seus contatos.</p>
      </div>

      <div className="rounded-xl border bg-card p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Envio automático de mensagem de aniversário</p>
            <p className="text-xs text-muted-foreground mt-0.5">Quando ativado, enviará automaticamente a mensagem abaixo no horário configurado</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            Modelo de mensagem <span className="text-blue-500">(use {'{{nome}}'} para o nome do contato)</span>
          </label>
          <Textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={4}
            className="text-sm resize-none"
            disabled={!enabled}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Enviar às</label>
            <Input
              type="time"
              value={sendTime}
              onChange={(e) => setSendTime(e.target.value)}
              className="h-9 text-sm"
              disabled={!enabled}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Conexão WhatsApp</label>
            <Select value={selectedConn} onValueChange={setSelectedConn} disabled={!enabled}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {connections.map(c => (
                  <SelectItem key={c.id} value={c.instance_name}>{c.instance_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Salvar configurações
          </Button>
        </div>
      </div>
    </div>
  );
};

// ─── Pix Config Tab ───
const PixConfigTab = () => {
  const [pixKey, setPixKey] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pix_config") || "{}").pixKey || ""; } catch { return ""; }
  });
  const [pixKeyType, setPixKeyType] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pix_config") || "{}").pixKeyType || "aleatoria"; } catch { return "aleatoria"; }
  });
  const [merchantName, setMerchantName] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pix_config") || "{}").merchantName || ""; } catch { return ""; }
  });
  const [merchantCity, setMerchantCity] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pix_config") || "{}").merchantCity || ""; } catch { return ""; }
  });

  const handleSave = () => {
    localStorage.setItem("pix_config", JSON.stringify({ pixKey, pixKeyType, merchantName, merchantCity }));
    toast.success("Configurações de cobrança salvas!");
  };

  return (
    <div className="space-y-6 max-w-xl">
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-xl">💸</div>
          <div>
            <p className="font-semibold text-foreground">Configurações de Cobrança</p>
            <p className="text-sm text-muted-foreground">Configure os dados padrão para geração de cobranças Pix</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-foreground">Chave Pix padrão</label>
            <Input placeholder="Sua chave Pix" value={pixKey} onChange={(e) => setPixKey(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Tipo de chave padrão</label>
            <Select value={pixKeyType} onValueChange={setPixKeyType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cpf">CPF</SelectItem>
                <SelectItem value="cnpj">CNPJ</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
                <SelectItem value="telefone">Telefone</SelectItem>
                <SelectItem value="aleatoria">Aleatória</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Nome do recebedor</label>
            <Input placeholder="Nome (até 25 caracteres)" value={merchantName} onChange={(e) => setMerchantName(e.target.value)} maxLength={25} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Cidade</label>
            <Input placeholder="Cidade (até 15 caracteres)" value={merchantCity} onChange={(e) => setMerchantCity(e.target.value)} maxLength={15} />
          </div>
        </div>
        <Button className="gap-2 mt-2" onClick={handleSave}>
          <Save className="h-4 w-4" /> Salvar Configurações
        </Button>
      </Card>
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
            <TabsTrigger value="etiquetas" className="gap-1.5"><Tag className="h-3.5 w-3.5" /> Etiquetas</TabsTrigger>

            <TabsTrigger value="categorias" className="gap-1.5"><Building2 className="h-3.5 w-3.5" /> Categorias</TabsTrigger>
            <TabsTrigger value="respostas" className="gap-1.5"><Zap className="h-3.5 w-3.5" /> Respostas Rápidas</TabsTrigger>
            <TabsTrigger value="horarios" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Horários</TabsTrigger>
            <TabsTrigger value="distribuicao" className="gap-1.5"><Users2 className="h-3.5 w-3.5" /> Distribuição</TabsTrigger>
            <TabsTrigger value="webhooks" className="gap-1.5"><Globe className="h-3.5 w-3.5" /> Webhooks</TabsTrigger>
            <TabsTrigger value="api" className="gap-1.5"><Key className="h-3.5 w-3.5" /> API</TabsTrigger>
            <TabsTrigger value="lead_scoring" className="gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> Lead Scoring</TabsTrigger>
            <TabsTrigger value="aniversarios" className="gap-1.5"><Cake className="h-3.5 w-3.5" /> Aniversários</TabsTrigger>
            <TabsTrigger value="pix" className="gap-1.5"><span className="text-sm">💸</span> Pix / Cobrança</TabsTrigger>
          </TabsList>

          <TabsContent value="geral"><GeralTab /></TabsContent>
          <TabsContent value="tags"><TagsTab /></TabsContent>
          <TabsContent value="etiquetas"><EtiquetasTab /></TabsContent>

          <TabsContent value="categorias"><CategoriasTab /></TabsContent>
          <TabsContent value="respostas"><RespostasRapidasTab /></TabsContent>
          <TabsContent value="horarios"><HorariosTab /></TabsContent>
          <TabsContent value="distribuicao"><DistribuicaoTab /></TabsContent>
          <TabsContent value="webhooks"><Suspense fallback={<TabFallback />}><WebhooksTabLazy /></Suspense></TabsContent>
          <TabsContent value="api"><Suspense fallback={<TabFallback />}><ApiTokensTabLazy /></Suspense></TabsContent>
          <TabsContent value="lead_scoring"><Suspense fallback={<TabFallback />}><LeadScoringTabLazy /></Suspense></TabsContent>
          <TabsContent value="aniversarios"><BirthdayAutoTab /></TabsContent>
          <TabsContent value="pix"><PixConfigTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
