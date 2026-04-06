import { useState, useEffect, useCallback } from "react";
import { Key, Plus, Trash2, Copy, ShieldAlert, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import api from "@/lib/api";
import { toast } from "sonner";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const ApiKeysTab = () => {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ApiKey[]>('/api-keys');
      setKeys(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Erro ao carregar API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) { toast.error('Informe um nome para a chave'); return; }
    setCreating(true);
    try {
      const data = await api.post<ApiKey & { full_key: string }>('/api-keys', { name: newKeyName.trim() });
      setCreatedKey(data.full_key);
      setCreateOpen(false);
      setNewKeyName("");
      load();
    } catch {
      toast.error('Erro ao criar API key');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api-keys/${id}`);
      setKeys(prev => prev.filter(k => k.id !== id));
      toast.success('Chave removida');
    } catch {
      toast.error('Erro ao remover chave');
    }
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    toast.success('Chave copiada!');
    setTimeout(() => setCopied(false), 2000);
  };

  const baseUrl = window.location.origin.replace(':5173', ':3000').replace(':5174', ':3000');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">API Pública</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie suas chaves de API para integrar sistemas externos ao CRM.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Nova API Key
        </Button>
      </div>

      {/* Keys list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : keys.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center gap-3">
          <Key className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm">Nenhuma API key criada ainda.</p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>Criar primeira chave</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map(k => (
            <Card key={k.id} className="p-4 flex items-center gap-4">
              <Key className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{k.name}</span>
                  <Badge variant={k.is_active ? "default" : "secondary"} className="text-[10px]">
                    {k.is_active ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
                <code className="text-xs text-muted-foreground font-mono">{k.key_prefix}</code>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Criada em {formatDate(k.created_at)} · Último uso: {formatDate(k.last_used_at)}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive shrink-0"
                onClick={() => handleDelete(k.id)}
                title="Remover chave"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Quick docs */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <h4 className="font-medium text-sm">Documentação Rápida</h4>
        </div>
        <Card className="p-4 space-y-4 text-xs">
          <p className="text-muted-foreground">Autentique todas as requisições com o header <code className="bg-muted px-1 rounded">X-API-Key: sua_chave</code></p>

          <div>
            <p className="font-semibold mb-1">Listar contatos</p>
            <pre className="bg-muted rounded p-2 overflow-x-auto text-[11px]">{`curl -H "X-API-Key: msxcrm_..." \\
  ${baseUrl}/api/contacts?limit=20`}</pre>
          </div>

          <div>
            <p className="font-semibold mb-1">Criar contato</p>
            <pre className="bg-muted rounded p-2 overflow-x-auto text-[11px]">{`curl -X POST -H "X-API-Key: msxcrm_..." \\
  -H "Content-Type: application/json" \\
  -d '{"name":"João","phone":"5511999999999"}' \\
  ${baseUrl}/api/public/v1/contacts`}</pre>
          </div>

          <div>
            <p className="font-semibold mb-1">Enviar mensagem</p>
            <pre className="bg-muted rounded p-2 overflow-x-auto text-[11px]">{`curl -X POST -H "X-API-Key: msxcrm_..." \\
  -H "Content-Type: application/json" \\
  -d '{"phone":"5511999999999","text":"Olá!","instance_name":"minha-instancia"}' \\
  ${baseUrl}/api/public/v1/messages`}</pre>
          </div>

          <div>
            <p className="font-semibold mb-1">Listar conversas</p>
            <pre className="bg-muted rounded p-2 overflow-x-auto text-[11px]">{`curl -H "X-API-Key: msxcrm_..." \\
  "${baseUrl}/api/public/v1/conversations?status=open&limit=50"`}</pre>
          </div>
        </Card>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Nome da chave</label>
              <Input
                className="mt-1"
                placeholder="Ex: Integração ERP, N8N Automação..."
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Gerando...</> : "Gerar Chave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reveal key dialog */}
      <Dialog open={!!createdKey} onOpenChange={() => setCreatedKey(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Chave Gerada com Sucesso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800 font-medium">
                Guarde esta chave agora — ela não será exibida novamente.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Sua API Key</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 bg-muted rounded-lg px-3 py-2 text-xs font-mono text-foreground break-all">
                  {createdKey}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => createdKey && copyKey(createdKey)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copiado!" : "Copiar"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={() => setCreatedKey(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApiKeysTab;
