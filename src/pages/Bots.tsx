import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Search, Filter, Bot, Play, Clock, Users, Eye, EyeOff,
  ArrowLeft, Settings as SettingsIcon, Save, ChevronRight, ChevronDown,
  MessageSquare, Image, HelpCircle, CheckCircle, List, Menu,
  Columns2, GitBranch, Clock3, Timer, Variable, Webhook, Sparkles,
  Zap, Tag, FileText, StickyNote, Building2, UserPlus, ArrowRightLeft,
  XCircle, Flag, GripVertical, X, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ───
interface ChatbotRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_value: string | null;
  response_text: string;
  is_active: boolean;
  priority: number;
  created_at: string;
}

interface FlowNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  data?: Record<string, string>;
}

// ─── Component categories for sidebar ───
const componentCategories = [
  {
    id: "mensagens",
    label: "Mensagens",
    icon: MessageSquare,
    color: "text-blue-400",
    items: [
      { type: "message", label: "Mensagem", icon: MessageSquare },
      { type: "media", label: "Mídia", icon: Image },
      { type: "question", label: "Pergunta", icon: HelpCircle },
      { type: "validation", label: "Validação", icon: CheckCircle },
    ],
  },
  {
    id: "menus",
    label: "Menus",
    icon: List,
    color: "text-green-400",
    items: [
      { type: "menu_text", label: "Menu Texto", icon: Menu },
      { type: "buttons", label: "Botões", icon: Columns2 },
      { type: "list", label: "Lista", icon: List },
    ],
  },
  {
    id: "logica",
    label: "Lógica",
    icon: GitBranch,
    color: "text-purple-400",
    items: [
      { type: "condition", label: "Condição", icon: GitBranch },
      { type: "schedule", label: "Horário", icon: Clock3 },
      { type: "delay", label: "Delay", icon: Timer },
      { type: "variable", label: "Variável", icon: Variable },
    ],
  },
  {
    id: "integracoes",
    label: "Integrações",
    icon: Webhook,
    color: "text-orange-400",
    items: [
      { type: "chatgpt", label: "ChatGPT/IA", icon: Sparkles },
      { type: "webhook", label: "Webhook", icon: Webhook },
    ],
  },
  {
    id: "acoes",
    label: "Ações",
    icon: Zap,
    color: "text-emerald-400",
    items: [
      { type: "tag", label: "Tag", icon: Tag },
      { type: "field", label: "Campo", icon: FileText },
      { type: "note", label: "Nota", icon: StickyNote },
      { type: "department", label: "Departamento", icon: Building2 },
      { type: "assign", label: "Atribuir", icon: UserPlus },
      { type: "transfer", label: "Transferir", icon: ArrowRightLeft },
    ],
  },
  {
    id: "finalizacao",
    label: "Finalização",
    icon: Flag,
    color: "text-red-400",
    items: [
      { type: "close", label: "Encerrar", icon: XCircle },
      { type: "end", label: "Fim", icon: Flag },
    ],
  },
];

