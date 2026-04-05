import { useState, useEffect, useCallback } from "react";
import { Key, Plus, Info, ChevronDown, ChevronUp, ShieldAlert, XCircle, Copy, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import api from "@/lib/api";
import { toast } from "sonner";

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
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [revokeConfirmId, setRevokeConfirmId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [copied, setCopied] = useState(false);

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

export default ApiTokensTab;
