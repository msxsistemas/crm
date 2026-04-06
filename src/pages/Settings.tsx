import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import {
  Settings as SettingsIcon, User, Lock, Eye, EyeOff, Save, Tag, Search, Plus,
  Building2, Zap, CheckCircle, Clock, Users2, X, Info, Pencil,
  Shuffle, UserPlus, Building, Camera, Loader2, Globe, Play, XCircle, RefreshCw, Trash2,
  Key, Copy, ChevronDown, ChevronUp, ShieldAlert, ShieldCheck, Monitor, TrendingUp, Star, Cake, Ban, Bell
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
const ApiKeysTabLazy = lazy(() => import('./settings/ApiKeysTab'));
const EmailNotificationsTabLazy = lazy(() => import('./settings/EmailNotificationsTab'));

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

// ─── Sessions Section ───
function parseUserAgent(ua: string): string {
  if (!ua) return 'Dispositivo desconhecido';
  const browser = ua.includes('Chrome') && !ua.includes('Edg') ? 'Chrome'
    : ua.includes('Firefox') ? 'Firefox'
    : ua.includes('Safari') && !ua.includes('Chrome') ? 'Safari'
    : ua.includes('Edg') ? 'Edge'
    : 'Navegador';
  const os = ua.includes('Windows') ? 'Windows'
    : ua.includes('Mac') ? 'macOS'
    : ua.includes('Linux') ? 'Linux'
    : ua.includes('Android') ? 'Android'
    : ua.includes('iPhone') || ua.includes('iPad') ? 'iOS'
    : 'SO desconhecido';
  return `${browser} — ${os}`;
}

const SessionsSection = () => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [terminating, setTerminating] = useState<string | null>(null);
  const [terminatingAll, setTerminatingAll] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const data = await api.get<any[]>('/auth/sessions');
      setSessions(data || []);
    } catch {}
    setLoadingSessions(false);
  }, []);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleTerminate = async (id: string) => {
    setTerminating(id);
    try {
      await api.delete(`/auth/sessions/${id}`);
      setSessions(prev => prev.map(s => s.id === id ? { ...s, logged_out_at: new Date().toISOString() } : s));
      toast.success('Sessão encerrada');
    } catch { toast.error('Erro ao encerrar sessão'); }
    setTerminating(null);
  };

  const handleTerminateAll = async () => {
    setTerminatingAll(true);
    try {
      await api.delete('/auth/sessions');
      loadSessions();
      toast.success('Todas as outras sessões encerradas');
    } catch { toast.error('Erro ao encerrar sessões'); }
    setTerminatingAll(false);
  };

  const activeSessions = sessions.filter(s => !s.logged_out_at);
  const currentSession = activeSessions[0];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Monitor className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Sessões Ativas</h3>
            <p className="text-sm text-muted-foreground">Gerencie os dispositivos com acesso à sua conta</p>
          </div>
        </div>
        {activeSessions.length > 1 && (
          <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleTerminateAll} disabled={terminatingAll}>
            {terminatingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Encerrar todas as outras
          </Button>
        )}
      </div>
      {loadingSessions ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando sessões...</div>
      ) : sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma sessão registrada.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const isActive = !s.logged_out_at;
            const isCurrent = isActive && s.id === currentSession?.id;
            return (
              <div key={s.id} className={cn("flex items-center gap-3 p-3 rounded-lg border",
                isCurrent ? "border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800" : isActive ? "border-border bg-muted/30" : "border-border bg-muted/10 opacity-60")}>
                <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", isCurrent ? "bg-green-500" : isActive ? "bg-yellow-400" : "bg-muted-foreground/30")} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {parseUserAgent(s.user_agent)}
                    {isCurrent && <span className="ml-2 text-xs text-green-600 font-semibold">Sessão atual</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.ip_address || 'IP desconhecido'} · {new Date(s.created_at).toLocaleString('pt-BR')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground")}>
                    {isActive ? 'Ativa' : 'Encerrada'}
                  </span>
                  {isActive && !isCurrent && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:bg-destructive/10" onClick={() => handleTerminate(s.id)} disabled={terminating === s.id}>
                      {terminating === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Encerrar'}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

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
      <SessionsSection />

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
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState("30");
  const [savingSession, setSavingSession] = useState(false);
  const [signature, setSignature] = useState("");
  const [signatureHtml, setSignatureHtml] = useState("");
  const [signatureEnabled, setSignatureEnabled] = useState(false);
  const signatureEditorRef = useRef<HTMLDivElement>(null);
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
        if (data?.bio !== undefined && data?.bio !== null) setBio(data.bio);
        if (data?.signature) setSignature(data.signature);
        if (data?.signature_html) {
          setSignatureHtml(data.signature_html);
          if (signatureEditorRef.current) {
            signatureEditorRef.current.innerHTML = data.signature_html;
          }
        }
        if (data?.signature_enabled !== undefined && data?.signature_enabled !== null) setSignatureEnabled(!!data.signature_enabled);
      }).catch(() => {});
    }
    api.get<any>('/settings/session').then(d => {
      if (d?.timeout_minutes) setSessionTimeout(String(d.timeout_minutes));
    }).catch(() => {});
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
      const currentHtml = signatureEditorRef.current?.innerHTML || signatureHtml;
      await api.patch('/auth/me', { name: fullName, bio, signature, signature_html: currentHtml, signature_enabled: signatureEnabled });
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
            <div>
              <label className="text-sm font-medium text-foreground">Bio / Apresentação</label>
              <Textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="Escreva uma breve apresentação sobre você..."
                rows={2}
                className="mt-1 text-sm"
                maxLength={300}
              />
              <p className="text-xs text-muted-foreground mt-1">Exibida no seu perfil público ({bio.length}/300)</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Assinatura de texto simples</label>
              <Textarea
                value={signature}
                onChange={e => setSignature(e.target.value)}
                placeholder="Ex: João Silva | Suporte Técnico | (11) 99999-9999"
                rows={2}
                className="mt-1 text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">Adicionada automaticamente ao final das mensagens quando a assinatura está ativa</p>
            </div>
            <div className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-foreground">Assinatura Rica (HTML)</label>
                  <p className="text-xs text-muted-foreground">Formatação com negrito, itálico e variáveis dinâmicas</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Ativa</span>
                  <Switch checked={signatureEnabled} onCheckedChange={setSignatureEnabled} />
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: "N", cmd: "bold", tag: "b" },
                  { label: "I", cmd: "italic", tag: "i" },
                ].map(({ label, cmd }) => (
                  <button
                    key={cmd}
                    type="button"
                    className={cn("px-2 py-0.5 rounded border border-border text-xs font-medium hover:bg-muted", cmd === "bold" ? "font-bold" : "italic")}
                    onMouseDown={e => { e.preventDefault(); document.execCommand(cmd); signatureEditorRef.current?.focus(); }}
                  >
                    {label}
                  </button>
                ))}
                <span className="text-xs text-muted-foreground ml-1 self-center">Inserir:</span>
                {["{{nome}}", "{{cargo}}", "{{empresa}}"].map(v => (
                  <button
                    key={v}
                    type="button"
                    className="px-2 py-0.5 rounded border border-border text-xs text-primary hover:bg-muted"
                    onMouseDown={e => {
                      e.preventDefault();
                      const editor = signatureEditorRef.current;
                      if (!editor) return;
                      editor.focus();
                      const sel = window.getSelection();
                      if (sel && sel.rangeCount > 0) {
                        const range = sel.getRangeAt(0);
                        range.deleteContents();
                        range.insertNode(document.createTextNode(v));
                        range.collapse(false);
                        sel.removeAllRanges();
                        sel.addRange(range);
                      } else {
                        editor.innerHTML += v;
                      }
                      setSignatureHtml(editor.innerHTML);
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div
                ref={signatureEditorRef}
                contentEditable
                suppressContentEditableWarning
                className="min-h-[80px] p-3 border border-border rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary bg-background"
                onInput={e => setSignatureHtml((e.target as HTMLDivElement).innerHTML)}
                data-placeholder="Digite sua assinatura rica aqui..."
                style={{ whiteSpace: "pre-wrap" }}
              />
              {signatureHtml && (
                <div className="border border-border rounded-md p-3 bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Pré-visualização:</p>
                  <div className="text-sm" dangerouslySetInnerHTML={{ __html: signatureHtml }} />
                </div>
              )}
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

      {/* Absence / Vacation Mode */}
      <AusenciaSection userId={user?.id ?? null} />

      {/* Session Timeout */}
      {user?.role === 'admin' && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Timeout de Sessão por Inatividade</h3>
              <p className="text-sm text-muted-foreground">Encerra a sessão automaticamente após período de inatividade</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Select value={sessionTimeout} onValueChange={setSessionTimeout}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 minutos</SelectItem>
                <SelectItem value="30">30 minutos</SelectItem>
                <SelectItem value="60">60 minutos</SelectItem>
                <SelectItem value="120">120 minutos</SelectItem>
                <SelectItem value="240">240 minutos</SelectItem>
              </SelectContent>
            </Select>
            <Button
              disabled={savingSession}
              onClick={async () => {
                setSavingSession(true);
                try {
                  await api.patch('/settings/session', { timeout_minutes: parseInt(sessionTimeout) });
                  toast.success('Timeout de sessão salvo!');
                } catch {
                  toast.error('Erro ao salvar timeout');
                }
                setSavingSession(false);
              }}
              className="gap-2"
            >
              {savingSession ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

// ─── Ausência Section ───
const AusenciaSection = ({ userId }: { userId: string | null }) => {
  const [enabled, setEnabled] = useState(false);
  const [absenceStart, setAbsenceStart] = useState("");
  const [absenceEnd, setAbsenceEnd] = useState("");
  const [absenceMessage, setAbsenceMessage] = useState("");
  const [loadingA, setLoadingA] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    api.get<any>('/auth/me').then(data => {
      setEnabled(data?.absence_enabled ?? false);
      setAbsenceStart(data?.absence_start ? data.absence_start.slice(0, 16) : "");
      setAbsenceEnd(data?.absence_end ? data.absence_end.slice(0, 16) : "");
      setAbsenceMessage(data?.absence_message ?? "");
      setLoadingA(false);
    }).catch(() => setLoadingA(false));
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/auth/me', {
        absence_enabled: enabled,
        absence_start: absenceStart || null,
        absence_end: absenceEnd || null,
        absence_message: absenceMessage || null,
      });
      toast.success("Configurações de ausência salvas!");
    } catch {
      toast.error("Erro ao salvar configurações de ausência");
    }
    setSaving(false);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
          <Clock className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground">Modo Férias / Ausência</h3>
            {enabled && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                EM AUSÊNCIA
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">Configure período de ausência — conversas serão redistribuídas automaticamente</p>
        </div>
      </div>

      {loadingA ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
            <div>
              <p className="text-sm font-medium text-foreground">Ativar modo ausência</p>
              <p className="text-xs text-muted-foreground">Quando ativo, novas conversas atribuídas a você serão redistribuídas</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-foreground">Início da ausência</label>
              <input
                type="datetime-local"
                value={absenceStart}
                onChange={e => setAbsenceStart(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Fim da ausência</label>
              <input
                type="datetime-local"
                value={absenceEnd}
                onChange={e => setAbsenceEnd(e.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground">Mensagem automática para o cliente</label>
            <Textarea
              value={absenceMessage}
              onChange={e => setAbsenceMessage(e.target.value)}
              placeholder="Ex: Olá! Estou em férias até 15/02. Sua mensagem foi recebida e será respondida ao meu retorno."
              rows={3}
              className="mt-1 text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">Enviada automaticamente quando alguém tenta entrar em contato durante sua ausência</p>
          </div>

          <Button className="gap-2" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar configurações de ausência
          </Button>
        </div>
      )}
    </Card>
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
  const [replies, setReplies] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  // Approval workflow
  const [approvalEnabled, setApprovalEnabled] = useState(false);
  const [pendingTemplates, setPendingTemplates] = useState<any[]>([]);
  const [approving, setApproving] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const loadReplies = useCallback(async () => {
    try {
      const data = await api.get<any[]>('/quick-replies');
      setReplies((data || []).map((r: any) => ({ ...r, message: r.content || r.message || '' })));
    } catch {}
  }, []);

  const loadApprovalSettings = useCallback(async () => {
    try {
      const data = await api.get<any>('/settings/template-approval');
      setApprovalEnabled(data?.enabled || false);
      if (data?.enabled && ['admin','supervisor'].includes(user?.role || '')) {
        const pending = await api.get<any[]>('/templates/pending');
        setPendingTemplates(pending || []);
      }
    } catch {}
  }, [user?.role]);

  useEffect(() => { loadReplies(); loadApprovalSettings(); }, [loadReplies, loadApprovalSettings]);

  const handleSave = async () => {
    if (!shortcut.trim() || !message.trim()) { toast.error("Preencha atalho e mensagem"); return; }
    setSaving(true);
    try {
      const result = await api.post<any>('/quick-replies', { shortcut: shortcut.trim().replace(/\//g, ""), message: message.trim(), title: title.trim() });
      if (result?.approval_status === 'pending') {
        toast.success("Resposta enviada para aprovação!");
      } else {
        toast.success("Resposta criada!");
      }
      setNewOpen(false);
      setShortcut(""); setTitle(""); setMessage("");
      loadReplies();
    } catch { toast.error("Erro ao salvar resposta"); }
    setSaving(false);
  };

  const handleApprove = async (id: string) => {
    setApproving(id);
    try {
      await api.patch(`/templates/${id}/approve`, { approved: true });
      toast.success("Template aprovado!");
      loadApprovalSettings();
      loadReplies();
    } catch { toast.error("Erro ao aprovar template"); }
    setApproving(null);
  };

  const handleReject = async (id: string) => {
    setApproving(id);
    try {
      await api.patch(`/templates/${id}/approve`, { approved: false, rejection_reason: rejectReason });
      toast.success("Template rejeitado");
      setRejectOpen(null);
      setRejectReason("");
      loadApprovalSettings();
    } catch { toast.error("Erro ao rejeitar template"); }
    setApproving(null);
  };

  const filtered = replies.filter(r => r.shortcut?.toLowerCase().includes(search.toLowerCase()) || r.message?.toLowerCase().includes(search.toLowerCase()));
  const canManageApproval = ['admin', 'supervisor'].includes(user?.role || '');

  return (
    <div className="space-y-6">
      {/* Approval Toggle (admin only) */}
      {user?.role === 'admin' && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><ShieldAlert className="h-5 w-5 text-amber-500" /></div>
              <div>
                <p className="text-sm font-medium text-foreground">Exigir aprovação para novos templates</p>
                <p className="text-xs text-muted-foreground">Novos templates criados por agentes ficarão "pendentes" até aprovação</p>
              </div>
            </div>
            <Switch checked={approvalEnabled} onCheckedChange={async (val) => {
              setApprovalEnabled(val);
              try {
                await api.patch('/settings/template-approval', { enabled: val });
                toast.success(val ? "Aprovação de templates ativada" : "Aprovação de templates desativada");
                loadApprovalSettings();
              } catch { toast.error("Erro ao salvar configuração"); setApprovalEnabled(!val); }
            }} />
          </div>
        </Card>
      )}

      {/* Pending templates (admin/supervisor) */}
      {canManageApproval && approvalEnabled && pendingTemplates.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold text-foreground">Templates Aguardando Aprovação ({pendingTemplates.length})</p>
          </div>
          <div className="space-y-2">
            {pendingTemplates.map(t => (
              <div key={t.id} className="flex items-start gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs font-mono">/{t.shortcut}</Badge>
                    <span className="text-xs text-muted-foreground">por {t.created_by_name || 'Agente'}</span>
                    <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <p className="text-sm text-foreground truncate">{t.content || t.message}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" className="h-7 gap-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApprove(t.id)} disabled={approving === t.id}>
                    {approving === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                    Aprovar
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 gap-1 border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => { setRejectOpen(t.id); setRejectReason(""); }} disabled={approving === t.id}>
                    <X className="h-3 w-3" /> Rejeitar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Zap className="h-5 w-5 text-amber-500" /></div>
          <div><p className="text-2xl font-bold text-foreground">{replies.filter(r => r.approval_status === 'approved' || !r.approval_status).length}</p><p className="text-xs text-muted-foreground">Respostas rápidas</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Clock className="h-5 w-5 text-amber-500" /></div>
          <div><p className="text-2xl font-bold text-foreground">{replies.filter(r => r.approval_status === 'pending').length}</p><p className="text-xs text-muted-foreground">Aguardando aprovação</p></div>
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
              <div key={r.id} className={cn("flex items-center gap-3 p-3 rounded-lg border bg-muted/30",
                r.approval_status === 'pending' ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : "border-border")}>
                <Badge variant="secondary" className="text-xs font-mono shrink-0">/{r.shortcut}</Badge>
                <p className="text-sm text-foreground truncate flex-1">{r.message || r.content}</p>
                {r.approval_status === 'pending' && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200 shrink-0">Aguardando aprovação</span>
                )}
                {r.approval_status === 'approved' && approvalEnabled && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 border border-green-200 shrink-0">Aprovado</span>
                )}
                <button
                  onClick={async () => {
                    try {
                      await api.delete(`/quick-replies/${r.id}`);
                      setReplies(prev => prev.filter(x => x.id !== r.id));
                      toast.success("Resposta removida");
                    } catch { toast.error("Erro ao remover resposta"); }
                  }}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
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

      {/* Rejection reason dialog */}
      <Dialog open={!!rejectOpen} onOpenChange={(o) => { if (!o) { setRejectOpen(null); setRejectReason(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Motivo da Rejeição</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Informe o motivo da rejeição para que o agente possa corrigir o template.</p>
            <div>
              <label className="text-sm font-medium text-foreground">Motivo (opcional)</label>
              <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Ex: Conteúdo inadequado, linguagem informal..." rows={3} className="mt-1" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRejectOpen(null); setRejectReason(""); }}>Cancelar</Button>
            <Button variant="destructive" onClick={() => rejectOpen && handleReject(rejectOpen)} disabled={approving === rejectOpen}>
              {approving === rejectOpen ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Rejeitar Template
            </Button>
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
  const [csatMessage, setCsatMessage] = useState("⭐ Como foi seu atendimento?\nAvalie de 1 a 5:");
  const [csatDelayMinutes, setCsatDelayMinutes] = useState(0);
  const [npsEnabled, setNpsEnabled] = useState(false);
  const [npsMessage, setNpsMessage] = useState("Em uma escala de 0 a 10, quanto você recomendaria nosso atendimento? Responda apenas com o número.");
  const [schedule, setSchedule] = useState(DEFAULT_DAYS);
  const [saving, setSaving] = useState(false);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);
  const [autoCloseDays, setAutoCloseDays] = useState(0);

  useEffect(() => {
    api.get<any>('/settings').then(data => {
      if (data.office_hours_enabled !== undefined) setEnabled(data.office_hours_enabled);
      if (data.office_hours_off_message) setOffMessage(data.office_hours_off_message);
      if (data.office_hours_schedule?.length) setSchedule(data.office_hours_schedule);
      if (data.auto_csat_enabled !== undefined) setCsatEnabled(data.auto_csat_enabled);
      if (data.csat_enabled !== undefined) setCsatEnabled(data.csat_enabled);
      if (data.csat_message) setCsatMessage(data.csat_message);
      if (data.csat_delay_minutes !== undefined) setCsatDelayMinutes(parseInt(data.csat_delay_minutes) || 0);
      if (data.nps_enabled !== undefined) setNpsEnabled(data.nps_enabled);
      if (data.nps_message) setNpsMessage(data.nps_message);
      if (data.auto_assign_enabled !== undefined) setAutoAssignEnabled(data.auto_assign_enabled);
      if (data.auto_close_days !== undefined) setAutoCloseDays(parseInt(data.auto_close_days) || 0);
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
        csat_enabled: csatEnabled,
        csat_message: csatMessage,
        csat_delay_minutes: csatDelayMinutes,
        nps_enabled: npsEnabled,
        nps_message: npsMessage,
        auto_assign_enabled: autoAssignEnabled,
        auto_close_days: autoCloseDays,
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
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-sm font-medium text-foreground">Mensagem de avaliação</label>
              <Textarea
                className="mt-1"
                value={csatMessage}
                onChange={e => setCsatMessage(e.target.value)}
                rows={3}
                placeholder="Mensagem enviada ao cliente ao encerrar a conversa..."
              />
              <p className="text-xs text-muted-foreground mt-1">O cliente receberá botões interativos (1–3) ou poderá digitar um número de 1 a 5</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Enviar após</label>
              <select
                className="mt-1 block w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground"
                value={csatDelayMinutes}
                onChange={e => setCsatDelayMinutes(parseInt(e.target.value))}
              >
                <option value={0}>Imediato</option>
                <option value={5}>5 minutos</option>
                <option value={15}>15 minutos</option>
                <option value={30}>30 minutos</option>
                <option value={60}>1 hora</option>
              </select>
            </div>
            <div className="rounded-lg bg-muted p-3 text-xs space-y-1">
              <p className="font-medium text-foreground">Preview:</p>
              <p className="text-muted-foreground whitespace-pre-wrap">{csatMessage}</p>
              <div className="flex gap-1 mt-2">
                <span className="px-2 py-0.5 rounded border border-border bg-background text-foreground">⭐ 1</span>
                <span className="px-2 py-0.5 rounded border border-border bg-background text-foreground">⭐⭐ 2</span>
                <span className="px-2 py-0.5 rounded border border-border bg-background text-foreground">⭐⭐⭐ 3</span>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* NPS Survey Toggle */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground">Pesquisa NPS Automática</p>
              <p className="text-sm text-muted-foreground">Enviar pesquisa NPS (0–10) ao encerrar conversa para calcular Net Promoter Score</p>
            </div>
          </div>
          <Switch checked={npsEnabled} onCheckedChange={setNpsEnabled} />
        </div>
        {npsEnabled && (
          <div className="mt-3 space-y-2">
            <label className="text-sm font-medium text-foreground">Mensagem NPS</label>
            <Textarea
              value={npsMessage}
              onChange={e => setNpsMessage(e.target.value)}
              rows={3}
              placeholder="Mensagem enviada ao cliente ao encerrar a conversa..."
            />
            <p className="text-xs text-muted-foreground">O cliente deve responder com um número de 0 a 10. Promotores (9–10), Passivos (7–8), Detratores (0–6).</p>
          </div>
        )}
      </Card>

      {/* Auto-assign round-robin */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><UserPlus className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="font-semibold text-foreground">Auto-atribuição Round-Robin</p>
              <p className="text-sm text-muted-foreground">Distribui novas conversas automaticamente entre agentes online</p>
            </div>
          </div>
          <Switch checked={autoAssignEnabled} onCheckedChange={setAutoAssignEnabled} />
        </div>
      </Card>

      {/* Auto-close inactive */}
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"><Clock className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="font-semibold text-foreground">Fechar Conversas Inativas</p>
              <p className="text-sm text-muted-foreground">Fecha automaticamente conversas sem mensagem por N dias (0 = desativado)</p>
            </div>
          </div>
          <input
            type="number"
            min={0}
            max={365}
            value={autoCloseDays}
            onChange={e => setAutoCloseDays(parseInt(e.target.value) || 0)}
            className="w-20 border border-border rounded-md px-2 py-1 text-sm text-center bg-background"
          />
        </div>
      </Card>

      <div className="flex justify-end">
        <Button className="gap-2" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Automação
        </Button>
      </div>

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
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [mode, setMode] = useState("round_robin");
  const [saving, setSaving] = useState(false);
  const [agents, setAgents] = useState<Array<{ id: string; name?: string; full_name?: string; max_conversations: number | null; open_count?: number }>>([]);
  const [agentCapacities, setAgentCapacities] = useState<Record<string, string>>({});
  const [savingCapacity, setSavingCapacity] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get<any>('/auto-distribution-config').then(data => {
      if (data.is_active !== undefined) setEnabled(data.is_active);
      if (data.mode) setMode(data.mode);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.get<any>('/supervisor/live').then(data => {
      if (data?.agentStats) {
        setAgents(data.agentStats);
        const caps: Record<string, string> = {};
        for (const a of data.agentStats) {
          caps[a.id] = a.max_conversations != null ? String(a.max_conversations) : '';
        }
        setAgentCapacities(caps);
      }
    }).catch(() => {
      api.get<any[]>('/users').then(rows => {
        const filtered = (rows || []).filter((u: any) => ['agent','supervisor'].includes(u.role));
        setAgents(filtered);
        const caps: Record<string, string> = {};
        for (const a of filtered) caps[a.id] = a.max_conversations != null ? String(a.max_conversations) : '';
        setAgentCapacities(caps);
      }).catch(() => {});
    });
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

  const handleSaveCapacity = async (agentId: string) => {
    setSavingCapacity(prev => ({ ...prev, [agentId]: true }));
    try {
      const val = agentCapacities[agentId];
      const maxConv = val === '' || val === '0' ? null : parseInt(val) || null;
      if (agentId === user?.id) {
        await api.patch('/auth/me', { max_conversations: maxConv });
      } else {
        await api.patch(`/users/${agentId}`, { max_conversations: maxConv });
      }
      toast.success("Capacidade salva!");
    } catch {
      toast.error("Erro ao salvar capacidade");
    } finally {
      setSavingCapacity(prev => ({ ...prev, [agentId]: false }));
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

      {/* Capacidade por Agente */}
      <Card className="p-4 space-y-4">
        <div>
          <p className="font-semibold text-foreground">Capacidade por Atendente</p>
          <p className="text-sm text-muted-foreground">Defina o número máximo de conversas simultâneas por atendente. Deixe em branco ou zero para ilimitado.</p>
        </div>
        {agents.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum atendente encontrado.</p>
        ) : (
          <div className="space-y-2">
            {agents.map(a => {
              const displayName = a.full_name || a.name || a.id;
              return (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                  <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                    {(displayName as string).charAt(0).toUpperCase()}
                  </div>
                  <p className="flex-1 text-sm font-medium text-foreground truncate">{displayName as string}</p>
                  {a.open_count !== undefined && (
                    <span className="text-xs text-muted-foreground shrink-0">{a.open_count} abertas</span>
                  )}
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      type="number"
                      min={0}
                      max={999}
                      placeholder="Ilimitado"
                      value={agentCapacities[a.id] ?? ''}
                      onChange={e => setAgentCapacities(prev => ({ ...prev, [a.id]: e.target.value }))}
                      className="w-28 h-8 text-sm"
                    />
                    <Button size="sm" variant="outline" className="h-8 px-3"
                      disabled={savingCapacity[a.id]}
                      onClick={() => handleSaveCapacity(a.id)}>
                      {savingCapacity[a.id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
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
// ─── Auto-Tag Rules Tab ───
const AutoTagRulesTab = () => {
  const [rules, setRules] = useState<{ id: string; keyword: string; tag: string; match_type: string; is_active: boolean }[]>([]);
  const [kw, setKw] = useState(""); const [tag, setTag] = useState(""); const [matchType, setMatchType] = useState("contains");
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get<any[]>('/auto-tag-rules').then(setRules).catch(() => {}); }, []);
  const handleAdd = async () => {
    if (!kw.trim() || !tag.trim()) return;
    setSaving(true);
    try {
      const r = await api.post<any>('/auto-tag-rules', { keyword: kw, tag, match_type: matchType });
      setRules(prev => [...prev, r]); setKw(""); setTag("");
    } catch { toast.error("Erro ao salvar regra"); } finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <p className="font-semibold text-foreground">Tags Automáticas por Palavra-chave</p>
        <p className="text-sm text-muted-foreground">Quando uma mensagem contiver a palavra, a tag é aplicada automaticamente ao contato.</p>
        <div className="flex gap-2 flex-wrap">
          <Input placeholder="Palavra-chave" value={kw} onChange={e => setKw(e.target.value)} className="flex-1 min-w-[120px]" />
          <Input placeholder="Tag" value={tag} onChange={e => setTag(e.target.value)} className="flex-1 min-w-[100px]" />
          <select value={matchType} onChange={e => setMatchType(e.target.value)} className="border border-border rounded-md px-2 py-1 text-sm bg-background text-foreground">
            <option value="contains">Contém</option>
            <option value="exact">Exato</option>
            <option value="starts">Começa com</option>
            <option value="regex">Regex</option>
          </select>
          <Button onClick={handleAdd} disabled={saving || !kw.trim() || !tag.trim()} className="gap-1"><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
      </Card>
      <div className="space-y-2">
        {rules.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma regra configurada</p> : rules.map(r => (
          <div key={r.id} className="flex items-center gap-3 p-3 border border-border rounded-lg bg-card">
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-foreground">"{r.keyword}"</span>
              <span className="text-muted-foreground text-sm"> → </span>
              <span className="text-sm text-primary font-medium">{r.tag}</span>
              <span className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{r.match_type}</span>
            </div>
            <Switch checked={r.is_active} onCheckedChange={async v => { await api.patch(`/auto-tag-rules/${r.id}`, { is_active: v }).catch(() => {}); setRules(prev => prev.map(x => x.id === r.id ? { ...x, is_active: v } : x)); }} />
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={async () => { await api.delete(`/auto-tag-rules/${r.id}`).catch(() => {}); setRules(prev => prev.filter(x => x.id !== r.id)); }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Blacklist Keywords Tab ───
const BlacklistKeywordsTab = () => {
  const [keywords, setKeywords] = useState<{ id: string; keyword: string; action: string; is_active: boolean }[]>([]);
  const [kw, setKw] = useState(""); const [action, setAction] = useState("block"); const [saving, setSaving] = useState(false);
  useEffect(() => { api.get<any[]>('/blacklist-keywords').then(setKeywords).catch(() => {}); }, []);
  const handleAdd = async () => {
    if (!kw.trim()) return;
    setSaving(true);
    try {
      const r = await api.post<any>('/blacklist-keywords', { keyword: kw, action });
      setKeywords(prev => [...prev, r]); setKw("");
    } catch { toast.error("Erro ao salvar palavra"); } finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <p className="font-semibold text-foreground">Palavras Bloqueadas Automaticamente</p>
        <p className="text-sm text-muted-foreground">Se a mensagem recebida contiver a palavra, o contato é bloqueado e a conversa encerrada.</p>
        <div className="flex gap-2">
          <Input placeholder="Palavra ou frase" value={kw} onChange={e => setKw(e.target.value)} className="flex-1" />
          <select value={action} onChange={e => setAction(e.target.value)} className="border border-border rounded-md px-2 py-1 text-sm bg-background text-foreground">
            <option value="block">Bloquear</option>
          </select>
          <Button onClick={handleAdd} disabled={saving || !kw.trim()} className="gap-1"><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
      </Card>
      <div className="space-y-2">
        {keywords.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma palavra cadastrada</p> : keywords.map(k => (
          <div key={k.id} className="flex items-center gap-3 p-3 border border-border rounded-lg bg-card">
            <div className="flex-1"><span className="text-sm font-medium text-foreground">"{k.keyword}"</span></div>
            <Switch checked={k.is_active} onCheckedChange={async v => { await api.patch(`/blacklist-keywords/${k.id}`, { is_active: v }).catch(() => {}); setKeywords(prev => prev.map(x => x.id === k.id ? { ...x, is_active: v } : x)); }} />
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={async () => { await api.delete(`/blacklist-keywords/${k.id}`).catch(() => {}); setKeywords(prev => prev.filter(x => x.id !== k.id)); }}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
};

const WebhookLogTab = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">("all");

  const load = async (s: "all" | "success" | "error" = statusFilter) => {
    setLoading(true);
    try {
      const params = s !== "all" ? `?status=${s}` : "";
      const data = await api.get<any[]>(`/webhook-delivery-log${params}`);
      setLogs(data);
    } catch { toast.error("Erro ao carregar log de webhooks"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFilter = (s: "all" | "success" | "error") => {
    setStatusFilter(s);
    load(s);
  };

  const fmt = (d: string) => {
    try { return new Date(d).toLocaleString("pt-BR"); } catch { return d; }
  };

  const statusBadge = (code: number | null, error: string | null) => {
    if (error && !code) return <Badge className="bg-red-100 text-red-700 border-red-300">Erro</Badge>;
    if (!code) return <Badge variant="secondary">—</Badge>;
    if (code >= 200 && code < 300) return <Badge className="bg-green-100 text-green-700 border-green-300">{code}</Badge>;
    return <Badge className="bg-red-100 text-red-700 border-red-300">{code}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex gap-1">
          {(["all", "success", "error"] as const).map(s => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "outline"}
              onClick={() => handleFilter(s)}
              className="text-xs h-8"
            >
              {s === "all" ? "Todos" : s === "success" ? "Sucesso" : "Erro"}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => load()} disabled={loading} className="gap-1.5 h-8 text-xs ml-auto">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">Nenhum registro encontrado</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Data/Hora</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Evento</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">URL</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Resposta</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{fmt(log.created_at)}</td>
                  <td className="px-3 py-2 whitespace-nowrap"><span className="font-mono text-xs">{log.event_type || "—"}</span></td>
                  <td className="px-3 py-2 max-w-[200px] truncate text-xs" title={log.url}>{log.url || "—"}</td>
                  <td className="px-3 py-2">{statusBadge(log.status_code, log.error)}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate text-xs text-muted-foreground" title={log.error || log.response_body || ""}>
                    {log.error || log.response_body || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ── HSM Templates Tab ──────────────────────────────────────────────────────
const HsmTemplatesTab = () => {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "", language: "pt_BR", category: "UTILITY",
    body_text: "", header_text: "", footer_text: "", template_id: ""
  });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<any[]>('/hsm-templates-local');
      setTemplates(data || []);
    } catch { toast.error("Erro ao carregar templates HSM"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async () => {
    if (!form.name || !form.body_text) { toast.error("Nome e corpo são obrigatórios"); return; }
    setSaving(true);
    try {
      await api.post('/hsm-templates-local', form);
      toast.success("Template criado!");
      setFormOpen(false);
      setForm({ name: "", language: "pt_BR", category: "UTILITY", body_text: "", header_text: "", footer_text: "", template_id: "" });
      await load();
    } catch { toast.error("Erro ao salvar template"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/hsm-templates-local/${id}`);
      toast.success("Template removido");
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch { toast.error("Erro ao remover template"); }
  };

  const categoryColor = (cat: string) => {
    if (cat === "MARKETING") return "bg-purple-100 text-purple-700";
    if (cat === "AUTHENTICATION") return "bg-blue-100 text-blue-700";
    return "bg-green-100 text-green-700";
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Templates HSM</h3>
          <p className="text-sm text-muted-foreground">Templates aprovados na Meta para envio fora da janela de 24h</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Novo Template
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : templates.length === 0 ? (
        <div className="text-center py-10 text-sm text-muted-foreground">Nenhum template cadastrado</div>
      ) : (
        <div className="space-y-2">
          {templates.map(t => (
            <Card key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-foreground">{t.name}</span>
                    <Badge variant="outline" className="text-[10px]">{t.language}</Badge>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${categoryColor(t.category)}`}>{t.category}</span>
                    {t.template_id && <span className="text-[10px] text-muted-foreground font-mono">ID: {t.template_id}</span>}
                  </div>
                  {t.header_text && <p className="text-xs text-muted-foreground mt-1 font-medium">{t.header_text}</p>}
                  <p className="text-sm text-foreground mt-1 line-clamp-2">{t.body_text}</p>
                  {t.footer_text && <p className="text-xs text-muted-foreground mt-1 italic">{t.footer_text}</p>}
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-500 shrink-0" onClick={() => handleDelete(t.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(o) => !saving && setFormOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Template HSM</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome do Template *</label>
                <Input placeholder="ex: boas_vindas" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Idioma</label>
                <Select value={form.language} onValueChange={v => setForm(p => ({ ...p, language: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt_BR">pt_BR</SelectItem>
                    <SelectItem value="en_US">en_US</SelectItem>
                    <SelectItem value="es_AR">es_AR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria</label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTILITY">UTILITY</SelectItem>
                    <SelectItem value="MARKETING">MARKETING</SelectItem>
                    <SelectItem value="AUTHENTICATION">AUTHENTICATION</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Cabeçalho (opcional)</label>
                <Input placeholder="Texto do cabeçalho" value={form.header_text} onChange={e => setForm(p => ({ ...p, header_text: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Corpo *</label>
                <Textarea placeholder="Olá {{1}}, seu pedido {{2}} foi confirmado!" rows={4} value={form.body_text} onChange={e => setForm(p => ({ ...p, body_text: e.target.value }))} />
                <p className="text-[10px] text-muted-foreground mt-1">Use {"{{1}}, {{2}}"} para variáveis dinâmicas</p>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Rodapé (opcional)</label>
                <Input placeholder="Texto do rodapé" value={form.footer_text} onChange={e => setForm(p => ({ ...p, footer_text: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Template ID na Meta (opcional)</label>
                <Input placeholder="ID do template aprovado na Meta" value={form.template_id} onChange={e => setForm(p => ({ ...p, template_id: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Relatórios Agendados Tab ───
const RelatoriosAgendadosTab = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', emails: '', frequency: 'weekly', report_type: 'conversations' });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<any[]>('/scheduled-reports');
      setReports(data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!form.name || !form.emails) { toast.error("Nome e emails são obrigatórios"); return; }
    setSaving(true);
    try {
      const emails = form.emails.split(',').map((e: string) => e.trim()).filter(Boolean);
      await api.post('/scheduled-reports', { ...form, emails });
      toast.success("Relatório agendado criado!");
      setForm({ name: '', emails: '', frequency: 'weekly', report_type: 'conversations' });
      await load();
    } catch { toast.error("Erro ao criar relatório agendado"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/scheduled-reports/${id}`);
      toast.success("Relatório removido");
      setReports(prev => prev.filter(r => r.id !== id));
    } catch { toast.error("Erro ao remover relatório"); }
  };

  const freqLabel = (f: string) => f === 'daily' ? 'Diário' : 'Semanal';
  const typeLabel = (t: string) => t === 'conversations' ? 'Conversas' : t === 'agents' ? 'Agentes' : 'CSAT';

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-foreground">Relatórios Agendados por Email</h3>
        <p className="text-sm text-muted-foreground mt-1">Configure relatórios que serão enviados automaticamente por email.</p>
      </div>

      <Card className="p-4 space-y-3">
        <h4 className="text-sm font-medium text-foreground">Novo Relatório</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input placeholder="Nome do relatório" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <Input placeholder="Emails (separados por vírgula)" value={form.emails} onChange={e => setForm(p => ({ ...p, emails: e.target.value }))} />
          <Select value={form.frequency} onValueChange={v => setForm(p => ({ ...p, frequency: v }))}>
            <SelectTrigger><SelectValue placeholder="Frequência" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Diário</SelectItem>
              <SelectItem value="weekly">Semanal</SelectItem>
            </SelectContent>
          </Select>
          <Select value={form.report_type} onValueChange={v => setForm(p => ({ ...p, report_type: v }))}>
            <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="conversations">Conversas</SelectItem>
              <SelectItem value="agents">Agentes</SelectItem>
              <SelectItem value="csat">CSAT</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" className="gap-1.5" onClick={handleCreate} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar Relatório
        </Button>
      </Card>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : reports.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhum relatório agendado</p>
      ) : (
        <div className="space-y-2">
          {reports.map(r => (
            <Card key={r.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-foreground truncate">{r.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {Array.isArray(r.emails) ? r.emails.join(', ') : r.emails} &bull; {freqLabel(r.frequency)} &bull; {typeLabel(r.report_type)}
                </p>
                {r.last_run_at && <p className="text-xs text-muted-foreground">Último envio: {new Date(r.last_run_at).toLocaleString('pt-BR')}</p>}
              </div>
              <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0" onClick={() => handleDelete(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Webhooks de Saída Tab ───
const WebhooksOutTab = () => {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [form, setForm] = useState({ name: '', url: '', secret: '', events: [] as string[] });

  const ALL_EVENTS = [
    { value: 'conversation.created', label: 'Nova conversa' },
    { value: 'conversation.closed', label: 'Conversa fechada' },
    { value: 'conversation.assigned', label: 'Conversa atribuída' },
    { value: 'message.received', label: 'Mensagem recebida' },
  ];

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<any[]>('/webhooks-out');
      setWebhooks(data || []);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleEvent = (ev: string) => {
    setForm(p => ({
      ...p,
      events: p.events.includes(ev) ? p.events.filter(e => e !== ev) : [...p.events, ev]
    }));
  };

  const handleCreate = async () => {
    if (!form.name || !form.url) { toast.error("Nome e URL são obrigatórios"); return; }
    setSaving(true);
    try {
      await api.post('/webhooks-out', form);
      toast.success("Webhook criado!");
      setForm({ name: '', url: '', secret: '', events: [] });
      await load();
    } catch { toast.error("Erro ao criar webhook"); }
    finally { setSaving(false); }
  };

  const handleToggleActive = async (id: string, is_active: boolean) => {
    try {
      await api.patch(`/webhooks-out/${id}`, { is_active: !is_active });
      setWebhooks(prev => prev.map(w => w.id === id ? { ...w, is_active: !is_active } : w));
    } catch { toast.error("Erro ao atualizar webhook"); }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/webhooks-out/${id}`);
      toast.success("Webhook removido");
      setWebhooks(prev => prev.filter(w => w.id !== id));
    } catch { toast.error("Erro ao remover webhook"); }
  };

  const handleTest = async (id: string) => {
    setTestResults(p => ({ ...p, [id]: { loading: true } }));
    try {
      const result = await api.post<any>(`/webhooks-out/${id}/test`, {});
      setTestResults(p => ({ ...p, [id]: result }));
    } catch {
      setTestResults(p => ({ ...p, [id]: { ok: false, error: 'Erro de conexão' } }));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-foreground">Webhooks de Saída</h3>
        <p className="text-sm text-muted-foreground mt-1">Configure URLs que receberão eventos do CRM em tempo real.</p>
      </div>

      <Card className="p-4 space-y-3">
        <h4 className="text-sm font-medium text-foreground">Novo Webhook</h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input placeholder="Nome" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <Input placeholder="URL (https://...)" value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} />
          <Input placeholder="Secret (opcional)" value={form.secret} onChange={e => setForm(p => ({ ...p, secret: e.target.value }))} />
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Eventos:</p>
          <div className="flex flex-wrap gap-3">
            {ALL_EVENTS.map(ev => (
              <label key={ev.value} className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={form.events.includes(ev.value)} onCheckedChange={() => toggleEvent(ev.value)} />
                {ev.label}
              </label>
            ))}
          </div>
        </div>
        <Button size="sm" className="gap-1.5" onClick={handleCreate} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar Webhook
        </Button>
      </Card>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : webhooks.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhum webhook configurado</p>
      ) : (
        <div className="space-y-2">
          {webhooks.map(w => (
            <Card key={w.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground truncate">{w.name}</p>
                    <Badge variant="outline" className={w.is_active ? 'text-green-600 border-green-500/30 bg-green-500/10' : 'text-gray-500 border-gray-300'}>
                      {w.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{w.url}</p>
                  {Array.isArray(w.events) && w.events.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">{w.events.join(', ')}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Switch checked={w.is_active} onCheckedChange={() => handleToggleActive(w.id, w.is_active)} />
                  <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => handleTest(w.id)}>
                    {testResults[w.id]?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Testar
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(w.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {testResults[w.id] && !testResults[w.id].loading && (
                <div className={`text-xs px-2 py-1 rounded ${testResults[w.id].ok ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                  {testResults[w.id].ok ? `✓ Sucesso (HTTP ${testResults[w.id].status})` : `✗ Falhou: ${testResults[w.id].error || `HTTP ${testResults[w.id].status}`}`}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Bot FAQ Tab ───
const BotFaqTab = () => {
  const [rules, setRules] = useState<{ id: string; keyword: string; response: string; is_active: boolean }[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ keyword: '', response: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => { api.get<any[]>('/faq-rules').then(setRules).catch(() => {}); }, []);

  const openNew = () => { setForm({ keyword: '', response: '', is_active: true }); setEditId(null); setModalOpen(true); };
  const openEdit = (r: typeof rules[0]) => { setForm({ keyword: r.keyword, response: r.response, is_active: r.is_active }); setEditId(r.id); setModalOpen(true); };

  const handleSave = async () => {
    if (!form.keyword.trim() || !form.response.trim()) { toast.error("Preencha palavra-chave e resposta"); return; }
    setSaving(true);
    try {
      if (editId) {
        const updated = await api.patch<any>(`/faq-rules/${editId}`, form);
        setRules(prev => prev.map(r => r.id === editId ? { ...r, ...updated } : r));
        toast.success("Regra atualizada!");
      } else {
        const created = await api.post<any>('/faq-rules', form);
        setRules(prev => [...prev, created]);
        toast.success("Regra criada!");
      }
      setModalOpen(false);
    } catch { toast.error("Erro ao salvar regra"); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/faq-rules/${id}`).catch(() => {});
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const toggleActive = async (r: typeof rules[0]) => {
    await api.patch(`/faq-rules/${r.id}`, { is_active: !r.is_active }).catch(() => {});
    setRules(prev => prev.map(x => x.id === r.id ? { ...x, is_active: !r.is_active } : x));
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-foreground">Bot FAQ por Palavras-chave</p>
            <p className="text-sm text-muted-foreground">Respostas automáticas quando a mensagem contiver a palavra-chave.</p>
          </div>
          <Button onClick={openNew} className="gap-1"><Plus className="h-4 w-4" /> Nova Regra</Button>
        </div>
      </Card>

      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma regra configurada</p>
      ) : (
        <div className="space-y-2">
          {rules.map(r => (
            <div key={r.id} className="flex items-start gap-3 p-3 border border-border rounded-lg bg-card">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">"{r.keyword}"</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.response}</p>
              </div>
              <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Editar Regra FAQ" : "Nova Regra FAQ"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Palavra-chave</label>
              <Input placeholder="Ex: preço, horário, endereço" value={form.keyword} onChange={e => setForm(p => ({ ...p, keyword: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Resposta automática</label>
              <Textarea placeholder="Digite a resposta que será enviada..." value={form.response} onChange={e => setForm(p => ({ ...p, response: e.target.value }))} rows={4} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
              <span className="text-sm text-foreground">Ativa</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Inbound Webhooks Tab ───
const InboundWebhooksTab = () => {
  const [webhooks, setWebhooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', trigger_action: 'create_contact' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const data = await api.get<any[]>('/inbound-webhooks'); setWebhooks(data || []); }
    catch { /* silent */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      await api.post('/inbound-webhooks', form);
      toast.success("Webhook criado!");
      setForm({ name: '', trigger_action: 'create_contact' });
      setModalOpen(false);
      await load();
    } catch { toast.error("Erro ao criar webhook"); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/inbound-webhooks/${id}`).catch(() => {});
    setWebhooks(prev => prev.filter(w => w.id !== id));
  };

  const copyUrl = (url: string) => { navigator.clipboard.writeText(url); toast.success("URL copiada!"); };

  const triggerLabels: Record<string, string> = {
    create_contact: 'Criar Contato',
    create_conversation: 'Criar Conversa',
    send_message: 'Enviar Mensagem',
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-foreground">Webhooks de Entrada</p>
            <p className="text-sm text-muted-foreground">Receba dados externos e execute ações automaticamente.</p>
          </div>
          <Button onClick={() => setModalOpen(true)} className="gap-1"><Plus className="h-4 w-4" /> Novo Webhook</Button>
        </div>
      </Card>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : webhooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum webhook configurado</p>
      ) : (
        <div className="space-y-2">
          {webhooks.map(w => (
            <Card key={w.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{w.name}</p>
                  <Badge variant="outline" className="text-xs mt-0.5">{triggerLabels[w.trigger_action] || w.trigger_action}</Badge>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => handleDelete(w.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
              {w.url && (
                <div className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1.5">
                  <code className="text-xs text-foreground flex-1 break-all">{w.url}</code>
                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => copyUrl(w.url)}><Copy className="h-3 w-3" /></Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Novo Webhook de Entrada</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Nome</label>
              <Input placeholder="Ex: Lead do site" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Ação</label>
              <Select value={form.trigger_action} onValueChange={v => setForm(p => ({ ...p, trigger_action: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="create_contact">Criar Contato</SelectItem>
                  <SelectItem value="create_conversation">Criar Conversa</SelectItem>
                  <SelectItem value="send_message">Enviar Mensagem</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── AI Labels Tab ───
const AILabelsTab = () => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<any>('/settings/ai-labels').then(d => {
      setEnabled(d?.enabled ?? false);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleToggle = async (val: boolean) => {
    setSaving(true);
    try {
      await api.patch('/settings/ai-labels', { enabled: val });
      setEnabled(val);
      toast.success(val ? "Etiquetas automáticas ativadas!" : "Etiquetas automáticas desativadas");
    } catch {
      toast.error("Erro ao salvar configuração");
    }
    setSaving(false);
  };

  const categories = [
    { key: 'suporte', label: 'Suporte', color: 'bg-blue-100 text-blue-700' },
    { key: 'financeiro', label: 'Financeiro', color: 'bg-green-100 text-green-700' },
    { key: 'reclamacao', label: 'Reclamação', color: 'bg-red-100 text-red-700' },
    { key: 'elogio', label: 'Elogio', color: 'bg-yellow-100 text-yellow-700' },
    { key: 'informacao', label: 'Informação', color: 'bg-sky-100 text-sky-700' },
    { key: 'vendas', label: 'Vendas', color: 'bg-purple-100 text-purple-700' },
    { key: 'cancelamento', label: 'Cancelamento', color: 'bg-orange-100 text-orange-700' },
    { key: 'outro', label: 'Outro', color: 'bg-gray-100 text-gray-600' },
  ];

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Etiquetas Automáticas por IA</h3>
            <p className="text-sm text-muted-foreground">
              A IA classifica automaticamente cada mensagem recebida em categorias como suporte, financeiro, reclamação...
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
              <div>
                <p className="text-sm font-medium text-foreground">Classificação automática por IA</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cada mensagem recebida é analisada e a conversa recebe uma etiqueta automaticamente
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={handleToggle} disabled={saving} />
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Categorias disponíveis</p>
              <div className="flex flex-wrap gap-2">
                {categories.map(c => (
                  <span key={c.key} className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${c.color}`}>
                    {c.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-muted/30 border border-border p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Como funciona</p>
              <ul className="space-y-1 text-xs">
                <li>• Cada mensagem recebida via WhatsApp é enviada ao modelo Claude Haiku</li>
                <li>• O modelo classifica a mensagem em uma das 8 categorias</li>
                <li>• A etiqueta é adicionada à conversa (se ainda não estiver presente)</li>
                <li>• Requer chave ANTHROPIC_API_KEY configurada no servidor</li>
              </ul>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── AI Routing Tab (inside AILabelsTab appended section) ───
const AIRoutingSection = () => {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<any>('/settings/ai-routing').then(d => {
      setEnabled(d?.enabled ?? false);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleToggle = async (val: boolean) => {
    setSaving(true);
    try {
      await api.patch('/settings/ai-routing', { enabled: val });
      setEnabled(val);
      toast.success(val ? "Roteamento inteligente ativado!" : "Roteamento inteligente desativado");
    } catch {
      toast.error("Erro ao salvar configuração");
    }
    setSaving(false);
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
          <TrendingUp className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Roteamento Inteligente com IA</h3>
          <p className="text-sm text-muted-foreground">
            A IA analisa a primeira mensagem do cliente e atribui automaticamente ao time mais adequado
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
            <div>
              <p className="text-sm font-medium text-foreground">Ativar roteamento automático por IA</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Atribui a primeira mensagem ao time correto com base no conteúdo
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={handleToggle} disabled={saving} />
          </div>

          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-200 mb-1">Requisito</p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Requer ANTHROPIC_API_KEY configurada no servidor e pelo menos 2 times cadastrados.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
};

// ─── Out-of-Hours Bot Tab ───
const OutOfHoursBotTab = () => {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<any>('/settings/out-of-hours').then(d => {
      setEnabled(d?.out_of_hours_enabled ?? false);
      setMessage(d?.out_of_hours_message ?? '');
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/settings/out-of-hours', { enabled, message });
      toast.success("Configuração salva!");
    } catch {
      toast.error("Erro ao salvar configuração");
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Bot Fora do Horário</h3>
            <p className="text-sm text-muted-foreground">
              Envia uma resposta automática quando mensagens chegam fora do horário comercial configurado
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/20">
              <div>
                <p className="text-sm font-medium text-foreground">Ativar bot fora do horário</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Resposta automática é enviada quando fora do horário comercial (tabela business_hours)
                </p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Mensagem automática</label>
              <Textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={4}
                placeholder="Ex: Olá! Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Retornaremos sua mensagem em breve!"
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                A mensagem é enviada uma vez a cada 12h por conversa quando fora do horário comercial
              </p>
            </div>

            {message && (
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Pré-visualização</p>
                <div className="flex justify-start">
                  <div className="max-w-xs rounded-xl rounded-tl-sm bg-white border border-border px-3 py-2 shadow-sm">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{message}</p>
                    <p className="text-[10px] text-gray-400 mt-1 text-right">Bot • agora</p>
                  </div>
                </div>
              </div>
            )}

            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── Roteamento Tab ───
const RotamentoTab = () => {
  const [rules, setRules] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRule, setEditRule] = useState<any | null>(null);

  // Form state
  const [formTeam, setFormTeam] = useState('');
  const [formConn, setFormConn] = useState('');
  const [formPriority, setFormPriority] = useState('1');
  const [formDays, setFormDays] = useState<number[]>([0,1,2,3,4,5,6]);
  const [formStart, setFormStart] = useState('00:00');
  const [formEnd, setFormEnd] = useState('23:59');
  const [saving, setSaving] = useState(false);

  const dayLabels = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  useEffect(() => {
    Promise.all([
      api.get<any[]>('/team-routing'),
      api.get<any[]>('/teams'),
      api.get<any[]>('/connections'),
    ]).then(([r, t, c]) => {
      setRules(r || []);
      setTeams(t || []);
      setConnections(c || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const openNew = () => {
    setEditRule(null);
    setFormTeam('');
    setFormConn('');
    setFormPriority('1');
    setFormDays([0,1,2,3,4,5,6]);
    setFormStart('00:00');
    setFormEnd('23:59');
    setModalOpen(true);
  };

  const openEdit = (r: any) => {
    setEditRule(r);
    setFormTeam(r.team_id || '');
    setFormConn(r.connection_name || '');
    setFormPriority(String(r.priority || 1));
    setFormDays(r.active_days || [0,1,2,3,4,5,6]);
    setFormStart(r.start_time || '00:00');
    setFormEnd(r.end_time || '23:59');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formTeam || !formConn) { toast.error('Selecione equipe e conexão'); return; }
    setSaving(true);
    try {
      const payload = {
        team_id: formTeam,
        connection_name: formConn,
        priority: parseInt(formPriority) || 1,
        active_days: formDays,
        start_time: formStart,
        end_time: formEnd,
      };
      if (editRule) {
        const updated = await api.patch<any>(`/team-routing/${editRule.id}`, payload);
        setRules(prev => prev.map(r => r.id === editRule.id ? updated : r));
        toast.success('Regra atualizada!');
      } else {
        const created = await api.post<any>('/team-routing', payload);
        setRules(prev => [...prev, created]);
        toast.success('Regra criada!');
      }
      setModalOpen(false);
    } catch {
      toast.error('Erro ao salvar regra');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/team-routing/${id}`);
      setRules(prev => prev.filter(r => r.id !== id));
      toast.success('Regra removida');
    } catch {
      toast.error('Erro ao remover regra');
    }
  };

  const handleToggle = async (rule: any) => {
    try {
      const updated = await api.patch<any>(`/team-routing/${rule.id}`, { is_active: !rule.is_active });
      setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
    } catch {
      toast.error('Erro ao atualizar');
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Shuffle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Roteamento por Equipe</h3>
              <p className="text-sm text-muted-foreground">Define qual número WhatsApp atende cada equipe, com base no horário e dia da semana</p>
            </div>
          </div>
          <Button size="sm" className="gap-1.5" onClick={openNew}>
            <Plus className="h-4 w-4" /> Nova Regra
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma regra configurada. Clique em "Nova Regra" para começar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="pb-2 pr-4">Equipe</th>
                  <th className="pb-2 pr-4">Número / Conexão</th>
                  <th className="pb-2 pr-4">Prioridade</th>
                  <th className="pb-2 pr-4">Dias</th>
                  <th className="pb-2 pr-4">Horário</th>
                  <th className="pb-2 pr-4">Ativo</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rules.map(rule => (
                  <tr key={rule.id} className="py-2">
                    <td className="py-2 pr-4 font-medium text-foreground">{rule.team_name || rule.team_id || '—'}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{rule.connection_name || '—'}</td>
                    <td className="py-2 pr-4">{rule.priority}</td>
                    <td className="py-2 pr-4 text-xs">
                      {(rule.active_days || []).map((d: number) => dayLabels[d]).join(', ')}
                    </td>
                    <td className="py-2 pr-4 text-xs">{rule.start_time} – {rule.end_time}</td>
                    <td className="py-2 pr-4">
                      <Switch checked={rule.is_active} onCheckedChange={() => handleToggle(rule)} />
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(rule)} className="text-muted-foreground hover:text-foreground">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => handleDelete(rule.id)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editRule ? 'Editar Regra' : 'Nova Regra de Roteamento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground">Equipe</label>
              <Select value={formTeam} onValueChange={setFormTeam}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione a equipe..." />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Conexão / Número</label>
              <Select value={formConn} onValueChange={setFormConn}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione a conexão..." />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c: any) => (
                    <SelectItem key={c.id || c.name} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Prioridade</label>
              <Input
                type="number"
                min={1}
                value={formPriority}
                onChange={e => setFormPriority(e.target.value)}
                className="mt-1 w-24"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Dias da semana</label>
              <div className="flex flex-wrap gap-2">
                {dayLabels.map((label, idx) => (
                  <label key={idx} className="flex items-center gap-1 cursor-pointer">
                    <Checkbox
                      checked={formDays.includes(idx)}
                      onCheckedChange={checked => {
                        setFormDays(prev =>
                          checked ? [...prev, idx].sort() : prev.filter(d => d !== idx)
                        );
                      }}
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Início</label>
                <Input type="time" value={formStart} onChange={e => setFormStart(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Fim</label>
                <Input type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)} className="mt-1" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Custom Fields Tab ───
interface CustomFieldDef {
  id: string;
  label: string;
  field_type: string;
  options: string[];
  required: boolean;
  position: number;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Seleção' },
  { value: 'boolean', label: 'Checkbox' },
];

const CustomFieldsTab = () => {
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDef | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form state
  const [formLabel, setFormLabel] = useState("");
  const [formType, setFormType] = useState("text");
  const [formRequired, setFormRequired] = useState(false);
  const [formOptions, setFormOptions] = useState<string[]>([]);
  const [newOption, setNewOption] = useState("");

  const fetchFields = useCallback(async () => {
    try {
      const data = await api.get<CustomFieldDef[]>('/custom-fields');
      setFields(data || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchFields(); }, [fetchFields]);

  const openCreate = () => {
    setEditingField(null);
    setFormLabel(""); setFormType("text"); setFormRequired(false); setFormOptions([]); setNewOption("");
    setDialogOpen(true);
  };

  const openEdit = (f: CustomFieldDef) => {
    setEditingField(f);
    setFormLabel(f.label); setFormType(f.field_type); setFormRequired(f.required);
    setFormOptions(Array.isArray(f.options) ? f.options : []); setNewOption("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formLabel.trim()) { toast.error("Informe o nome do campo"); return; }
    setSaving(true);
    try {
      const payload = { label: formLabel.trim(), field_type: formType, required: formRequired, options: formOptions };
      if (editingField) {
        await api.patch(`/custom-fields/${editingField.id}`, payload);
        toast.success("Campo atualizado!");
      } else {
        await api.post('/custom-fields', payload);
        toast.success("Campo criado!");
      }
      setDialogOpen(false);
      fetchFields();
    } catch { toast.error("Erro ao salvar campo"); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await api.delete(`/custom-fields/${id}`);
      toast.success("Campo excluído!");
      fetchFields();
    } catch { toast.error("Erro ao excluir campo"); }
    setDeleting(null);
  };

  const moveField = async (field: CustomFieldDef, direction: 'up' | 'down') => {
    const idx = fields.findIndex(f => f.id === field.id);
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= fields.length) return;
    const newFields = [...fields];
    [newFields[idx], newFields[newIdx]] = [newFields[newIdx], newFields[idx]];
    setFields(newFields);
    // Save new positions
    await api.patch(`/custom-fields/${field.id}`, { position: newIdx }).catch(() => {});
    await api.patch(`/custom-fields/${newFields[idx].id}`, { position: idx }).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Campos Personalizados</h3>
          <p className="text-sm text-muted-foreground">Adicione campos extras ao perfil dos contatos</p>
        </div>
        <Button variant="action" className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo Campo
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : fields.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <p className="font-medium text-foreground">Nenhum campo criado</p>
          <p className="text-sm text-muted-foreground">Crie campos personalizados para capturar informações extras dos contatos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((f, idx) => (
            <Card key={f.id} className="p-3 flex items-center gap-3">
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveField(f, 'up')}
                  disabled={idx === 0}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => moveField(f, 'down')}
                  disabled={idx === fields.length - 1}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{f.label}</span>
                  {f.required && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Obrigatório</Badge>}
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {FIELD_TYPES.find(t => t.value === f.field_type)?.label || f.field_type}
                  </Badge>
                </div>
                {f.field_type === 'select' && Array.isArray(f.options) && f.options.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Opções: {f.options.join(', ')}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(f)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  disabled={deleting === f.id}
                  onClick={() => handleDelete(f.id)}
                >
                  {deleting === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingField ? "Editar Campo" : "Novo Campo Personalizado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nome do campo</label>
              <Input value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder="Ex: CPF, Empresa, Segmento..." />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Tipo</label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formRequired} onCheckedChange={setFormRequired} />
              <label className="text-sm text-foreground">Campo obrigatório</label>
            </div>
            {formType === 'select' && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Opções</label>
                <div className="flex gap-2">
                  <Input
                    value={newOption}
                    onChange={e => setNewOption(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newOption.trim()) {
                        setFormOptions(prev => [...prev, newOption.trim()]);
                        setNewOption("");
                        e.preventDefault();
                      }
                    }}
                    placeholder="Adicionar opção..."
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (newOption.trim()) { setFormOptions(prev => [...prev, newOption.trim()]); setNewOption(""); }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {formOptions.map((opt, i) => (
                    <Badge key={i} variant="secondary" className="gap-1">
                      {opt}
                      <button onClick={() => setFormOptions(prev => prev.filter((_, j) => j !== i))} className="hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !formLabel.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingField ? "Atualizar" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Turnos Tab ────────────────────────────────────────────────────────────────
const DAY_LABELS_SHIFTS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  days: number[];
  is_active: boolean;
  agents: { id: string; name: string }[] | null;
}

interface AgentProfileShift {
  id: string;
  full_name: string | null;
  email: string;
}

const TurnosTab = () => {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [currentShift, setCurrentShift] = useState<Shift | null>(null);
  const [agentsList, setAgentsList] = useState<AgentProfileShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [saving, setSaving] = useState(false);

  const [formName, setFormName] = useState("");
  const [formStart, setFormStart] = useState("08:00");
  const [formEnd, setFormEnd] = useState("18:00");
  const [formDays, setFormDays] = useState<number[]>([1,2,3,4,5]);
  const [formAgents, setFormAgents] = useState<string[]>([]);
  const [formActive, setFormActive] = useState(true);

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try {
      const [shiftsData, currentData, agentsData] = await Promise.all([
        api.get<Shift[]>('/shifts'),
        api.get<Shift | null>('/shifts/current'),
        api.get<AgentProfileShift[]>('/users'),
      ]);
      setShifts(Array.isArray(shiftsData) ? shiftsData : []);
      setCurrentShift(currentData || null);
      setAgentsList(Array.isArray(agentsData) ? agentsData : []);
    } catch {
      toast.error("Erro ao carregar turnos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadShifts(); }, [loadShifts]);

  const openNew = () => {
    setEditingShift(null);
    setFormName("");
    setFormStart("08:00");
    setFormEnd("18:00");
    setFormDays([1,2,3,4,5]);
    setFormAgents([]);
    setFormActive(true);
    setDialogOpen(true);
  };

  const openEdit = (s: Shift) => {
    setEditingShift(s);
    setFormName(s.name);
    setFormStart(s.start_time);
    setFormEnd(s.end_time);
    setFormDays(s.days || [1,2,3,4,5]);
    setFormAgents((s.agents || []).map(a => a.id));
    setFormActive(s.is_active);
    setDialogOpen(true);
  };

  const toggleShiftDay = (day: number) => {
    setFormDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const toggleShiftAgent = (id: string) => {
    setFormAgents(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const handleSaveShift = async () => {
    if (!formName.trim()) { toast.error("Informe o nome do turno"); return; }
    setSaving(true);
    try {
      const body = {
        name: formName.trim(),
        start_time: formStart,
        end_time: formEnd,
        days: formDays,
        agent_ids: formAgents,
        is_active: formActive,
      };
      if (editingShift) {
        await api.patch(`/shifts/${editingShift.id}`, body);
        toast.success("Turno atualizado");
      } else {
        await api.post('/shifts', body);
        toast.success("Turno criado");
      }
      setDialogOpen(false);
      loadShifts();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar turno");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (!confirm("Excluir este turno?")) return;
    try {
      await api.delete(`/shifts/${id}`);
      toast.success("Turno excluído");
      loadShifts();
    } catch (e: any) {
      toast.error(e.message || "Erro ao excluir");
    }
  };

  const handleToggleShiftActive = async (s: Shift) => {
    try {
      await api.patch(`/shifts/${s.id}`, { is_active: !s.is_active });
      loadShifts();
    } catch {
      toast.error("Erro ao atualizar turno");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Turno Atual</span>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : currentShift ? (
          <div className="flex items-center gap-3 flex-wrap">
            <Badge className="bg-green-100 text-green-700 border-green-200">Ativo</Badge>
            <span className="text-sm font-medium text-foreground">{currentShift.name}</span>
            <span className="text-sm text-muted-foreground">{currentShift.start_time} – {currentShift.end_time}</span>
            {currentShift.agents && currentShift.agents.length > 0 && (
              <span className="text-sm text-muted-foreground">{currentShift.agents.length} agente(s)</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum turno ativo no momento</p>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">Turnos de Atendimento</h2>
        <Button onClick={openNew} className="gap-2" size="sm">
          <Plus className="h-4 w-4" /> Novo Turno
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : shifts.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhum turno cadastrado. Clique em "Novo Turno" para começar.
        </Card>
      ) : (
        <div className="space-y-2">
          {shifts.map(s => (
            <Card key={s.id} className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{s.name}</span>
                    <Badge variant={s.is_active ? "default" : "secondary"} className="text-[10px]">
                      {s.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-xs text-muted-foreground">{s.start_time} – {s.end_time}</span>
                    <div className="flex gap-0.5">
                      {DAY_LABELS_SHIFTS.map((label, idx) => (
                        <span
                          key={idx}
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-medium",
                            (s.days || []).includes(idx)
                              ? "bg-primary/10 text-primary"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {(s.agents || []).length} agente(s)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={s.is_active} onCheckedChange={() => handleToggleShiftActive(s)} />
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => openEdit(s)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => handleDeleteShift(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingShift ? "Editar Turno" : "Novo Turno"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Nome do Turno</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Manhã, Tarde, Noite" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Início</label>
                <Input type="time" value={formStart} onChange={e => setFormStart(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Fim</label>
                <Input type="time" value={formEnd} onChange={e => setFormEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">Dias da Semana</label>
              <div className="flex gap-1.5 flex-wrap">
                {DAY_LABELS_SHIFTS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleShiftDay(idx)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                      formDays.includes(idx)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-border hover:bg-muted"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-2 block">Agentes</label>
              <div className="max-h-40 overflow-y-auto space-y-1 border border-border rounded-md p-2">
                {agentsList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum agente disponível</p>
                ) : agentsList.map(a => (
                  <label key={a.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5">
                    <Checkbox checked={formAgents.includes(a.id)} onCheckedChange={() => toggleShiftAgent(a.id)} />
                    <span className="text-sm text-foreground">{a.full_name || a.email}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={formActive} onCheckedChange={setFormActive} />
              <span className="text-sm text-foreground">Turno ativo</span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveShift} disabled={saving || !formName.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editingShift ? "Atualizar" : "Criar Turno"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Queue Message Tab ────────────────────────────────────────────────────────
const QueueMessageTab = () => {
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("Olá! Você é o {{posicao}}º da fila. Tempo estimado: {{tempo}} minutos.");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<any>('/settings/queue-message').then(data => {
      if (data?.queue_message_enabled !== undefined) setEnabled(!!data.queue_message_enabled);
      if (data?.queue_message_text) setText(data.queue_message_text);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch('/settings/queue-message', { enabled, text });
      toast.success("Configurações de fila salvas!");
    } catch {
      toast.error("Erro ao salvar configurações de fila");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold">Mensagem de Fila de Espera</div>
            <div className="text-sm text-muted-foreground">
              Envie automaticamente a posição do cliente na fila ao iniciar uma nova conversa
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Switch checked={enabled} onCheckedChange={setEnabled} />
          <span className="text-sm">{enabled ? "Habilitado" : "Desabilitado"}</span>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Mensagem</label>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            placeholder="Olá! Você é o {{posicao}}º da fila. Tempo estimado: {{tempo}} minutos."
          />
          <p className="text-xs text-muted-foreground">
            Variáveis: <code className="bg-muted px-1 rounded">{"{{posicao}}"}</code> = posição na fila,{" "}
            <code className="bg-muted px-1 rounded">{"{{tempo}}"}</code> = tempo estimado em minutos
          </p>
        </div>

        <Button className="mt-4" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar
        </Button>
      </Card>
    </div>
  );
};

// ─── SLA por Categoria Tab ─────────────────────────────────────────────────
const SlaCategoryTab = () => {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category_name: "", sla_hours: "", priority: "normal" });

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<any[]>('/sla-categories');
      setRules(data || []);
    } catch {
      toast.error("Erro ao carregar regras de SLA");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.category_name || !form.sla_hours) {
      toast.error("Preencha categoria e horas de SLA");
      return;
    }
    setSaving(true);
    try {
      await api.post('/sla-categories', {
        category_name: form.category_name,
        sla_hours: parseFloat(form.sla_hours),
        priority: form.priority,
      });
      toast.success("Regra de SLA salva!");
      setForm({ category_name: "", sla_hours: "", priority: "normal" });
      load();
    } catch {
      toast.error("Erro ao salvar regra de SLA");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/sla-categories/${id}`);
      toast.success("Regra removida");
      setRules(prev => prev.filter(r => r.id !== id));
    } catch {
      toast.error("Erro ao remover regra");
    }
  };

  const PRIORITY_LABELS: Record<string, string> = {
    low: "Baixa",
    normal: "Normal",
    high: "Alta",
    urgent: "Urgente",
  };

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
            <Clock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold">SLA por Categoria</div>
            <div className="text-sm text-muted-foreground">
              Define prazos de SLA específicos por categoria de conversa
            </div>
          </div>
        </div>

        {/* Add form */}
        <div className="flex flex-wrap gap-3 mb-6 mt-4">
          <Input
            className="w-48"
            placeholder="Nome da categoria"
            value={form.category_name}
            onChange={e => setForm(f => ({ ...f, category_name: e.target.value }))}
          />
          <Input
            className="w-32"
            type="number"
            min="0.5"
            step="0.5"
            placeholder="Horas (ex: 24)"
            value={form.sla_hours}
            onChange={e => setForm(f => ({ ...f, sla_hours: e.target.value }))}
          />
          <select
            className="border rounded px-3 py-2 text-sm bg-background"
            value={form.priority}
            onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
          >
            <option value="low">Baixa</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
          <Button onClick={handleAdd} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            Adicionar Regra
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : rules.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            Nenhuma regra de SLA por categoria cadastrada
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left pb-2 font-medium">Categoria</th>
                  <th className="text-left pb-2 font-medium">SLA (horas)</th>
                  <th className="text-left pb-2 font-medium">Prioridade</th>
                  <th className="text-right pb-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 font-medium">{rule.category_name}</td>
                    <td className="py-2">{rule.sla_hours}h</td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        rule.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                        rule.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                        rule.priority === 'normal' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {PRIORITY_LABELS[rule.priority] || rule.priority}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(rule.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

// ─── Google Sheets Section ───────────────────────────────────────────────────
const GoogleSheetsSection = () => {
  const [accessToken, setAccessToken] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('Sheet1');
  const [dataType, setDataType] = useState<'contacts' | 'conversations'>('contacts');
  const [exporting, setExporting] = useState(false);
  const [spreadsheetUrl, setSpreadsheetUrl] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const handleExport = async () => {
    if (!accessToken.trim() || !spreadsheetId.trim()) {
      toast.error('Access Token e Spreadsheet ID são obrigatórios');
      return;
    }
    setExporting(true);
    setSpreadsheetUrl(null);
    try {
      const res = await api.post<{ success: boolean; updated_rows: number; spreadsheet_url: string }>(
        '/integrations/google-sheets/export',
        { spreadsheet_id: spreadsheetId.trim(), sheet_name: sheetName || 'Sheet1', access_token: accessToken.trim(), data_type: dataType }
      );
      if (res?.success) {
        toast.success(`Exportado com sucesso! ${res.updated_rows ?? ''} linhas atualizadas.`);
        setSpreadsheetUrl(res.spreadsheet_url);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao exportar para Google Sheets');
    }
    setExporting(false);
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-3 mb-1">
        <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-xl">📊</div>
        <div>
          <div className="font-semibold">Exportar para Google Sheets</div>
          <div className="text-sm text-muted-foreground">Envie contatos ou conversas diretamente para uma planilha do Google</div>
        </div>
      </div>

      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Como configurar:</p>
        <p>1. Acesse <strong>Google Cloud Console</strong>, crie um projeto e ative a <strong>API Google Sheets</strong>.</p>
        <p>2. Gere um <strong>Access Token OAuth2</strong> via <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Google OAuth Playground</a>.</p>
        <p>3. Copie o ID da planilha da URL: <code className="bg-muted px-1 rounded">docs.google.com/spreadsheets/d/<strong>ID</strong>/</code></p>
        <p className="text-amber-600 dark:text-amber-400">⚠️ O token expira em 1h — gere um novo quando necessário.</p>
      </div>

      <div className="grid gap-3">
        <div>
          <label className="text-sm font-medium block mb-1">Access Token OAuth2 *</label>
          <div className="relative">
            <Input
              type={showToken ? 'text' : 'password'}
              value={accessToken}
              onChange={e => setAccessToken(e.target.value)}
              placeholder="ya29.a0AfH6SM..."
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowToken(v => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Spreadsheet ID *</label>
          <Input
            value={spreadsheetId}
            onChange={e => setSpreadsheetId(e.target.value)}
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-1">Nome da Aba</label>
          <Input
            value={sheetName}
            onChange={e => setSheetName(e.target.value)}
            placeholder="Sheet1"
          />
        </div>
        <div>
          <label className="text-sm font-medium block mb-2">Dados a exportar</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={dataType === 'contacts'} onChange={() => setDataType('contacts')} className="accent-primary" />
              <span className="text-sm">Contatos</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={dataType === 'conversations'} onChange={() => setDataType('conversations')} className="accent-primary" />
              <span className="text-sm">Conversas</span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleExport} disabled={exporting} className="gap-2">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>📤</span>}
          Exportar para Google Sheets
        </Button>
        {spreadsheetUrl && (
          <a
            href={spreadsheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 underline flex items-center gap-1"
          >
            <CheckCircle className="h-4 w-4 text-green-500" /> Abrir planilha
          </a>
        )}
      </div>
    </Card>
  );
};

// ─── Organização Tab ──────────────────────────────────────────────────────────
const OrganizacaoTab = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [orgName, setOrgName] = useState('');
  const [orgLogoUrl, setOrgLogoUrl] = useState('');
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const org = await api.get<{ id: string; name: string; logo_url: string | null }>('/organizations/current');
        setOrgName(org?.name || '');
        setOrgLogoUrl(org?.logo_url || '');
        // Fetch member count from organizations list
        const orgs = await api.get<{ id: string; name: string; member_count?: number }[]>('/organizations');
        const first = orgs?.[0];
        if (first?.member_count !== undefined) setMemberCount(Number(first.member_count));
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!orgName.trim()) { toast.error('Nome obrigatório'); return; }
    setSaving(true);
    try {
      await api.patch('/organizations/current', { name: orgName.trim(), logo_url: orgLogoUrl || null });
      toast.success('Organização atualizada!');
    } catch { toast.error('Erro ao salvar'); }
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Building className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <div className="font-semibold">Organização</div>
            <div className="text-sm text-muted-foreground">Informações da sua empresa no CRM</div>
          </div>
        </div>

        <div className="grid gap-3">
          <div>
            <label className="text-sm font-medium block mb-1">Nome da Organização *</label>
            <Input
              value={orgName}
              onChange={e => setOrgName(e.target.value)}
              placeholder="Nome da empresa"
              disabled={!isAdmin}
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">URL do Logotipo</label>
            <Input
              value={orgLogoUrl}
              onChange={e => setOrgLogoUrl(e.target.value)}
              placeholder="https://exemplo.com/logo.png"
              disabled={!isAdmin}
            />
            {orgLogoUrl && (
              <div className="mt-2">
                <img src={orgLogoUrl} alt="Logo preview" className="h-10 w-auto rounded border" onError={e => (e.currentTarget.style.display = 'none')} />
              </div>
            )}
          </div>
        </div>

        {isAdmin && (
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar
          </Button>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <Users2 className="h-5 w-5 text-muted-foreground" />
          <div>
            <div className="font-semibold">Membros</div>
            {memberCount !== null && (
              <div className="text-sm text-muted-foreground">{memberCount} membro(s) na organização</div>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
          Para múltiplas organizações completas (multi-tenant), entre em contato com o suporte.
        </p>
      </Card>
    </div>
  );
};

// ─── Integrações Tab (n8n / Zapier / Make) ─────────────────────────────────
const INTEGRATION_EVENTS = [
  { value: 'conversation.created', label: 'Nova conversa criada' },
  { value: 'conversation.closed', label: 'Conversa encerrada' },
  { value: 'conversation.status_changed', label: 'Status da conversa alterado' },
  { value: 'message.received', label: 'Mensagem recebida' },
  { value: 'contact.created', label: 'Novo contato criado' },
];

interface Integration {
  id: string;
  name: string;
  webhook_url: string;
  events: string[];
  secret_token?: string | null;
  platform: string;
  is_active: boolean;
  created_at: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  n8n: 'n8n',
  zapier: 'Zapier',
  make: 'Make (Integromat)',
  generic: 'Genérico',
};

const IntegrationPlatformIcon = ({ platform }: { platform: string }) => {
  const icons: Record<string, string> = {
    n8n: '🔄',
    zapier: '⚡',
    make: '🔧',
    generic: '🌐',
  };
  return <span>{icons[platform] || '🌐'}</span>;
};

const IntegracaoTab = () => {
  const { user } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formPlatform, setFormPlatform] = useState('generic');
  const [formUrl, setFormUrl] = useState('');
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [formSecret, setFormSecret] = useState('');

  const fetchIntegrations = useCallback(async () => {
    try {
      const data = await api.get<Integration[]>('/integrations');
      setIntegrations(data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchIntegrations(); }, [fetchIntegrations]);

  const openCreate = () => {
    setFormName(''); setFormPlatform('generic'); setFormUrl(''); setFormEvents([]); setFormSecret('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formUrl.trim()) { toast.error('Nome e URL são obrigatórios'); return; }
    setSaving(true);
    try {
      await api.post('/integrations', {
        name: formName, webhook_url: formUrl, events: formEvents,
        secret_token: formSecret || null, platform: formPlatform,
      });
      toast.success('Integração criada!');
      setDialogOpen(false);
      fetchIntegrations();
    } catch { toast.error('Erro ao criar integração'); }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/integrations/${id}`);
      toast.success('Integração excluída!');
      fetchIntegrations();
    } catch { toast.error('Erro ao excluir'); }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    try {
      await api.patch(`/integrations/${id}`, { is_active: !current });
      setIntegrations(prev => prev.map(i => i.id === id ? { ...i, is_active: !current } : i));
    } catch { toast.error('Erro ao atualizar'); }
  };

  const handleTest = async (integration: Integration) => {
    setTestingId(integration.id);
    try {
      const res = await api.post<{ ok: boolean; status: number }>('/integrations/test-webhook', {
        url: integration.webhook_url,
        event_type: 'conversation.updated',
      });
      if (res?.ok) {
        toast.success(`Teste OK (HTTP ${res.status})`);
      } else {
        toast.error(`Teste retornou HTTP ${res?.status}`);
      }
    } catch { toast.error('Erro ao testar integração'); }
    setTestingId(null);
  };

  const toggleEvent = (ev: string) => {
    setFormEvents(prev => prev.includes(ev) ? prev.filter(e => e !== ev) : [...prev, ev]);
  };

  const platformGuide: Record<string, string> = {
    n8n: 'Configure um "Webhook" node no n8n e cole a URL acima. O trigger será o campo "event" no body JSON.',
    zapier: 'Use um "Webhooks by Zapier" trigger (Catch Hook) e cole a URL acima.',
    make: 'Use o módulo "Webhooks > Custom webhook" no Make e cole a URL acima.',
    generic: 'Qualquer ferramenta que receba requisições HTTP POST JSON.',
  };

  return (
    <div className="space-y-6">
      {/* Intro */}
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xl">🔗</div>
          <div>
            <div className="font-semibold">Integrações via Webhook</div>
            <div className="text-sm text-muted-foreground">Conecte o CRM ao n8n, Zapier, Make ou qualquer ferramenta que aceite webhooks</div>
          </div>
        </div>
        <div className="flex gap-4 text-2xl">
          <span title="n8n">🔄</span>
          <span title="Zapier">⚡</span>
          <span title="Make">🔧</span>
          <span title="Genérico">🌐</span>
        </div>
      </Card>

      {/* Integration list */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Integrações Configuradas</h3>
          {['admin', 'supervisor'].includes(user?.role || '') && (
            <Button size="sm" onClick={openCreate} className="gap-1.5">
              <Plus className="h-4 w-4" /> Nova Integração
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Carregando...
          </div>
        ) : integrations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Nenhuma integração configurada</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-3">Nome</th>
                  <th className="text-left py-2 pr-3">Plataforma</th>
                  <th className="text-left py-2 pr-3">URL</th>
                  <th className="text-left py-2 pr-3">Eventos</th>
                  <th className="text-center py-2 pr-3">Ativo</th>
                  <th className="text-right py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map(int => (
                  <tr key={int.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-3 font-medium">{int.name}</td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                        <IntegrationPlatformIcon platform={int.platform} />
                        {PLATFORM_LABELS[int.platform] || int.platform}
                      </span>
                    </td>
                    <td className="py-2 pr-3 max-w-[180px]">
                      <span className="text-xs text-muted-foreground truncate block" title={int.webhook_url}>{int.webhook_url}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="text-xs text-muted-foreground">
                        {int.events?.length ? int.events.length + ' evento(s)' : 'Todos'}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-center">
                      <Switch
                        checked={int.is_active}
                        onCheckedChange={() => handleToggleActive(int.id, int.is_active)}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleTest(int)}
                          disabled={testingId === int.id}
                        >
                          {testingId === int.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Testar'}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => handleDelete(int.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
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

      {/* Google Sheets Export */}
      <GoogleSheetsSection />

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova Integração</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium block mb-1">Nome *</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: n8n Produção" />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Plataforma</label>
              <Select value={formPlatform} onValueChange={setFormPlatform}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PLATFORM_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Webhook URL *</label>
              <Input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://..." />
              {formPlatform && platformGuide[formPlatform] && (
                <p className="text-xs text-muted-foreground mt-1">
                  💡 {platformGuide[formPlatform]}
                </p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Eventos (deixe vazio para todos)</label>
              <div className="space-y-2">
                {INTEGRATION_EVENTS.map(ev => (
                  <label key={ev.value} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={formEvents.includes(ev.value)}
                      onCheckedChange={() => toggleEvent(ev.value)}
                    />
                    <span className="text-sm">{ev.label}</span>
                    <span className="text-xs text-muted-foreground">({ev.value})</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Token secreto (opcional)</label>
              <Input
                value={formSecret}
                onChange={e => setFormSecret(e.target.value)}
                placeholder="Enviado no header X-Webhook-Secret"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar Integração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Escalation Rules Tab ────────────────────────────────────────────────────
const EscalationRulesTab = () => {
  const { user } = useAuth();
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", idle_minutes: 30, condition_type: "idle", target_role: "supervisor", enabled: true });

  const canEdit = user && ['admin', 'supervisor'].includes((user as any).role);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<any[]>('/escalation-rules');
      setRules(Array.isArray(data) ? data : []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", idle_minutes: 30, condition_type: "idle", target_role: "supervisor", enabled: true });
    setModalOpen(true);
  };

  const openEdit = (rule: any) => {
    setEditing(rule);
    setForm({ name: rule.name, idle_minutes: rule.idle_minutes, condition_type: rule.condition_type, target_role: rule.target_role, enabled: rule.enabled });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Nome obrigatório"); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/escalation-rules/${editing.id}`, form);
        toast.success("Regra atualizada");
      } else {
        await api.post('/escalation-rules', form);
        toast.success("Regra criada");
      }
      setModalOpen(false);
      load();
    } catch { toast.error("Erro ao salvar regra"); }
    setSaving(false);
  };

  const handleToggle = async (rule: any) => {
    try {
      await api.put(`/escalation-rules/${rule.id}`, { enabled: !rule.enabled });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch { toast.error("Erro ao atualizar"); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta regra?")) return;
    try {
      await api.delete(`/escalation-rules/${id}`);
      setRules(prev => prev.filter(r => r.id !== id));
      toast.success("Regra excluída");
    } catch { toast.error("Erro ao excluir"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">Regras de Escalação Automática</h3>
          <p className="text-sm text-muted-foreground">Define quando conversas inativas são encaminhadas para supervisores</p>
        </div>
        {canEdit && (
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Nova Regra
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : rules.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">Nenhuma regra cadastrada</Card>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <Card key={rule.id} className="p-4 flex items-center gap-4">
              <Switch checked={rule.enabled} onCheckedChange={() => canEdit && handleToggle(rule)} disabled={!canEdit} />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-foreground">{rule.name}</p>
                <p className="text-xs text-muted-foreground">
                  Inativo por <strong>{rule.idle_minutes} min</strong> → encaminhar para <strong>{rule.target_role}</strong>
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(rule)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(rule.id)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Regra" : "Nova Regra de Escalação"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Nome da Regra</label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Escalar após 30min inativo" className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Tempo de inatividade (minutos)</label>
              <Input type="number" min={1} value={form.idle_minutes} onChange={e => setForm(p => ({ ...p, idle_minutes: parseInt(e.target.value) || 30 }))} className="mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">Encaminhar para</label>
              <Select value={form.target_role} onValueChange={v => setForm(p => ({ ...p, target_role: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="supervisor">Supervisor</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={v => setForm(p => ({ ...p, enabled: v }))} />
              <span className="text-sm">Regra ativa</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

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
            <TabsTrigger value="auto_tags" className="gap-1.5"><Tag className="h-3.5 w-3.5" /> Tags Auto</TabsTrigger>
            <TabsTrigger value="blacklist_kw" className="gap-1.5"><Ban className="h-3.5 w-3.5" /> Palavras Bloqueadas</TabsTrigger>
            <TabsTrigger value="webhook_log" className="gap-1.5"><Globe className="h-3.5 w-3.5" /> Log Webhooks</TabsTrigger>
            <TabsTrigger value="hsm_templates_local" className="gap-1.5"><Zap className="h-3.5 w-3.5" /> Templates HSM</TabsTrigger>
            <TabsTrigger value="relatorios_agendados" className="gap-1.5"><Star className="h-3.5 w-3.5" /> Relatórios Agendados</TabsTrigger>
            <TabsTrigger value="webhooks_out" className="gap-1.5"><Globe className="h-3.5 w-3.5" /> Webhooks de Saída</TabsTrigger>
            <TabsTrigger value="api_publica" className="gap-1.5"><Key className="h-3.5 w-3.5" /> API & Integrações</TabsTrigger>
            <TabsTrigger value="bot_faq" className="gap-1.5"><Zap className="h-3.5 w-3.5" /> Bot FAQ</TabsTrigger>
            <TabsTrigger value="inbound_webhooks" className="gap-1.5"><Globe className="h-3.5 w-3.5" /> WH Entrada</TabsTrigger>
            <TabsTrigger value="ai_labels" className="gap-1.5"><Zap className="h-3.5 w-3.5" /> Etiquetas IA</TabsTrigger>
            <TabsTrigger value="out_of_hours" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Bot Fora do Horário</TabsTrigger>
            <TabsTrigger value="roteamento" className="gap-1.5"><Shuffle className="h-3.5 w-3.5" /> Roteamento</TabsTrigger>
            <TabsTrigger value="campos_customizados" className="gap-1.5"><SettingsIcon className="h-3.5 w-3.5" /> Campos Personalizados</TabsTrigger>
            <TabsTrigger value="turnos" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Turnos</TabsTrigger>
            <TabsTrigger value="fila_espera" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> Fila de Espera</TabsTrigger>
            <TabsTrigger value="sla_categoria" className="gap-1.5"><Clock className="h-3.5 w-3.5" /> SLA por Categoria</TabsTrigger>
            <TabsTrigger value="integracoes" className="gap-1.5"><Globe className="h-3.5 w-3.5" /> Integrações</TabsTrigger>
            <TabsTrigger value="organizacao" className="gap-1.5"><Building className="h-3.5 w-3.5" /> Organização</TabsTrigger>
            <TabsTrigger value="escalacao" className="gap-1.5"><ShieldAlert className="h-3.5 w-3.5" /> Escalação</TabsTrigger>
            <TabsTrigger value="notificacoes_email" className="gap-1.5"><Bell className="h-3.5 w-3.5" /> Notificações E-mail</TabsTrigger>
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
          <TabsContent value="auto_tags"><AutoTagRulesTab /></TabsContent>
          <TabsContent value="blacklist_kw"><BlacklistKeywordsTab /></TabsContent>
          <TabsContent value="webhook_log"><WebhookLogTab /></TabsContent>
          <TabsContent value="hsm_templates_local"><HsmTemplatesTab /></TabsContent>
          <TabsContent value="relatorios_agendados"><RelatoriosAgendadosTab /></TabsContent>
          <TabsContent value="webhooks_out"><WebhooksOutTab /></TabsContent>
          <TabsContent value="api_publica"><Suspense fallback={<TabFallback />}><ApiKeysTabLazy /></Suspense></TabsContent>
          <TabsContent value="bot_faq"><BotFaqTab /></TabsContent>
          <TabsContent value="inbound_webhooks"><InboundWebhooksTab /></TabsContent>
          <TabsContent value="ai_labels"><div className="space-y-4"><AILabelsTab /><AIRoutingSection /></div></TabsContent>
          <TabsContent value="out_of_hours"><OutOfHoursBotTab /></TabsContent>
          <TabsContent value="roteamento"><RotamentoTab /></TabsContent>
          <TabsContent value="campos_customizados"><CustomFieldsTab /></TabsContent>
          <TabsContent value="turnos"><TurnosTab /></TabsContent>
          <TabsContent value="fila_espera"><QueueMessageTab /></TabsContent>
          <TabsContent value="sla_categoria"><SlaCategoryTab /></TabsContent>
          <TabsContent value="integracoes"><IntegracaoTab /></TabsContent>
          <TabsContent value="organizacao"><OrganizacaoTab /></TabsContent>
          <TabsContent value="escalacao"><EscalationRulesTab /></TabsContent>
          <TabsContent value="notificacoes_email"><Suspense fallback={<TabFallback />}><EmailNotificationsTabLazy /></Suspense></TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