// ─── Flow List View ───
const FlowListView = ({
  rules,
  loading,
  onNewFlow,
  onEditFlow,
}: {
  rules: ChatbotRule[];
  loading: boolean;
  onNewFlow: () => void;
  onEditFlow: (rule: ChatbotRule) => void;
}) => {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const activeCount = rules.filter((r) => r.is_active).length;
  const inactiveCount = rules.filter((r) => !r.is_active).length;

  const filtered = rules.filter((r) => {
    if (filter === "active" && !r.is_active) return false;
    if (filter === "inactive" && r.is_active) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = [
    { label: "Total de fluxos", value: rules.length, icon: Bot, color: "text-primary" },
    { label: "Fluxos ativos", value: activeCount, icon: Play, color: "text-emerald-500" },
    { label: "Sessões totais", value: 0, icon: Users, color: "text-amber-500" },
    { label: "Fluxos inativos", value: inactiveCount, icon: Clock, color: "text-orange-500" },
  ];

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `há ${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `há ${hours}h`;
    const days = Math.floor(hours / 24);
    return `há ${days}d`;
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-blue-600">Fluxos do Chatbot</h1>
        <Button variant="action" className="gap-2 px-5" onClick={onNewFlow}>
          <Plus className="h-4 w-4" />
          Novo Fluxo
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {stats.map((s) => (
            <Card key={s.label} className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <s.icon className={cn("h-5 w-5", s.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar fluxos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Flow List */}
        {loading ? (
          <p className="text-muted-foreground text-sm">Carregando...</p>
        ) : filtered.length === 0 ? (
          <Card className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <Bot className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold text-foreground">Nenhum fluxo encontrado</h3>
              <p className="text-sm text-muted-foreground mt-1">Crie seu primeiro fluxo de chatbot</p>
              <Button className="mt-4 gap-2" onClick={onNewFlow}>
                <Plus className="h-4 w-4" />
                Novo Fluxo
              </Button>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((rule) => (
              <Card
                key={rule.id}
                className="p-4 flex items-center justify-between hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => onEditFlow(rule)}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                    <Bot className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{rule.name}</span>
                      <Badge variant={rule.is_active ? "default" : "secondary"} className="text-xs">
                        {rule.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <Badge variant="outline" className="text-xs">
                    {rule.trigger_type === "keyword"
                      ? "Palavra-chave"
                      : rule.trigger_type === "first_message"
                      ? "Boas-vindas"
                      : "Sempre"}
                  </Badge>
                  <span className="flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> 0 sessões
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {formatTime(rule.created_at)}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditFlow(rule);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Flow Builder Canvas ───
const FlowBuilder = ({
  rule,
  onBack,
  onSave,
}: {
  rule: ChatbotRule | null;
  onBack: () => void;
  onSave: (name: string, nodes: FlowNode[]) => void;
}) => {
  const [flowName, setFlowName] = useState(rule?.name || "Novo Fluxo");
  const [nodes, setNodes] = useState<FlowNode[]>([
    { id: "start", type: "start", label: "Início", x: 400, y: 300 },
  ]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);

  // Settings form
  const [settingsName, setSettingsName] = useState(rule?.name || "Novo Fluxo");
  const [settingsDesc, setSettingsDesc] = useState("");
  const [settingsTrigger, setSettingsTrigger] = useState(rule?.trigger_type || "first_message");

  const toggleCategory = (id: string) => {
    setExpandedCategory((prev) => (prev === id ? null : id));
  };

  const addNode = (type: string, label: string) => {
    const newNode: FlowNode = {
      id: `node-${Date.now()}`,
      type,
      label,
      x: 600 + Math.random() * 200,
      y: 150 + Math.random() * 300,
    };
    setNodes((prev) => [...prev, newNode]);
  };

  const deleteNode = (id: string) => {
    if (id === "start") return;
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setSelectedNode(null);
  };

  const handleMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (nodeId === "start" && e.detail < 2) {
      // allow dragging start node
    }
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    setDraggingNode(nodeId);
    setSelectedNode(nodeId);
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({ x: e.clientX - node.x - rect.left, y: e.clientY - node.y - rect.top });
    }
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!draggingNode || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragOffset.x;
      const y = e.clientY - rect.top - dragOffset.y;
      setNodes((prev) => prev.map((n) => (n.id === draggingNode ? { ...n, x, y } : n)));
    },
    [draggingNode, dragOffset]
  );

  const handleMouseUp = () => setDraggingNode(null);

  const handleSave = () => {
    onSave(flowName, nodes);
  };

  const nodeColors: Record<string, string> = {
    start: "border-emerald-500/50 bg-card",
    message: "border-blue-500/50 bg-blue-500/10",
    media: "border-indigo-500/50 bg-indigo-500/10",
    question: "border-pink-500/50 bg-pink-500/10",
    validation: "border-green-500/50 bg-green-500/10",
    menu_text: "border-teal-500/50 bg-teal-500/10",
    buttons: "border-cyan-500/50 bg-cyan-500/10",
    list: "border-sky-500/50 bg-sky-500/10",
    condition: "border-purple-500/50 bg-purple-500/10",
    schedule: "border-amber-500/50 bg-amber-500/10",
    delay: "border-orange-500/50 bg-orange-500/10",
    variable: "border-violet-500/50 bg-violet-500/10",
    chatgpt: "border-emerald-500/50 bg-emerald-500/10",
    webhook: "border-red-500/50 bg-red-500/10",
    tag: "border-rose-500/50 bg-rose-500/10",
    field: "border-lime-500/50 bg-lime-500/10",
    note: "border-yellow-500/50 bg-yellow-500/10",
    department: "border-fuchsia-500/50 bg-fuchsia-500/10",
    assign: "border-pink-500/50 bg-pink-500/10",
    transfer: "border-orange-500/50 bg-orange-500/10",
    close: "border-red-500/50 bg-red-500/10",
    end: "border-red-500/50 bg-red-500/10",
  };

  const getNodeIcon = (type: string) => {
    const allItems = componentCategories.flatMap((c) => c.items);
    const item = allItems.find((i) => i.type === type);
    if (item) return item.icon;
    if (type === "start") return Play;
    return MessageSquare;
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-muted-foreground" />
            <Input
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="h-8 w-48 text-sm bg-muted/50 border-none font-medium"
            />
          </div>
          {nodes.length > 1 && (
            <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/30">
              Não salvo
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Zap className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="gap-2">
            <Play className="h-4 w-4" />
            Ativar
          </Button>
          <Button className="gap-2" onClick={handleSave}>
            <Save className="h-4 w-4" />
            Salvar
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Component Sidebar */}
        {sidebarOpen && (
          <div className="w-52 border-r border-border bg-card overflow-y-auto shrink-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Componentes</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSidebarOpen(false)}>
                <ChevronRight className="h-3 w-3 rotate-180" />
              </Button>
            </div>
            <div className="py-1">
              {componentCategories.map((cat) => (
                <div key={cat.id}>
                  <button
                    onClick={() => toggleCategory(cat.id)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <cat.icon className={cn("h-4 w-4", cat.color)} />
                    <span className="flex-1 text-left">{cat.label}</span>
                    {expandedCategory === cat.id ? (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                  {expandedCategory === cat.id && (
                    <div className="pb-1">
                      {cat.items.map((item) => (
                        <button
                          key={item.type}
                          onClick={() => addNode(item.type, item.label)}
                          className="w-full flex items-center gap-2.5 px-4 pl-8 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                        >
                          <item.icon className="h-3.5 w-3.5" />
                          <span className="flex-1 text-left">{item.label}</span>
                          <GripVertical className="h-3 w-3 opacity-40" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <p className="px-4 py-3 text-xs text-muted-foreground/60 border-t border-border">
              Arraste os componentes para o canvas
            </p>
          </div>
        )}

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-hidden bg-background"
          style={{
            backgroundImage:
              "radial-gradient(circle, hsl(var(--muted-foreground) / 0.1) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onClick={() => setSelectedNode(null)}
        >
          {/* Connections (simple lines between start and other nodes) */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {nodes.length > 1 &&
              nodes
                .filter((n) => n.id !== "start")
                .map((node, i) => {
                  const startNode = nodes[0];
                  return (
                    <path
                      key={node.id}
                      d={`M ${startNode.x + 140} ${startNode.y + 30} C ${startNode.x + 200} ${startNode.y + 30}, ${node.x - 60} ${node.y + 30}, ${node.x} ${node.y + 30}`}
                      fill="none"
                      stroke="hsl(var(--primary) / 0.4)"
                      strokeWidth="2"
                    />
                  );
                })}
          </svg>

          {/* Nodes */}
          {nodes.map((node) => {
            const Icon = getNodeIcon(node.type);
            const isSelected = selectedNode === node.id;
            return (
              <div
                key={node.id}
                className={cn(
                  "absolute rounded-xl border-2 px-5 py-3 cursor-grab active:cursor-grabbing shadow-lg transition-shadow select-none",
                  nodeColors[node.type] || "border-border bg-card",
                  isSelected && "ring-2 ring-primary"
                )}
                style={{ left: node.x, top: node.y, minWidth: 140 }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  handleMouseDown(e, node.id);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedNode(node.id);
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-md bg-emerald-600/80 flex items-center justify-center shrink-0">
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <span className="font-medium text-sm text-foreground">{node.label}</span>
                </div>
                {node.type !== "start" && (
                  <p className="text-xs text-muted-foreground mt-2">Digite sua mensagem aqui...</p>
                )}
                {/* Connection dot */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
                {node.type !== "start" && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-blue-500 border-2 border-background" />
                )}
                {/* Delete button */}
                {isSelected && node.id !== "start" && (
                  <button
                    className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNode(node.id);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}

          {/* Minimap */}
          <div className="absolute bottom-4 right-4 w-40 h-24 rounded-lg bg-card/80 border border-border backdrop-blur-sm overflow-hidden">
            <div className="relative w-full h-full">
              {nodes.map((node) => (
                <div
                  key={node.id}
                  className="absolute w-3 h-2 rounded-sm bg-primary"
                  style={{
                    left: `${(node.x / 1200) * 100}%`,
                    top: `${(node.y / 600) * 100}%`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Zoom controls */}
          <div className="absolute bottom-4 right-48 flex flex-col gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8">
              <Plus className="h-3 w-3" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8">
              <span className="text-xs">−</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <SettingsIcon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle>Configurações do Fluxo</DialogTitle>
                <p className="text-sm text-muted-foreground">Configure o comportamento do fluxo</p>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-foreground">Nome do Fluxo</label>
              <Input value={settingsName} onChange={(e) => setSettingsName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <Textarea placeholder="Descreva o propósito deste fluxo..." rows={3} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Gatilho</label>
              <Select value={settingsTrigger} onValueChange={setSettingsTrigger}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first_message">Boas-vindas (primeira mensagem)</SelectItem>
                  <SelectItem value="keyword">Palavra-chave</SelectItem>
                  <SelectItem value="menu_option">Opção de menu</SelectItem>
                  <SelectItem value="api">Manual (via API)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                setFlowName(settingsName);
                setSettingsOpen(false);
              }}
            >
              Salvar Configurações
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Main Component ───
const Bots = () => {
  const [rules, setRules] = useState<ChatbotRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "editor">("list");
  const [editingRule, setEditingRule] = useState<ChatbotRule | null>(null);

  const loadRules = async () => {
    try {
      const { data, error } = await supabase
        .from("chatbot_rules")
        .select("*")
        .order("priority", { ascending: false });

      if (error) {
        console.error("Error loading rules:", error);
        toast.error("Erro ao carregar fluxos");
      } else {
        setRules((data as ChatbotRule[]) || []);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleNewFlow = () => {
    setEditingRule(null);
    setView("editor");
  };

  const handleEditFlow = (rule: ChatbotRule) => {
    setEditingRule(rule);
    setView("editor");
  };

  const handleSaveFlow = async (name: string, nodes: FlowNode[]) => {
    try {
      if (editingRule) {
        const { error } = await supabase
          .from("chatbot_rules")
          .update({ name })
          .eq("id", editingRule.id);

        if (error) throw error;
        toast.success("Fluxo atualizado!");
      } else {
        const { error } = await supabase.from("chatbot_rules").insert({
          name,
          trigger_type: "first_message",
          response_text: "Fluxo automático",
          is_active: false,
          priority: 5,
        });

        if (error) throw error;
        toast.success("Fluxo criado!");
      }

      await loadRules();
      setView("list");
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Erro ao salvar fluxo");
    }
  };

  if (view === "editor") {
    return (
      <FlowBuilder
        rule={editingRule}
        onBack={() => setView("list")}
        onSave={handleSaveFlow}
      />
    );
  }

  return (
    <FlowListView
      rules={rules}
      loading={loading}
      onNewFlow={handleNewFlow}
      onEditFlow={handleEditFlow}
    />
  );
};

export default Bots;
