import { useState, useEffect } from "react";
import {
  Users, Zap, MessageSquare, Plus, Pencil, Trash2, Settings,
  Search, RefreshCw, Bot, Workflow
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { supabase } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Queue {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  keywords: string | null;
  connection: string | null;
  max_waiting: number;
  auto_assign: boolean;
  created_at: string;
  updated_at: string;
  agentCount?: number;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface ChatbotRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_value: string | null;
  is_active: boolean;
  priority: number;
}

interface EvolutionConnection {
  instance_name: string;
}

const COLOR_PRESETS = [
  "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
];

const QueuesChatbot = () => {
  const { user } = useAuth();

  // Queues state
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loadingQueues, setLoadingQueues] = useState(true);
  const [search, setSearch] = useState("");

  // Profiles state
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // Connections state
  const [connections, setConnections] = useState<EvolutionConnection[]>([]);

  // Chatbot rules state
  const [chatbotRules, setChatbotRules] = useState<ChatbotRule[]>([]);
  const [loadingRules, setLoadingRules] = useState(false);
  const [routingEnabled, setRoutingEnabled] = useState(false);

  // New/Edit Queue dialog
  const [queueDialogOpen, setQueueDialogOpen] = useState(false);
  const [editingQueue, setEditingQueue] = useState<Queue | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formColor, setFormColor] = useState("#8B5CF6");
  const [formKeywords, setFormKeywords] = useState("");
  const [formConnection, setFormConnection] = useState("__none__");
  const [formMaxWaiting, setFormMaxWaiting] = useState(10);
  const [formAutoAssign, setFormAutoAssign] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");

  // Agents dialog
  const [agentsDialogOpen, setAgentsDialogOpen] = useState(false);
  const [agentsQueue, setAgentsQueue] = useState<Queue | null>(null);
  const [queueAgentIds, setQueueAgentIds] = useState<Set<string>>(new Set());
  const [savingAgents, setSavingAgents] = useState(false);

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteQueue, setDeleteQueue] = useState<Queue | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadAll();
  }, [user]);

  const loadAll = async () => {
    if (!user) return;
    setLoadingQueues(true);
    try {
      const [queuesRes, agentsRes, profilesRes, connRes] = await Promise.all([
        supabase.from("queues" as any).select("*").eq("user_id", user.id).order("created_at"),
        supabase.from("queue_agents" as any).select("queue_id, user_id"),
        supabase.from("profiles").select("id, full_name, email"),
        supabase.from("evolution_connections" as any).select("instance_name").eq("user_id", user.id),
      ]);

      const rawQueues: Queue[] = (queuesRes.data || []) as Queue[];
      const rawAgents: { queue_id: string; user_id: string }[] = (agentsRes.data || []) as any[];

      const enriched = rawQueues.map(q => ({
        ...q,
        agentCount: rawAgents.filter(a => a.queue_id === q.id).length,
      }));

      setQueues(enriched);
      setProfiles((profilesRes.data || []) as Profile[]);
      setConnections((connRes.data || []) as EvolutionConnection[]);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoadingQueues(false);
    }
  };

  const loadChatbotRules = async () => {
    setLoadingRules(true);
    try {
      const { data, error } = await supabase
        .from("chatbot_rules")
        .select("id, name, trigger_type, trigger_value, is_active, priority")
        .order("priority", { ascending: false });
      if (error) throw error;
      setChatbotRules((data as ChatbotRule[]) || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingRules(false);
    }
  };

  // Open new queue dialog
  const openNew = () => {
    setEditingQueue(null);
    setFormName("");
    setFormDescription("");
    setFormColor("#8B5CF6");
    setFormKeywords("");
    setFormConnection("__none__");
    setFormMaxWaiting(10);
    setFormAutoAssign(false);
    setKeywordInput("");
    setQueueDialogOpen(true);
  };

  // Open edit queue dialog
  const openEdit = (q: Queue) => {
    setEditingQueue(q);
    setFormName(q.name);
    setFormDescription(q.description || "");
    setFormColor(q.color || "#8B5CF6");
    setFormKeywords(q.keywords || "");
    setFormConnection(q.connection || "__none__");
    setFormMaxWaiting(q.max_waiting || 10);
    setFormAutoAssign(q.auto_assign || false);
    setKeywordInput("");
    setQueueDialogOpen(true);
  };

  const addKeyword = () => {
    const kw = keywordInput.trim();
    if (!kw) return;
    const existing = formKeywords ? formKeywords.split(",").map(k => k.trim()).filter(Boolean) : [];
    if (!existing.includes(kw)) {
      setFormKeywords([...existing, kw].join(", "));
    }
    setKeywordInput("");
  };

  const removeKeyword = (kw: string) => {
    const existing = formKeywords.split(",").map(k => k.trim()).filter(Boolean);
    setFormKeywords(existing.filter(k => k !== kw).join(", "));
  };

  const handleSaveQueue = async () => {
    if (!formName.trim() || !user) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: formName.trim(),
        description: formDescription.trim() || null,
        color: formColor,
        keywords: formKeywords.trim() || null,
        connection: formConnection === "__none__" ? null : formConnection,
        max_waiting: formMaxWaiting,
        auto_assign: formAutoAssign,
        updated_at: new Date().toISOString(),
      };

      if (editingQueue) {
        const { error } = await supabase
          .from("queues" as any)
          .update(payload)
          .eq("id", editingQueue.id);
        if (error) throw error;
        toast.success("Fila atualizada!");
        setQueueDialogOpen(false);
        loadAll();
      } else {
        const { data, error } = await supabase
          .from("queues" as any)
          .insert({ ...payload, user_id: user.id })
          .select()
          .single();
        if (error) throw error;
        toast.success("Fila criada!");
        setQueueDialogOpen(false);
        // Open agents dialog immediately after create
        const created = data as Queue;
        setAgentsQueue({ ...created, agentCount: 0 });
        setQueueAgentIds(new Set());
        setAgentsDialogOpen(true);
        loadAll();
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar fila");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAutoAssign = async (q: Queue, value: boolean) => {
    try {
      const { error } = await supabase
        .from("queues" as any)
        .update({ auto_assign: value, updated_at: new Date().toISOString() })
        .eq("id", q.id);
      if (error) throw error;
      setQueues(prev => prev.map(x => x.id === q.id ? { ...x, auto_assign: value } : x));
    } catch (err: any) {
      toast.error("Erro ao atualizar auto-atribuição");
    }
  };

  const openAgents = async (q: Queue) => {
    setAgentsQueue(q);
    // Load existing agents for this queue
    const { data } = await supabase
      .from("queue_agents" as any)
      .select("user_id")
      .eq("queue_id", q.id);
    const ids = new Set((data || []).map((a: any) => a.user_id as string));
    setQueueAgentIds(ids);
    setAgentsDialogOpen(true);
  };

  const toggleAgent = (profileId: string) => {
    setQueueAgentIds(prev => {
      const next = new Set(prev);
      if (next.has(profileId)) next.delete(profileId);
      else next.add(profileId);
      return next;
    });
  };

  const handleSaveAgents = async () => {
    if (!agentsQueue) return;
    setSavingAgents(true);
    try {
      // Remove all existing agents for this queue
      await supabase.from("queue_agents" as any).delete().eq("queue_id", agentsQueue.id);
      // Insert selected agents
      if (queueAgentIds.size > 0) {
        const rows = Array.from(queueAgentIds).map(uid => ({
          queue_id: agentsQueue.id,
          user_id: uid,
        }));
        const { error } = await supabase.from("queue_agents" as any).insert(rows);
        if (error) throw error;
      }
      toast.success("Agentes salvos!");
      setAgentsDialogOpen(false);
      loadAll();
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar agentes");
    } finally {
      setSavingAgents(false);
    }
  };

  const openDelete = (q: Queue) => {
    setDeleteQueue(q);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteQueue) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("queues" as any).delete().eq("id", deleteQueue.id);
      if (error) throw error;
      toast.success("Fila excluída!");
      setDeleteOpen(false);
      setDeleteQueue(null);
      loadAll();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir fila");
    } finally {
      setDeleting(false);
    }
  };

  const filteredQueues = queues.filter(q =>
    q.name.toLowerCase().includes(search.toLowerCase()) ||
    (q.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalAgents = queues.reduce((sum, q) => sum + (q.agentCount || 0), 0);
  const totalAutoAssign = queues.filter(q => q.auto_assign).length;

  const keywordsList = formKeywords
    ? formKeywords.split(",").map(k => k.trim()).filter(Boolean)
    : [];

  const triggerTypeLabel = (t: string) => {
    if (t === "keyword") return "Palavra-chave";
    if (t === "default") return "Padrão";
    if (t === "menu") return "Menu";
    return t;
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <Tabs defaultValue="queues" onValueChange={(v) => { if (v === "chatbot") loadChatbotRules(); }}>
          {/* Header */}
          <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-blue-600">Filas & Chatbot</h1>
              <TabsList>
                <TabsTrigger value="queues" className="gap-2">
                  <Users className="h-4 w-4" /> Filas
                </TabsTrigger>
                <TabsTrigger value="chatbot" className="gap-2">
                  <Bot className="h-4 w-4" /> Configurações de Chatbot
                </TabsTrigger>
              </TabsList>
            </div>
            <Button variant="action" className="gap-2 uppercase text-xs px-5" onClick={openNew}>
              <Plus className="h-4 w-4" /> Nova Fila
            </Button>
          </div>

          {/* Tab: Filas */}
          <TabsContent value="queues" className="mt-0">
            <div className="p-6 space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-4 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                    <Workflow className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total de Filas</p>
                    <p className="text-2xl font-bold text-foreground">{queues.length}</p>
                  </div>
                </Card>
                <Card className="p-4 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Agentes Ativos</p>
                    <p className="text-2xl font-bold text-foreground">{totalAgents}</p>
                  </div>
                </Card>
                <Card className="p-4 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                    <Zap className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Auto-atribuição Ativas</p>
                    <p className="text-2xl font-bold text-foreground">{totalAutoAssign}</p>
                  </div>
                </Card>
              </div>

              {/* Search + refresh */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar filas..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button variant="outline" size="icon" onClick={loadAll} disabled={loadingQueues}>
                  <RefreshCw className={cn("h-4 w-4", loadingQueues && "animate-spin")} />
                </Button>
              </div>

              {/* Queue list */}
              {loadingQueues ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
                </div>
              ) : filteredQueues.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Workflow className="h-12 w-12 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">Nenhuma fila encontrada</p>
                  <p className="text-sm mt-1">Clique em "+ Nova Fila" para criar a primeira fila de atendimento.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredQueues.map(q => {
                    const kws = q.keywords ? q.keywords.split(",").map(k => k.trim()).filter(Boolean) : [];
                    return (
                      <Card key={q.id} className="p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: q.color || "#8B5CF6" }}
                            />
                            <p className="font-semibold text-sm text-foreground truncate">{q.name}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              className="text-muted-foreground hover:text-foreground transition-colors p-1"
                              onClick={() => openEdit(q)}
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="text-muted-foreground hover:text-destructive transition-colors p-1"
                              onClick={() => openDelete(q)}
                              title="Excluir"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {q.description && (
                          <p className="text-xs text-muted-foreground">{q.description}</p>
                        )}

                        {/* Keywords */}
                        {kws.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {kws.map(kw => (
                              <Badge key={kw} variant="secondary" className="text-[10px] px-1.5 py-0.5">
                                {kw}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Meta info */}
                        <div className="space-y-1 text-xs text-muted-foreground">
                          {q.connection && (
                            <p className="flex items-center gap-1.5">
                              <MessageSquare className="h-3 w-3" />
                              {q.connection}
                            </p>
                          )}
                          <p className="flex items-center gap-1.5">
                            <Users className="h-3 w-3" />
                            {q.agentCount || 0} agente{(q.agentCount || 0) !== 1 ? "s" : ""}
                          </p>
                        </div>

                        {/* Footer: auto-assign + manage agents */}
                        <div className="flex items-center justify-between pt-1 border-t border-border">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={q.auto_assign}
                              onCheckedChange={(v) => handleToggleAutoAssign(q, v)}
                            />
                            <span className="text-xs text-muted-foreground">Auto-atribuição</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1.5"
                            onClick={() => openAgents(q)}
                          >
                            <Settings className="h-3 w-3" />
                            Agentes
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Tab: Chatbot settings */}
          <TabsContent value="chatbot" className="mt-0">
            <div className="p-6 space-y-6">
              {/* Info panel */}
              <Card className="p-5 border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20">
                <div className="flex items-start gap-3">
                  <Bot className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-blue-700 dark:text-blue-400 text-sm">Como funciona o roteamento por fila</p>
                    <p className="text-xs text-blue-600 dark:text-blue-300 mt-1 leading-relaxed">
                      Cada fila pode ter palavras-chave associadas. Quando uma mensagem chega, o sistema verifica se ela contém alguma dessas palavras-chave e direciona automaticamente para a fila correspondente.
                      Configure as palavras-chave diretamente nas filas (aba "Filas"), e defina a conexão (instância WhatsApp) que cada fila deve monitorar.
                    </p>
                  </div>
                </div>
              </Card>

              {/* Routing toggle */}
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Workflow className="h-5 w-5 text-purple-600" />
                    <div>
                      <p className="font-semibold text-sm">Ativar roteamento por fila</p>
                      <p className="text-xs text-muted-foreground">Distribui automaticamente os atendimentos com base nas palavras-chave das filas</p>
                    </div>
                  </div>
                  <Switch
                    checked={routingEnabled}
                    onCheckedChange={setRoutingEnabled}
                  />
                </div>
              </Card>

              {/* Chatbot rules list */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <Bot className="h-4 w-4" /> Regras de Chatbot Existentes
                  </h2>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={loadChatbotRules} disabled={loadingRules}>
                    <RefreshCw className={cn("h-3 w-3", loadingRules && "animate-spin")} />
                    Atualizar
                  </Button>
                </div>

                {loadingRules ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="animate-spin h-6 w-6 border-2 border-blue-600 border-t-transparent rounded-full" />
                  </div>
                ) : chatbotRules.length === 0 ? (
                  <Card className="p-8 text-center text-muted-foreground">
                    <Bot className="h-10 w-10 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">Nenhuma regra de chatbot encontrada.</p>
                    <p className="text-xs mt-1">Crie regras na página de Chatbot e elas aparecerão aqui.</p>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {chatbotRules.map(rule => (
                      <Card key={rule.id} className="p-3">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn(
                              "h-2 w-2 rounded-full shrink-0",
                              rule.is_active ? "bg-green-500" : "bg-muted-foreground"
                            )} />
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate">{rule.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {triggerTypeLabel(rule.trigger_type)}
                                {rule.trigger_value ? `: "${rule.trigger_value}"` : ""}
                                {" · "}Prioridade {rule.priority}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant={rule.is_active ? "default" : "secondary"}
                            className="text-[10px] shrink-0"
                          >
                            {rule.is_active ? "Ativa" : "Inativa"}
                          </Badge>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* New/Edit Queue Dialog */}
      <Dialog open={queueDialogOpen} onOpenChange={setQueueDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingQueue ? "Editar Fila" : "Nova Fila"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Nome *</label>
              <Input
                placeholder="Nome da fila"
                value={formName}
                onChange={e => setFormName(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Descrição</label>
              <Input
                placeholder="Descrição opcional"
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
              />
            </div>

            {/* Color */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Cor</label>
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_PRESETS.map(c => (
                  <button
                    key={c}
                    onClick={() => setFormColor(c)}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition-all",
                      formColor === c ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={formColor}
                  onChange={e => setFormColor(e.target.value)}
                  className="h-7 w-7 rounded-full border border-border cursor-pointer bg-transparent"
                  title="Cor personalizada"
                />
              </div>
            </div>

            {/* Keywords */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Palavras-chave</label>
              <div className="flex gap-2">
                <Input
                  placeholder="Ex: suporte, dúvida..."
                  value={keywordInput}
                  onChange={e => setKeywordInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={addKeyword} type="button">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {keywordsList.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {keywordsList.map(kw => (
                    <Badge
                      key={kw}
                      variant="secondary"
                      className="text-xs gap-1 cursor-pointer"
                      onClick={() => removeKeyword(kw)}
                    >
                      {kw}
                      <span className="ml-0.5 text-muted-foreground hover:text-destructive">×</span>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Connection */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Conexão (instância)</label>
              <Select value={formConnection} onValueChange={setFormConnection}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conexão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {connections.map(c => (
                    <SelectItem key={c.instance_name} value={c.instance_name}>
                      {c.instance_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Max waiting */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Máx. em espera</label>
              <Input
                type="number"
                min={1}
                max={999}
                value={formMaxWaiting}
                onChange={e => setFormMaxWaiting(parseInt(e.target.value) || 10)}
              />
            </div>

            {/* Auto assign */}
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Auto-atribuição</p>
                <p className="text-xs text-muted-foreground">Atribui automaticamente ao agente disponível</p>
              </div>
              <Switch checked={formAutoAssign} onCheckedChange={setFormAutoAssign} />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setQueueDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={handleSaveQueue}
              disabled={saving || !formName.trim()}
            >
              {saving ? "Salvando..." : editingQueue ? "Salvar" : "Criar Fila"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agents Dialog */}
      <Dialog open={agentsDialogOpen} onOpenChange={setAgentsDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Gerenciar Agentes — {agentsQueue?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 space-y-2">
            {profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum agente encontrado.</p>
            ) : (
              profiles.map(p => (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors",
                    queueAgentIds.has(p.id)
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/20"
                      : "border-border hover:bg-muted/50"
                  )}
                  onClick={() => toggleAgent(p.id)}
                >
                  <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {(p.full_name || p.email || "?").substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.full_name || "Sem nome"}</p>
                    {p.email && <p className="text-xs text-muted-foreground truncate">{p.email}</p>}
                  </div>
                  <div className={cn(
                    "h-4 w-4 rounded border-2 flex items-center justify-center shrink-0",
                    queueAgentIds.has(p.id) ? "border-blue-600 bg-blue-600" : "border-border"
                  )}>
                    {queueAgentIds.has(p.id) && (
                      <span className="text-white text-[10px] font-bold">✓</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setAgentsDialogOpen(false)} disabled={savingAgents}>
              Cancelar
            </Button>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={handleSaveAgents}
              disabled={savingAgents}
            >
              {savingAgents ? "Salvando..." : "Salvar Agentes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fila "{deleteQueue?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os dados da fila, incluindo agentes associados, serão removidos permanentemente. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default QueuesChatbot;
