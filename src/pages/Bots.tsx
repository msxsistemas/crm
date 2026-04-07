import { useState, useEffect, useCallback, useRef, KeyboardEvent } from "react";
import {
  Plus, Search, Filter, Bot, Play, Clock, Users, Eye, EyeOff,
  ArrowLeft, Settings as SettingsIcon, Save, ChevronRight, ChevronDown,
  MessageSquare, Image, HelpCircle, CheckCircle, List, Menu,
  Columns2, GitBranch, Clock3, Timer, Variable, Webhook, Sparkles,
  Zap, Tag, FileText, StickyNote, Building2, UserPlus, ArrowRightLeft,
  XCircle, Flag, GripVertical, X, Trash2, Undo2, Redo2,
  BarChart2, TrendingDown, AlertTriangle, Activity, ToggleLeft, ToggleRight,
  Pencil, FlaskConical, LayoutTemplate, Code2, Brain, Info, Shuffle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db } from "@/lib/db";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { FlowCanvas, FlowNode as CanvasFlowNode, FlowConnection as CanvasFlowConnection } from "@/components/bots/FlowCanvas";
import { ChatbotTestModal } from "@/components/bots/ChatbotTestModal";

// ─── Types ───
interface FlowNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  data?: Record<string, string>;
}

interface FlowConnection {
  id: string;
  from: string;
  to: string;
}

interface ChatbotRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_value: string | null;
  response_text: string;
  is_active: boolean;
  priority: number;
  created_at: string;
  flow_data?: FlowNode[] | null;
}

interface NodeEvent {
  node_id: string;
  node_type: string;
  event_type: string;
}

interface NodeStat {
  entered: number;
  exited: number;
  abandoned: number;
  error: number;
}

interface EventTrigger {
  id: string;
  name: string;
  event_type: string;
  rule_id: string | null;
  conditions: Record<string, unknown>;
  is_active: boolean;
  trigger_count: number;
  last_triggered_at: string | null;
  created_at: string;
}

interface Queue {
  id: string;
  name: string;
}

interface IntentConfig {
  id: string;
  name: string;
  description: string | null;
  examples: string[];
  route_to_rule_id: string | null;
  route_to_queue_id: string | null;
  confidence_threshold: number;
  is_active: boolean;
  match_count: number;
  created_at: string;
}

// ─── Intent classification (frontend preview) ───
function classifyIntent(
  message: string,
  intents: IntentConfig[]
): { intent: IntentConfig; score: number } | null {
  const lower = message.toLowerCase();
  let best: { intent: IntentConfig; score: number } | null = null;

  for (const intent of intents.filter((i) => i.is_active)) {
    let score = 0;
    for (const example of intent.examples) {
      const exWords = example.toLowerCase().split(" ");
      const matchedWords = exWords.filter((w) => w.length > 3 && lower.includes(w));
      score = Math.max(score, matchedWords.length / exWords.length);
    }
    if (score >= intent.confidence_threshold && (!best || score > best.score)) {
      best = { intent, score };
    }
  }
  return best;
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
  onTestFlow,
}: {
  rules: ChatbotRule[];
  loading: boolean;
  onNewFlow: () => void;
  onEditFlow: (rule: ChatbotRule) => void;
  onTestFlow: (rule: ChatbotRule) => void;
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
    <div className="flex flex-col h-full">
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
                    className="h-8 w-8 text-violet-500 hover:text-violet-600"
                    title="Testar Fluxo"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTestFlow(rule);
                    }}
                  >
                    <FlaskConical className="h-4 w-4" />
                  </Button>
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

