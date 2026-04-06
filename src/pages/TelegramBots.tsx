import { useState, useEffect } from "react";
import { Plus, Trash2, Bot, Globe, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import api from "@/lib/api";

interface TelegramBot {
  id: string;
  name: string;
  token: string;
  webhook_url: string | null;
  active: boolean;
  created_at: string;
}

export default function TelegramBots() {
  const [bots, setBots] = useState<TelegramBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", token: "" });
  const [created, setCreated] = useState<TelegramBot | null>(null);

  const load = async () => {
    try {
      const data = await api.get<TelegramBot[]>("/telegram-bots");
      setBots(data || []);
    } catch {
      toast.error("Erro ao carregar bots");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || !form.token.trim()) {
      toast.error("Preencha nome e token do bot");
      return;
    }
    setCreating(true);
    try {
      const bot = await api.post<TelegramBot>("/telegram-bots", {
        name: form.name.trim(),
        token: form.token.trim(),
      });
      setBots(prev => [bot, ...prev]);
      setCreated(bot);
      setForm({ name: "", token: "" });
    } catch {
      toast.error("Erro ao criar bot. Verifique o token.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este bot? O webhook também será removido do Telegram.")) return;
    setDeleting(id);
    try {
      await api.delete(`/telegram-bots/${id}`);
      setBots(prev => prev.filter(b => b.id !== id));
      toast.success("Bot excluído");
    } catch {
      toast.error("Erro ao excluir bot");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-sky-500" />
            Bots Telegram
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Conecte bots do Telegram para receber e responder mensagens no Inbox
          </p>
        </div>
        <Button onClick={() => { setShowCreate(true); setCreated(null); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Adicionar Bot
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : bots.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum bot configurado ainda.</p>
          <p className="text-xs mt-1">Crie um bot no @BotFather do Telegram e adicione o token aqui.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {bots.map(bot => (
            <Card key={bot.id} className="p-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className="h-10 w-10 rounded-full bg-sky-100 dark:bg-sky-900 flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{bot.name}</span>
                    <Badge variant={bot.active ? "default" : "secondary"} className="text-[10px] px-1.5">
                      {bot.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  {bot.webhook_url && (
                    <div className="flex items-center gap-1 mt-1">
                      <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] text-muted-foreground truncate">{bot.webhook_url}</span>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Criado em {new Date(bot.created_at).toLocaleDateString("pt-BR")}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                disabled={deleting === bot.id}
                onClick={() => handleDelete(bot.id)}
              >
                {deleting === bot.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Modal criar bot */}
      <Dialog open={showCreate} onOpenChange={v => { setShowCreate(v); if (!v) { setCreated(null); setForm({ name: "", token: "" }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-sky-500" />
              {created ? "Bot Criado com Sucesso" : "Adicionar Bot Telegram"}
            </DialogTitle>
          </DialogHeader>

          {created ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
                <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">Webhook configurado automaticamente</p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">O Telegram já está enviando mensagens para o Inbox</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Bot</Label>
                <p className="text-sm font-medium">{created.name}</p>
                {created.webhook_url && (
                  <>
                    <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                    <p className="text-xs font-mono bg-muted rounded p-2 break-all">{created.webhook_url}</p>
                  </>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                As mensagens recebidas neste bot aparecerão automaticamente no Inbox com o ícone do Telegram.
              </p>
              <DialogFooter>
                <Button onClick={() => { setShowCreate(false); setCreated(null); }}>Fechar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 text-xs text-sky-800 dark:text-sky-200">
                <strong>Como obter o token:</strong>
                <ol className="list-decimal list-inside mt-1 space-y-0.5">
                  <li>Abra o Telegram e acesse @BotFather</li>
                  <li>Envie /newbot e siga as instruções</li>
                  <li>Copie o token gerado e cole abaixo</li>
                </ol>
              </div>
              <div className="space-y-1">
                <Label htmlFor="bot-name">Nome do bot (para exibição)</Label>
                <Input
                  id="bot-name"
                  placeholder="Ex: Suporte Principal"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bot-token">Token do bot</Label>
                <Input
                  id="bot-token"
                  placeholder="123456789:AABBccDDeeFFggHH..."
                  value={form.token}
                  onChange={e => setForm(p => ({ ...p, token: e.target.value }))}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>Cancelar</Button>
                <Button onClick={handleCreate} disabled={creating} className="gap-2">
                  {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                  {creating ? "Configurando..." : "Criar Bot"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