// ─── Node Edit Panel ───
const NodeEditPanel = ({
  node,
  onUpdateData,
  onUpdateLabel,
}: {
  node: FlowNode;
  onUpdateData: (nodeId: string, key: string, value: string) => void;
  onUpdateLabel: (nodeId: string, label: string) => void;
}) => {
  const allItems = componentCategories.flatMap((c) => c.items);
  const item = allItems.find((i) => i.type === node.type);
  const Icon = item?.icon ?? (node.type === "start" ? Play : MessageSquare);

  const d = node.data ?? {};

  const field = (label: string, key: string, placeholder?: string) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      <Input
        value={d[key] ?? ""}
        onChange={(e) => onUpdateData(node.id, key, e.target.value)}
        placeholder={placeholder ?? label}
        className="h-8 text-sm"
      />
    </div>
  );

  const textarea = (label: string, key: string, placeholder?: string, rows = 3) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      <Textarea
        value={d[key] ?? ""}
        onChange={(e) => onUpdateData(node.id, key, e.target.value)}
        placeholder={placeholder ?? label}
        rows={rows}
        className="text-sm resize-none"
      />
    </div>
  );

  const renderFields = () => {
    switch (node.type) {
      case "start":
        return <p className="text-xs text-muted-foreground">Nó de início do fluxo</p>;
      case "close":
      case "end":
        return <p className="text-xs text-muted-foreground">Este nó encerra o fluxo</p>;
      case "message":
        return textarea("Mensagem", "message", "Digite a mensagem...");
      case "media":
        return (
          <>
            {field("URL da Mídia", "url", "https://")}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Tipo</label>
              <Select value={d.mediaType ?? "imagem"} onValueChange={(v) => onUpdateData(node.id, "mediaType", v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="imagem">Imagem</SelectItem>
                  <SelectItem value="video">Vídeo</SelectItem>
                  <SelectItem value="audio">Áudio</SelectItem>
                  <SelectItem value="documento">Documento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        );
      case "question":
        return (
          <>
            {textarea("Pergunta", "question", "Digite a pergunta...")}
            {field("Variável para salvar resposta", "variable", "ex: resposta_usuario")}
          </>
        );
      case "validation":
        return (
          <>
            {field("Expressão", "expression", "ex: /^\\d+$/")}
            {field("Mensagem de erro", "errorMessage", "Valor inválido, tente novamente.")}
          </>
        );
      case "menu_text":
        return (
          <>
            {textarea("Texto do Menu", "text", "Digite o texto do menu...")}
            {textarea("Opções (uma por linha)", "options", "Opção 1\nOpção 2\nOpção 3")}
          </>
        );
      case "buttons":
        return (
          <>
            {textarea("Texto", "text", "Digite o texto...")}
            {textarea("Botões (um por linha)", "buttons", "Botão 1\nBotão 2")}
          </>
        );
      case "condition":
        return (
          <>
            {field("Variável", "variable", "ex: {{resposta}}")}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Operador</label>
              <Select value={d.operator ?? "igual"} onValueChange={(v) => onUpdateData(node.id, "operator", v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="igual">Igual</SelectItem>
                  <SelectItem value="diferente">Diferente</SelectItem>
                  <SelectItem value="contém">Contém</SelectItem>
                  <SelectItem value="maior">Maior que</SelectItem>
                  <SelectItem value="menor">Menor que</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {field("Valor", "value", "ex: sim")}
          </>
        );
      case "delay":
        return (
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">Tempo (segundos)</label>
            <Input
              type="number"
              value={d.seconds ?? ""}
              onChange={(e) => onUpdateData(node.id, "seconds", e.target.value)}
              placeholder="ex: 3"
              className="h-8 text-sm"
            />
          </div>
        );
      case "variable":
        return (
          <>
            {field("Nome da variável", "name", "ex: nome_usuario")}
            {field("Valor", "value", "ex: {{input}}")}
          </>
        );
      case "chatgpt":
        return (
          <>
            {textarea("Prompt do sistema", "prompt", "Você é um assistente...", 4)}
            {field("Salvar resposta em", "saveAs", "ex: resposta_ia")}
          </>
        );
      case "webhook":
        return (
          <>
            {field("URL", "url", "https://api.exemplo.com/webhook")}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Método</label>
              <Select value={d.method ?? "POST"} onValueChange={(v) => onUpdateData(node.id, "method", v)}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        );
      case "tag":
        return field("Nome da tag", "tag", "ex: cliente_vip");
      case "field":
        return (
          <>
            {field("Campo", "field", "ex: email")}
            {field("Valor", "value", "ex: {{resposta}}")}
          </>
        );
      case "note":
        return textarea("Anotação", "note", "Digite a anotação...");
      case "department":
        return field("Departamento", "department", "ex: Suporte");
      case "assign":
        return field("Agente", "agent", "ex: agente@empresa.com");
      case "transfer":
        return field("Destino", "destination", "ex: Fluxo de vendas");
      default:
        return <p className="text-xs text-muted-foreground">Sem campos editáveis para este nó.</p>;
    }
  };

  return (
    <div className="w-72 border-l border-border bg-card overflow-y-auto shrink-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <div className="h-7 w-7 rounded-md bg-emerald-600/80 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-white" />
        </div>
        <Input
          value={node.label}
          onChange={(e) => onUpdateLabel(node.id, e.target.value)}
          className="h-7 text-sm font-medium border-none bg-transparent p-0 focus-visible:ring-0"
        />
      </div>
      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {renderFields()}
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
  onSave: (name: string, nodes: FlowNode[], connections: FlowConnection[], triggerType: string, isActive: boolean) => void;
}) => {
  const [flowName, setFlowName] = useState(rule?.name || "Novo Fluxo");

  const parseFlowData = (data: unknown): { nodes: FlowNode[]; connections: FlowConnection[] } => {
    if (!data) return { nodes: [], connections: [] };
    if (Array.isArray(data)) return { nodes: data as FlowNode[], connections: [] };
    const d = data as Record<string, unknown>;
    return { nodes: (d.nodes as FlowNode[]) || [], connections: (d.connections as FlowConnection[]) || [] };
  };

  const parsed = parseFlowData(rule?.flow_data);
  const [nodes, setNodes] = useState<FlowNode[]>(
    parsed.nodes.length > 0
      ? parsed.nodes
      : [{ id: "start", type: "start", label: "Início", x: 400, y: 300 }]
  );
  const [connections, setConnections] = useState<FlowConnection[]>(parsed.connections);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const [editorMode, setEditorMode] = useState<"visual" | "json">("visual");
  const [jsonText, setJsonText] = useState(() =>
    JSON.stringify({ nodes: parsed.nodes, connections: parsed.connections }, null, 2)
  );

  // ─── Undo/Redo state ───
  const [history, setHistory] = useState<{ nodes: FlowNode[]; connections: FlowConnection[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const prevDragging = useRef<string | null>(null);

  // Settings form
  const [settingsName, setSettingsName] = useState(rule?.name || "Novo Fluxo");
  const [settingsDesc, setSettingsDesc] = useState("");
  const [settingsTrigger, setSettingsTrigger] = useState(rule?.trigger_type || "first_message");
  const [isActive, setIsActive] = useState(rule?.is_active || false);

  const toggleCategory = (id: string) => {
    setExpandedCategory((prev) => (prev === id ? null : id));
  };

  // ─── Push to history ───
  const pushHistory = useCallback((newNodes: FlowNode[], newConnections: FlowConnection[]) => {
    setHistory(prev => {
      const truncated = prev.slice(0, historyIndex + 1);
      return [...truncated, { nodes: newNodes, connections: newConnections }].slice(-50);
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  // ─── Undo ───
  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const prev = history[historyIndex - 1];
    setNodes(prev.nodes);
    setConnections(prev.connections);
    setHistoryIndex(i => i - 1);
  }, [history, historyIndex]);

  // ─── Redo ───
  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    setNodes(next.nodes);
    setConnections(next.connections);
    setHistoryIndex(i => i + 1);
  }, [history, historyIndex]);

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [undo, redo]);

  // ─── Save to history after drag ends ───
  useEffect(() => {
    if (prevDragging.current && !draggingNode) {
      pushHistory(nodes, connections);
    }
    prevDragging.current = draggingNode;
  }, [draggingNode]); // eslint-disable-line react-hooks/exhaustive-deps

  const addNode = (type: string, label: string) => {
    const newNodes: FlowNode[] = [
      ...nodes,
      {
        id: `node-${Date.now()}`,
        type,
        label,
        x: 600 + Math.random() * 200,
        y: 150 + Math.random() * 300,
      },
    ];
    setNodes(newNodes);
    pushHistory(newNodes, connections);
  };

  const deleteNode = (id: string) => {
    if (id === "start") return;
    const newNodes = nodes.filter((n) => n.id !== id);
    const newConnections = connections.filter((c) => c.from !== id && c.to !== id);
    setNodes(newNodes);
    setConnections(newConnections);
    setSelectedNode(null);
    pushHistory(newNodes, newConnections);
  };

  const startConnect = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (connectingFrom === nodeId) { setConnectingFrom(null); return; }
    if (connectingFrom) {
      if (connectingFrom !== nodeId && !connections.some(c => c.from === connectingFrom && c.to === nodeId)) {
        const newConnections = [...connections, { id: `conn-${Date.now()}`, from: connectingFrom, to: nodeId }];
        setConnections(newConnections);
        pushHistory(nodes, newConnections);
      }
      setConnectingFrom(null);
    } else {
      setConnectingFrom(nodeId);
    }
  };

  const deleteConnection = (id: string) => {
    const newConnections = connections.filter(c => c.id !== id);
    setConnections(newConnections);
    pushHistory(nodes, newConnections);
  };

  // ─── Update node data ───
  const updateNodeData = (nodeId: string, key: string, value: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId
      ? { ...n, data: { ...n.data, [key]: value } }
      : n
    ));
  };

  // ─── Update node label ───
  const updateNodeLabel = (nodeId: string, label: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, label } : n));
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
    onSave(flowName, nodes, connections, settingsTrigger, isActive);
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

  const selectedNodeObj = selectedNode ? nodes.find(n => n.id === selectedNode) ?? null : null;

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
          {connectingFrom && (
            <Badge variant="outline" className="text-xs text-primary border-primary/30 animate-pulse">
              Conectando — clique no nó de destino
            </Badge>
          )}
          {/* Undo/Redo buttons */}
          <div className="flex items-center gap-1 border border-border rounded-md overflow-hidden">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none"
              onClick={undo}
              disabled={historyIndex <= 0}
              title="Desfazer (Ctrl+Z)"
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-none"
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              title="Refazer (Ctrl+Y)"
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Editor mode toggle */}
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setEditorMode("visual")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                editorMode === "visual"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              Visual
            </button>
            <button
              onClick={() => {
                if (editorMode === "visual") {
                  setJsonText(JSON.stringify({ nodes, connections }, null, 2));
                }
                setEditorMode("json");
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors",
                editorMode === "json"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Code2 className="h-3.5 w-3.5" />
              JSON
            </button>
          </div>
          <Button variant="outline" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <Zap className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className={cn("gap-2", isActive && "border-emerald-500 text-emerald-600")}
            onClick={() => setIsActive(!isActive)}
          >
            {isActive ? <EyeOff className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {isActive ? "Desativar" : "Ativar"}
          </Button>
          <Button className="gap-2" onClick={handleSave}>
            <Save className="h-4 w-4" />
            Salvar
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Visual Canvas Mode ── */}
        {editorMode === "visual" && (
          <FlowCanvas
            nodes={nodes.map((n) => ({
              id: n.id,
              type: n.type,
              x: n.x,
              y: n.y,
              data: { label: n.label, ...(n.data ?? {}) },
            }) as CanvasFlowNode)}
            connections={connections.map((c) => ({
              id: c.id,
              from: c.from,
              to: c.to,
            }) as CanvasFlowConnection)}
            onChange={(canvasNodes, canvasConns) => {
              setNodes(
                canvasNodes.map((cn) => ({
                  id: cn.id,
                  type: cn.type,
                  label: (cn.data.label as string) ?? cn.type,
                  x: cn.x,
                  y: cn.y,
                  data: cn.data as Record<string, string>,
                }))
              );
              setConnections(
                canvasConns.map((cc) => ({ id: cc.id, from: cc.from, to: cc.to }))
              );
            }}
          />
        )}

        {/* ── JSON Editor Mode ── */}
        {editorMode === "json" && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex flex-1 flex-col p-4 gap-3 overflow-auto">
              <p className="text-xs text-muted-foreground">Edite o JSON do fluxo diretamente. Salve para aplicar.</p>
              <Textarea
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                className="flex-1 font-mono text-xs resize-none min-h-[400px]"
                spellCheck={false}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  try {
                    const parsed2 = JSON.parse(jsonText);
                    if (parsed2.nodes) setNodes(parsed2.nodes as FlowNode[]);
                    if (parsed2.connections) setConnections(parsed2.connections as FlowConnection[]);
                    toast.success("JSON aplicado ao fluxo");
                    setEditorMode("visual");
                  } catch {
                    toast.error("JSON inválido");
                  }
                }}
              >
                Aplicar JSON e voltar ao Visual
              </Button>
            </div>
          </div>
        )}

        {/* ── Legacy drag canvas + sidebar (hidden — visual canvas is used instead) ── */}
        {false && sidebarOpen && (
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

        {/* Canvas (legacy — hidden) */}
        {false && <div
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
          {/* Connections */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }}>
            <defs>
              <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="hsl(var(--primary) / 0.6)" />
              </marker>
            </defs>
            {connections.map((conn) => {
              const fromNode = nodes.find(n => n.id === conn.from);
              const toNode = nodes.find(n => n.id === conn.to);
              if (!fromNode || !toNode) return null;
              const x1 = fromNode.x + 140;
              const y1 = fromNode.y + 30;
              const x2 = toNode.x;
              const y2 = toNode.y + 30;
              const cx1 = x1 + Math.abs(x2 - x1) * 0.5;
              const cy1 = y1;
              const cx2 = x2 - Math.abs(x2 - x1) * 0.5;
              const cy2 = y2;
              return (
                <g key={conn.id} className="pointer-events-auto cursor-pointer" onClick={() => deleteConnection(conn.id)}>
                  <path
                    d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="hsl(var(--primary) / 0.5)"
                    strokeWidth="2"
                    markerEnd="url(#arrowhead)"
                  />
                  <path
                    d={`M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="12"
                    title="Clique para remover conexão"
                  />
                </g>
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
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {node.data?.message || node.data?.question || node.data?.text || node.data?.note || node.data?.prompt || "Clique para editar..."}
                  </p>
                )}
                {/* Output dot — click to start/end connection */}
                <div
                  className={cn(
                    "absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-3.5 w-3.5 rounded-full border-2 border-background cursor-crosshair transition-transform hover:scale-125",
                    connectingFrom === node.id ? "bg-primary ring-2 ring-primary/40" : "bg-emerald-500"
                  )}
                  style={{ zIndex: 10 }}
                  onClick={(e) => startConnect(e, node.id)}
                  title="Clique para conectar"
                />
                {node.type !== "start" && (
                  <div
                    className={cn(
                      "absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full border-2 border-background cursor-crosshair transition-transform hover:scale-125",
                      connectingFrom && connectingFrom !== node.id ? "bg-primary animate-pulse" : "bg-blue-500"
                    )}
                    style={{ zIndex: 10 }}
                    onClick={(e) => startConnect(e, node.id)}
                    title="Clique para receber conexão"
                  />
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
        </div>}

        {/* Right edit panel (legacy — hidden) */}
        {false && selectedNodeObj && (
          <NodeEditPanel
            node={selectedNodeObj}
            onUpdateData={updateNodeData}
            onUpdateLabel={updateNodeLabel}
          />
        )}
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
              <Textarea
                value={settingsDesc}
                onChange={(e) => setSettingsDesc(e.target.value)}
                placeholder="Descreva o propósito deste fluxo..."
                rows={3}
              />
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

// ─── Analytics Tab ───
type AnalyticsPeriod = "today" | "7d" | "30d";

const AnalyticsTab = ({ rules }: { rules: ChatbotRule[] }) => {
  const [period, setPeriod] = useState<AnalyticsPeriod>("7d");
  const [selectedRuleId, setSelectedRuleId] = useState<string>("");
  const [nodeStats, setNodeStats] = useState<Record<string, NodeStat>>({});
  const [loading, setLoading] = useState(false);

  const getStartDate = (p: AnalyticsPeriod): string => {
    const now = new Date();
    if (p === "today") {
      now.setHours(0, 0, 0, 0);
    } else if (p === "7d") {
      now.setDate(now.getDate() - 7);
    } else {
      now.setDate(now.getDate() - 30);
    }
    return now.toISOString();
  };

  useEffect(() => {
    if (!selectedRuleId) { setNodeStats({}); return; }
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const { data: events } = await db
          .from("chatbot_node_events")
          .select("node_id, node_type, event_type")
          .eq("rule_id", selectedRuleId)
          .gte("created_at", getStartDate(period));

        const stats = (events as NodeEvent[] | null)?.reduce<Record<string, NodeStat>>((acc, e) => {
          if (!acc[e.node_id]) acc[e.node_id] = { entered: 0, exited: 0, abandoned: 0, error: 0 };
          const key = e.event_type as keyof NodeStat;
          if (key in acc[e.node_id]) acc[e.node_id][key]++;
          return acc;
        }, {});

        setNodeStats(stats ?? {});
      } catch (err) {
        console.error("Erro ao carregar eventos:", err);
        toast.error("Erro ao carregar analytics");
      } finally {
        setLoading(false);
      }
    };
    fetchEvents();
  }, [selectedRuleId, period]);

  const totalSessions = Object.values(nodeStats).reduce((s, n) => Math.max(s, n.entered), 0);
  const totalCompleted = Object.values(nodeStats).reduce((s, n) => s + n.exited, 0);
  const completionRate = totalSessions > 0 ? Math.round((totalCompleted / totalSessions) * 100) : 0;

  const abandonNode = Object.entries(nodeStats).reduce<{ id: string; count: number } | null>((best, [id, s]) => {
    if (!best || s.abandoned > best.count) return { id, count: s.abandoned };
    return best;
  }, null);

  const nodeList = Object.entries(nodeStats).sort((a, b) => b[1].entered - a[1].entered);

  const periodLabel: Record<AnalyticsPeriod, string> = { today: "Hoje", "7d": "7 dias", "30d": "30 dias" };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1 border border-border rounded-lg p-1">
          {(["today", "7d", "30d"] as AnalyticsPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                period === p ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {periodLabel[p]}
            </button>
          ))}
        </div>
        <Select value={selectedRuleId} onValueChange={setSelectedRuleId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Selecionar fluxo..." />
          </SelectTrigger>
          <SelectContent>
            {rules.map((r) => (
              <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Sessões", value: totalSessions, icon: Users, color: "text-blue-500" },
          { label: "Concluídas", value: totalCompleted, icon: CheckCircle, color: "text-emerald-500" },
          { label: "Taxa de Conclusão", value: `${completionRate}%`, icon: TrendingDown, color: "text-purple-500" },
          { label: "Nó com Mais Abandono", value: abandonNode ? abandonNode.id.slice(0, 12) + "…" : "—", icon: AlertTriangle, color: "text-orange-500" },
        ].map((s) => (
          <Card key={s.label} className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <s.icon className={cn("h-5 w-5", s.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-bold text-foreground truncate">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Funnel */}
      {!selectedRuleId ? (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <BarChart2 className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Selecione um fluxo</h3>
            <p className="text-sm text-muted-foreground mt-1">Escolha um fluxo acima para visualizar as métricas</p>
          </div>
        </Card>
      ) : loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : nodeList.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Activity className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Sem dados ainda</h3>
            <p className="text-sm text-muted-foreground mt-1">Nenhum evento registrado para este fluxo no período selecionado</p>
          </div>
        </Card>
      ) : (
        <Card className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground mb-4">Funil de Nós</h3>
          {nodeList.map(([nodeId, stat]) => {
            const dropoutPct = stat.entered > 0 ? Math.round((stat.abandoned / stat.entered) * 100) : 0;
            const barColor = dropoutPct < 10 ? "bg-emerald-500" : dropoutPct <= 30 ? "bg-yellow-500" : "bg-red-500";
            return (
              <div key={nodeId} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground truncate max-w-xs">{nodeId}</span>
                    <Badge variant="outline" className="text-xs">{stat.entered} entradas</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground text-xs">
                    <span>{stat.abandoned} abandonos</span>
                    <span className={cn("font-medium", dropoutPct < 10 ? "text-emerald-600" : dropoutPct <= 30 ? "text-yellow-600" : "text-red-600")}>
                      {dropoutPct}%
                    </span>
                  </div>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${dropoutPct}%` }} />
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
};

// ─── Gatilhos Tab ───
const EVENT_TYPE_META: Record<string, { label: string; emoji: string; color: string }> = {
  first_contact:        { label: "Primeiro Contato",        emoji: "🆕", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  birthday:             { label: "Aniversário",             emoji: "🎂", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" },
  inactivity:           { label: "Inatividade",             emoji: "😴", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  tag_added:            { label: "Tag Adicionada",          emoji: "🏷️", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  conversation_closed:  { label: "Conversa Encerrada",      emoji: "✅", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  campaign_sent:        { label: "Campanha Enviada",        emoji: "📧", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
};

const BLANK_TRIGGER: Omit<EventTrigger, "id" | "trigger_count" | "last_triggered_at" | "created_at"> = {
  name: "",
  event_type: "first_contact",
  rule_id: null,
  conditions: {},
  is_active: true,
};

const GatilhosTab = ({ rules }: { rules: ChatbotRule[] }) => {
  const [triggers, setTriggers] = useState<EventTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<EventTrigger | null>(null);
  const [form, setForm] = useState({ ...BLANK_TRIGGER });
  const [saving, setSaving] = useState(false);

  const loadTriggers = async () => {
    setLoading(true);
    const { data, error } = await db.from("event_triggers").select("*").order("created_at", { ascending: false });
    if (error) { toast.error("Erro ao carregar gatilhos"); }
    else { setTriggers((data as EventTrigger[]) || []); }
    setLoading(false);
  };

  useEffect(() => { loadTriggers(); }, []);

  const openNew = () => {
    setEditingTrigger(null);
    setForm({ ...BLANK_TRIGGER });
    setDialogOpen(true);
  };

  const openEdit = (t: EventTrigger) => {
    setEditingTrigger(t);
    setForm({
      name: t.name,
      event_type: t.event_type,
      rule_id: t.rule_id,
      conditions: t.conditions,
      is_active: t.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Informe um nome para o gatilho"); return; }
    setSaving(true);
    try {
      if (editingTrigger) {
        const { error } = await db.from("event_triggers").update({
          name: form.name,
          event_type: form.event_type,
          rule_id: form.rule_id,
          conditions: form.conditions,
          is_active: form.is_active,
        }).eq("id", editingTrigger.id);
        if (error) throw error;
        toast.success("Gatilho atualizado!");
      } else {
        const { error } = await db.from("event_triggers").insert({
          name: form.name,
          event_type: form.event_type,
          rule_id: form.rule_id,
          conditions: form.conditions,
          is_active: form.is_active,
        });
        if (error) throw error;
        toast.success("Gatilho criado!");
      }
      setDialogOpen(false);
      await loadTriggers();
    } catch {
      toast.error("Erro ao salvar gatilho");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await db.from("event_triggers").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir gatilho"); return; }
    toast.success("Gatilho excluído");
    setTriggers((prev) => prev.filter((t) => t.id !== id));
  };

  const handleToggle = async (t: EventTrigger) => {
    const { error } = await db.from("event_triggers").update({ is_active: !t.is_active }).eq("id", t.id);
    if (error) { toast.error("Erro ao atualizar status"); return; }
    setTriggers((prev) => prev.map((x) => x.id === t.id ? { ...x, is_active: !x.is_active } : x));
  };

  const setCondition = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, conditions: { ...prev.conditions, [key]: value } }));
  };

  const getConditionValue = (key: string): string => {
    const c = form.conditions as Record<string, string>;
    return c[key] ?? "";
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };

  const linkedRule = (ruleId: string | null) => rules.find((r) => r.id === ruleId)?.name ?? "—";

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Gatilhos de Evento</h2>
          <p className="text-sm text-muted-foreground">Execute fluxos automaticamente com base em eventos</p>
        </div>
        <Button variant="action" className="gap-2" onClick={openNew}>
          <Plus className="h-4 w-4" />
          Novo Gatilho
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : triggers.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Zap className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhum gatilho criado</h3>
            <p className="text-sm text-muted-foreground mt-1">Configure gatilhos para automações baseadas em eventos</p>
            <Button className="mt-4 gap-2" onClick={openNew}>
              <Plus className="h-4 w-4" />
              Novo Gatilho
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Evento</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fluxo Vinculado</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Disparos</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Último Disparo</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {triggers.map((t) => {
                const meta = EVENT_TYPE_META[t.event_type];
                return (
                  <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{t.name}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", meta?.color ?? "bg-muted text-muted-foreground")}>
                        <span>{meta?.emoji}</span>
                        {meta?.label ?? t.event_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{linkedRule(t.rule_id)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{t.trigger_count}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(t.last_triggered_at)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleToggle(t)} className="flex items-center gap-1.5 text-xs">
                        {t.is_active ? (
                          <><ToggleRight className="h-5 w-5 text-emerald-500" /><span className="text-emerald-600">Ativo</span></>
                        ) : (
                          <><ToggleLeft className="h-5 w-5 text-muted-foreground" /><span className="text-muted-foreground">Inativo</span></>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTrigger ? "Editar Gatilho" : "Novo Gatilho"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Nome</label>
              <Input
                placeholder="ex: Boas-vindas ao novo contato"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Tipo de Evento</label>
              <Select
                value={form.event_type}
                onValueChange={(v) => setForm((p) => ({ ...p, event_type: v, conditions: {} }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_TYPE_META).map(([value, meta]) => (
                    <SelectItem key={value} value={value}>
                      {meta.emoji} {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dynamic conditions */}
            {form.event_type === "inactivity" && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">Dias sem mensagem</label>
                <Input
                  type="number"
                  min={1}
                  placeholder="ex: 7"
                  value={getConditionValue("days")}
                  onChange={(e) => setCondition("days", e.target.value)}
                />
              </div>
            )}
            {form.event_type === "tag_added" && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">Tag</label>
                <Input
                  placeholder="ex: cliente_vip"
                  value={getConditionValue("tag")}
                  onChange={(e) => setCondition("tag", e.target.value)}
                />
              </div>
            )}
            {form.event_type === "campaign_sent" && (
              <div>
                <label className="text-sm font-medium text-foreground block mb-1">Campanha</label>
                <Input
                  placeholder="ex: Campanha de Boas-vindas"
                  value={getConditionValue("campaign")}
                  onChange={(e) => setCondition("campaign", e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Fluxo a Executar</label>
              <Select
                value={form.rule_id ?? "__none__"}
                onValueChange={(v) => setForm((p) => ({ ...p, rule_id: v === "__none__" ? null : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar fluxo..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {rules.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
                className="flex items-center gap-2 text-sm"
              >
                {form.is_active ? (
                  <ToggleRight className="h-6 w-6 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                )}
                <span className={form.is_active ? "text-emerald-600" : "text-muted-foreground"}>
                  {form.is_active ? "Ativo" : "Inativo"}
                </span>
              </button>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Default intents ───
const DEFAULT_INTENTS: Omit<IntentConfig, "id" | "match_count" | "created_at">[] = [
  {
    name: "Suporte Técnico",
    description: "Problemas técnicos com produtos ou serviços",
    examples: ["não funciona", "problema", "erro", "travou", "quebrou", "defeito"],
    route_to_rule_id: null,
    route_to_queue_id: null,
    confidence_threshold: 0.7,
    is_active: true,
  },
  {
    name: "Preço / Orçamento",
    description: "Perguntas sobre preços e orçamentos",
    examples: ["quanto custa", "preço", "valor", "orçamento", "desconto", "promoção"],
    route_to_rule_id: null,
    route_to_queue_id: null,
    confidence_threshold: 0.7,
    is_active: true,
  },
  {
    name: "Reclamação",
    description: "Clientes insatisfeitos com produto ou serviço",
    examples: ["insatisfeito", "péssimo", "horrível", "absurdo", "decepcionado", "nunca mais"],
    route_to_rule_id: null,
    route_to_queue_id: null,
    confidence_threshold: 0.7,
    is_active: true,
  },
  {
    name: "Informações",
    description: "Dúvidas gerais sobre produto ou serviço",
    examples: ["como funciona", "quero saber", "me explica", "dúvida", "informação"],
    route_to_rule_id: null,
    route_to_queue_id: null,
    confidence_threshold: 0.7,
    is_active: true,
  },
  {
    name: "Cancelamento",
    description: "Solicitações de cancelamento ou reembolso",
    examples: ["cancelar", "desistir", "não quero mais", "reembolso", "estorno"],
    route_to_rule_id: null,
    route_to_queue_id: null,
    confidence_threshold: 0.7,
    is_active: true,
  },
];

// ─── Intenções Tab ───
const IntencoesTab = ({ rules }: { rules: ChatbotRule[] }) => {
  const [intents, setIntents] = useState<IntentConfig[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIntent, setEditingIntent] = useState<IntentConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testResult, setTestResult] = useState<{ intent: IntentConfig; score: number } | null | "none">(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formExamples, setFormExamples] = useState<string[]>([]);
  const [formExampleInput, setFormExampleInput] = useState("");
  const [formRouteType, setFormRouteType] = useState<"rule" | "queue">("rule");
  const [formRuleId, setFormRuleId] = useState<string>("");
  const [formQueueId, setFormQueueId] = useState<string>("");
  const [formThreshold, setFormThreshold] = useState(70);
  const [formActive, setFormActive] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: intentData }, { data: queueData }] = await Promise.all([
        db.from("intent_configs").select("*").order("created_at", { ascending: true }),
        db.from("queues").select("id, name").order("name"),
      ]);
      const loadedIntents = (intentData as IntentConfig[]) || [];
      setIntents(loadedIntents);
      setQueues((queueData as Queue[]) || []);

      // Seed defaults if empty
      if (loadedIntents.length === 0) {
        const { data: seeded } = await db
          .from("intent_configs")
          .insert(DEFAULT_INTENTS as any)
          .select();
        if (seeded) setIntents(seeded as IntentConfig[]);
      }
    } catch (err) {
      console.error("Erro ao carregar intenções:", err);
      toast.error("Erro ao carregar intenções");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const openNew = () => {
    setEditingIntent(null);
    setFormName("");
    setFormDesc("");
    setFormExamples([]);
    setFormExampleInput("");
    setFormRouteType("rule");
    setFormRuleId("");
    setFormQueueId("");
    setFormThreshold(70);
    setFormActive(true);
    setDialogOpen(true);
  };

  const openEdit = (intent: IntentConfig) => {
    setEditingIntent(intent);
    setFormName(intent.name);
    setFormDesc(intent.description ?? "");
    setFormExamples(intent.examples);
    setFormExampleInput("");
    setFormRouteType(intent.route_to_queue_id ? "queue" : "rule");
    setFormRuleId(intent.route_to_rule_id ?? "");
    setFormQueueId(intent.route_to_queue_id ?? "");
    setFormThreshold(Math.round(intent.confidence_threshold * 100));
    setFormActive(intent.is_active);
    setDialogOpen(true);
  };

  const addExample = () => {
    const trimmed = formExampleInput.trim();
    if (!trimmed || formExamples.length >= 10 || formExamples.includes(trimmed)) return;
    setFormExamples((prev) => [...prev, trimmed]);
    setFormExampleInput("");
  };

  const removeExample = (ex: string) => {
    setFormExamples((prev) => prev.filter((e) => e !== ex));
  };

  const handleExampleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); addExample(); }
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error("Informe um nome para a intenção"); return; }
    if (formExamples.length === 0) { toast.error("Adicione ao menos um exemplo de frase"); return; }
    setSaving(true);
    try {
      const payload = {
        name: formName.trim(),
        description: formDesc.trim() || null,
        examples: formExamples,
        route_to_rule_id: formRouteType === "rule" && formRuleId ? formRuleId : null,
        route_to_queue_id: formRouteType === "queue" && formQueueId ? formQueueId : null,
        confidence_threshold: formThreshold / 100,
        is_active: formActive,
      };
      if (editingIntent) {
        const { error } = await db.from("intent_configs").update(payload as any).eq("id", editingIntent.id);
        if (error) throw error;
        toast.success("Intenção atualizada!");
      } else {
        const { error } = await db.from("intent_configs").insert(payload as any);
        if (error) throw error;
        toast.success("Intenção criada!");
      }
      setDialogOpen(false);
      await loadData();
    } catch {
      toast.error("Erro ao salvar intenção");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await db.from("intent_configs").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Intenção excluída");
    setIntents((prev) => prev.filter((i) => i.id !== id));
  };

  const handleToggle = async (intent: IntentConfig) => {
    const { error } = await db.from("intent_configs").update({ is_active: !intent.is_active } as any).eq("id", intent.id);
    if (error) { toast.error("Erro ao atualizar status"); return; }
    setIntents((prev) => prev.map((i) => i.id === intent.id ? { ...i, is_active: !i.is_active } : i));
  };

  const handleTest = () => {
    if (!testMessage.trim()) return;
    const result = classifyIntent(testMessage, intents);
    setTestResult(result ?? "none");
  };

  const getRouteName = (intent: IntentConfig) => {
    if (intent.route_to_rule_id) {
      return rules.find((r) => r.id === intent.route_to_rule_id)?.name ?? "Fluxo";
    }
    if (intent.route_to_queue_id) {
      return queues.find((q) => q.id === intent.route_to_queue_id)?.name ?? "Fila";
    }
    return "—";
  };

  const suggestedExamples: Record<string, string[]> = {
    "Suporte Técnico": ["não funciona", "problema técnico", "preciso de ajuda técnica"],
    "Preço / Orçamento": ["quanto custa", "quero um orçamento", "me passa o preço"],
    "Reclamação": ["estou insatisfeito", "produto horrível", "quero reclamar"],
    "Informações": ["como funciona", "me explica", "tenho uma dúvida"],
    "Cancelamento": ["quero cancelar", "solicitar reembolso", "não quero mais"],
  };

  const currentSuggestions = suggestedExamples[formName] ?? [];

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Detecção de Intenção por IA</h2>
          <p className="text-sm text-muted-foreground">Classifique automaticamente mensagens e redirecione para o fluxo correto</p>
        </div>
        <Button variant="action" className="gap-2" onClick={openNew}>
          <Plus className="h-4 w-4" />
          Nova Intenção
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-700 dark:text-blue-300">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>O sistema classifica automaticamente a primeira mensagem do contato e redireciona para o fluxo correto.</span>
      </div>

      {/* Test classification */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Shuffle className="h-4 w-4 text-violet-500" />
          Testar classificação
        </h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Digite uma mensagem para testar..."
            value={testMessage}
            onChange={(e) => { setTestMessage(e.target.value); setTestResult(null); }}
            onKeyDown={(e) => e.key === "Enter" && handleTest()}
            className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button variant="outline" size="sm" onClick={handleTest} disabled={!testMessage.trim()}>
            Testar
          </Button>
        </div>
        {testResult === "none" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted text-muted-foreground text-sm">
            <Brain className="h-4 w-4" />
            Nenhuma intenção detectada
          </div>
        )}
        {testResult && testResult !== "none" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-sm">
            <CheckCircle className="h-4 w-4" />
            Intenção detectada: <strong>{testResult.intent.name}</strong> ({Math.round(testResult.score * 100)}% confiança)
          </div>
        )}
      </Card>

      {/* Table */}
      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : intents.length === 0 ? (
        <Card className="p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Brain className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhuma intenção configurada</h3>
            <p className="text-sm text-muted-foreground mt-1">Crie intenções para classificar mensagens automaticamente</p>
            <Button className="mt-4 gap-2" onClick={openNew}>
              <Plus className="h-4 w-4" />
              Nova Intenção
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descrição</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exemplos</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rota para</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Confiança</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Disparos</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {intents.map((intent) => (
                <tr key={intent.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{intent.name}</td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[160px] truncate">{intent.description ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {intent.examples.slice(0, 3).map((ex) => (
                        <span key={ex} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">{ex}</span>
                      ))}
                      {intent.examples.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{intent.examples.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{getRouteName(intent)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{Math.round(intent.confidence_threshold * 100)}%</td>
                  <td className="px-4 py-3 text-muted-foreground">{intent.match_count}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggle(intent)} className="flex items-center gap-1.5 text-xs">
                      {intent.is_active ? (
                        <><ToggleRight className="h-5 w-5 text-emerald-500" /><span className="text-emerald-600">Ativo</span></>
                      ) : (
                        <><ToggleLeft className="h-5 w-5 text-muted-foreground" /><span className="text-muted-foreground">Inativo</span></>
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(intent)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(intent.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingIntent ? "Editar Intenção" : "Nova Intenção"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Nome */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Nome</label>
              <Input
                placeholder="ex: Suporte Técnico, Dúvida sobre preço..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {/* Descrição */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">Descrição</label>
              <Input
                placeholder="Descreva quando essa intenção deve ser ativada..."
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
              />
            </div>

            {/* Exemplos */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">
                Exemplos de frases <span className="text-muted-foreground text-xs">({formExamples.length}/10)</span>
              </label>
              <div className="flex gap-2 mb-2">
                <Input
                  placeholder="Digite uma frase e pressione Enter..."
                  value={formExampleInput}
                  onChange={(e) => setFormExampleInput(e.target.value)}
                  onKeyDown={handleExampleKeyDown}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={addExample} disabled={formExamples.length >= 10}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {/* Tags */}
              {formExamples.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {formExamples.map((ex) => (
                    <span key={ex} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-primary/10 text-primary border border-primary/20">
                      {ex}
                      <button onClick={() => removeExample(ex)} className="hover:text-destructive transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* Suggested examples */}
              {currentSuggestions.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Sugestões:</p>
                  <div className="flex flex-wrap gap-1">
                    {currentSuggestions.filter((s) => !formExamples.includes(s)).map((s) => (
                      <button
                        key={s}
                        onClick={() => { if (formExamples.length < 10) setFormExamples((prev) => [...prev, s]); }}
                        className="inline-flex items-center px-2 py-0.5 rounded text-xs border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Route */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Redirecionar para</label>
              <div className="flex gap-3 mb-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formRouteType === "rule"} onChange={() => setFormRouteType("rule")} className="accent-primary" />
                  <span className="text-sm">Fluxo de chatbot</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={formRouteType === "queue"} onChange={() => setFormRouteType("queue")} className="accent-primary" />
                  <span className="text-sm">Fila de atendimento</span>
                </label>
              </div>
              {formRouteType === "rule" && (
                <Select value={formRuleId || "__none__"} onValueChange={(v) => setFormRuleId(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar fluxo..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum</SelectItem>
                    {rules.filter((r) => r.is_active).map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {formRouteType === "queue" && (
                <Select value={formQueueId || "__none__"} onValueChange={(v) => setFormQueueId(v === "__none__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar fila..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhuma</SelectItem>
                    {queues.map((q) => (
                      <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Threshold */}
            <div>
              <label className="text-sm font-medium text-foreground block mb-1">
                Limiar de confiança: <span className="text-primary font-semibold">{formThreshold}%</span>
              </label>
              <p className="text-xs text-muted-foreground mb-2">Classificar apenas se confiança ≥ {formThreshold}%</p>
              <input
                type="range"
                min={50}
                max={95}
                step={5}
                value={formThreshold}
                onChange={(e) => setFormThreshold(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                <span>50%</span>
                <span>95%</span>
              </div>
            </div>

            {/* Active */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFormActive((p) => !p)}
                className="flex items-center gap-2 text-sm"
              >
                {formActive ? (
                  <ToggleRight className="h-6 w-6 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-6 w-6 text-muted-foreground" />
                )}
                <span className={formActive ? "text-emerald-600" : "text-muted-foreground"}>
                  {formActive ? "Ativo" : "Inativo"}
                </span>
              </button>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Main Component ───
type BotsTab = "fluxos" | "analytics" | "gatilhos" | "intencoes";

const Bots = () => {
  const [rules, setRules] = useState<ChatbotRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<BotsTab>("fluxos");
  const [view, setView] = useState<"list" | "editor">("list");
  const [editingRule, setEditingRule] = useState<ChatbotRule | null>(null);
  const [testingRule, setTestingRule] = useState<ChatbotRule | null>(null);

  const loadRules = async () => {
    try {
      const { data, error } = await db
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

  // Note: db/functions/chatbot/index.ts should also handle variations
  // by picking a random variation when executing message nodes
  const handleSaveFlow = async (name: string, nodes: FlowNode[], connections: FlowConnection[], triggerType: string, isActive: boolean) => {
    try {
      if (editingRule) {
        const { error } = await db
          .from("chatbot_rules")
          .update({ name, flow_data: { nodes, connections }, trigger_type: triggerType, is_active: isActive } as any)
          .eq("id", editingRule.id);

        if (error) throw error;
        toast.success("Fluxo atualizado!");
      } else {
        const { error } = await db.from("chatbot_rules").insert({
          name,
          trigger_type: triggerType,
          response_text: "Fluxo automático",
          is_active: isActive,
          priority: 5,
          flow_data: { nodes, connections },
        } as any);

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

  const tabs: { id: BotsTab; label: string; icon: React.ElementType }[] = [
    { id: "fluxos", label: "Fluxos", icon: Bot },
    { id: "analytics", label: "Analytics", icon: BarChart2 },
    { id: "gatilhos", label: "Gatilhos", icon: Zap },
    { id: "intencoes", label: "Intenções", icon: Brain },
  ];

  return (
    <div className="flex flex-col h-screen">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border px-6 bg-card shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "fluxos" && (
          <FlowListView
            rules={rules}
            loading={loading}
            onNewFlow={handleNewFlow}
            onEditFlow={handleEditFlow}
            onTestFlow={(rule) => setTestingRule(rule)}
          />
        )}
        {activeTab === "analytics" && <AnalyticsTab rules={rules} />}
        {activeTab === "gatilhos" && <GatilhosTab rules={rules} />}
        {activeTab === "intencoes" && <IntencoesTab rules={rules} />}
      </div>

      {/* Test modal */}
      {testingRule && (
        <ChatbotTestModal
          open={!!testingRule}
          onClose={() => setTestingRule(null)}
          rule={testingRule}
        />
      )}
    </div>
  );
};

export default Bots;
