import { useState, useRef, useCallback, useEffect } from "react";
import {
  Plus, Minus, Maximize2,
  MessageSquare, Image, HelpCircle, CheckCircle, List, Menu,
  Columns2, GitBranch, Clock3, Timer, Variable, Webhook, Sparkles,
  Zap, Tag, FileText, StickyNote, Building2, UserPlus, ArrowRightLeft,
  XCircle, Flag, Play, Trash2, Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ─── Types ───
export interface FlowNode {
  id: string;
  type: "start" | "message" | "input" | "condition" | "menu" | "transfer" | "end" | "delay" | "tag" | "ai"
    | string;
  x: number;
  y: number;
  data: {
    label: string;
    content?: string;
    options?: string[];
    variations?: string[];
    selection_mode?: "random" | "sequential";
    use_variations?: boolean;
    [key: string]: unknown;
  };
}

export interface FlowConnection {
  id: string;
  from: string;
  to: string;
  label?: string;
}

interface FlowCanvasProps {
  nodes: FlowNode[];
  connections: FlowConnection[];
  onChange: (nodes: FlowNode[], connections: FlowConnection[]) => void;
  readOnly?: boolean;
}

// ─── Node type metadata ───
const NODE_TYPES: {
  type: string;
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  border: string;
}[] = [
  { type: "start",     label: "Início",      icon: Play,           color: "#22c55e", bg: "bg-emerald-500/15", border: "border-emerald-500/60" },
  { type: "message",   label: "Mensagem",    icon: MessageSquare,  color: "#3b82f6", bg: "bg-blue-500/15",    border: "border-blue-500/60" },
  { type: "input",     label: "Entrada",     icon: HelpCircle,     color: "#a855f7", bg: "bg-purple-500/15",  border: "border-purple-500/60" },
  { type: "condition", label: "Condição",    icon: GitBranch,      color: "#f97316", bg: "bg-orange-500/15",  border: "border-orange-500/60" },
  { type: "menu",      label: "Menu",        icon: List,           color: "#14b8a6", bg: "bg-teal-500/15",    border: "border-teal-500/60" },
  { type: "transfer",  label: "Transferir",  icon: ArrowRightLeft, color: "#eab308", bg: "bg-yellow-500/15",  border: "border-yellow-500/60" },
  { type: "end",       label: "Fim",         icon: Flag,           color: "#ef4444", bg: "bg-red-500/15",     border: "border-red-500/60" },
  { type: "delay",     label: "Delay",       icon: Timer,          color: "#f97316", bg: "bg-orange-500/15",  border: "border-orange-500/60" },
  { type: "tag",       label: "Tag",         icon: Tag,            color: "#ec4899", bg: "bg-pink-500/15",    border: "border-pink-500/60" },
  { type: "ai",        label: "IA / ChatGPT",icon: Sparkles,       color: "#8b5cf6", bg: "bg-violet-500/15",  border: "border-violet-500/60" },
  // extras carried from existing Bots.tsx palette
  { type: "media",     label: "Mídia",       icon: Image,          color: "#6366f1", bg: "bg-indigo-500/15",  border: "border-indigo-500/60" },
  { type: "validation",label: "Validação",   icon: CheckCircle,    color: "#22c55e", bg: "bg-green-500/15",   border: "border-green-500/60" },
  { type: "menu_text", label: "Menu Texto",  icon: Menu,           color: "#14b8a6", bg: "bg-teal-500/15",    border: "border-teal-500/60" },
  { type: "buttons",   label: "Botões",      icon: Columns2,       color: "#06b6d4", bg: "bg-cyan-500/15",    border: "border-cyan-500/60" },
  { type: "schedule",  label: "Horário",     icon: Clock3,         color: "#f59e0b", bg: "bg-amber-500/15",   border: "border-amber-500/60" },
  { type: "variable",  label: "Variável",    icon: Variable,       color: "#8b5cf6", bg: "bg-violet-500/15",  border: "border-violet-500/60" },
  { type: "chatgpt",   label: "ChatGPT",     icon: Sparkles,       color: "#10b981", bg: "bg-emerald-500/15", border: "border-emerald-500/60" },
  { type: "webhook",   label: "Webhook",     icon: Webhook,        color: "#ef4444", bg: "bg-red-500/15",     border: "border-red-500/60" },
  { type: "field",     label: "Campo",       icon: FileText,       color: "#84cc16", bg: "bg-lime-500/15",    border: "border-lime-500/60" },
  { type: "note",      label: "Nota",        icon: StickyNote,     color: "#eab308", bg: "bg-yellow-500/15",  border: "border-yellow-500/60" },
  { type: "department",label: "Departamento",icon: Building2,      color: "#d946ef", bg: "bg-fuchsia-500/15", border: "border-fuchsia-500/60" },
  { type: "assign",    label: "Atribuir",    icon: UserPlus,       color: "#ec4899", bg: "bg-pink-500/15",    border: "border-pink-500/60" },
  { type: "close",     label: "Encerrar",    icon: XCircle,        color: "#ef4444", bg: "bg-red-500/15",     border: "border-red-500/60" },
  { type: "question",  label: "Pergunta",    icon: HelpCircle,     color: "#ec4899", bg: "bg-pink-500/15",    border: "border-pink-500/60" },
  { type: "list",      label: "Lista",       icon: List,           color: "#0ea5e9", bg: "bg-sky-500/15",     border: "border-sky-500/60" },
  { type: "zap",       label: "Ação",        icon: Zap,            color: "#10b981", bg: "bg-emerald-500/15", border: "border-emerald-500/60" },
];

const getNodeMeta = (type: string) =>
  NODE_TYPES.find((n) => n.type === type) ?? {
    type,
    label: type,
    icon: MessageSquare,
    color: "#64748b",
    bg: "bg-muted",
    border: "border-border",
  };

// ─── NODE_W / NODE_H used for connection calc ───
const NODE_W = 160;
const NODE_H = 60;

// ─── Properties Panel ───
const PropertiesPanel = ({
  node,
  onUpdate,
}: {
  node: FlowNode;
  onUpdate: (id: string, data: FlowNode["data"]) => void;
}) => {
  const meta = getNodeMeta(node.type);
  const Icon = meta.icon;
  const d = node.data;

  const updateField = (key: string, value: string | string[]) => {
    onUpdate(node.id, { ...d, [key]: value });
  };

  const field = (label: string, key: string, placeholder?: string) => (
    <div key={key}>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      <Input
        value={(d[key] as string) ?? ""}
        onChange={(e) => updateField(key, e.target.value)}
        placeholder={placeholder ?? label}
        className="h-8 text-sm"
      />
    </div>
  );

  const textarea = (label: string, key: string, placeholder?: string, rows = 3) => (
    <div key={key}>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      <Textarea
        value={(d[key] as string) ?? ""}
        onChange={(e) => updateField(key, e.target.value)}
        placeholder={placeholder ?? label}
        rows={rows}
        className="text-sm resize-none"
      />
    </div>
  );

  const renderFields = () => {
    switch (node.type) {
      case "start":
        return <p className="text-xs text-muted-foreground">Nó de início do fluxo.</p>;
      case "end":
      case "close":
        return <p className="text-xs text-muted-foreground">Este nó encerra o fluxo.</p>;
      case "message": {
        const useVariations = !!(d.use_variations);
        const variations = (d.variations as string[] | undefined) ?? ["", ""];
        const selectionMode = (d.selection_mode as string | undefined) ?? "random";

        const updateVariation = (index: number, value: string) => {
          const newVars = [...variations];
          newVars[index] = value;
          updateField("variations", newVars);
        };

        const addVariation = () => {
          if (variations.length >= 5) return;
          updateField("variations", [...variations, ""]);
        };

        const removeVariation = (index: number) => {
          if (variations.length <= 1) return;
          const newVars = variations.filter((_, i) => i !== index);
          updateField("variations", newVars);
        };

        return (
          <>
            {/* Usar variações toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const next = !useVariations;
                  updateField("use_variations", next);
                  if (next && (!d.variations || (d.variations as string[]).length === 0)) {
                    updateField("variations", ["", ""]);
                  }
                }}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  useVariations ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                    useVariations ? "translate-x-4" : "translate-x-0"
                  )}
                />
              </button>
              <span className="text-xs font-medium text-foreground">Usar variações</span>
            </div>

            {!useVariations ? (
              textarea("Mensagem", "content", "Digite a mensagem...")
            ) : (
              <>
                <div className="space-y-2">
                  {variations.map((v, i) => (
                    <div key={i} className="flex gap-1 items-start">
                      <div className="flex-1">
                        <label className="text-xs font-medium text-muted-foreground block mb-1">Variação {i + 1}</label>
                        <Textarea
                          value={v}
                          onChange={(e) => updateVariation(i, e.target.value)}
                          placeholder={`Mensagem alternativa ${i + 1}...`}
                          rows={2}
                          className="text-sm resize-none"
                        />
                      </div>
                      {variations.length > 1 && (
                        <button
                          onClick={() => removeVariation(i)}
                          className="mt-5 h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {variations.length < 5 && (
                  <button
                    onClick={addVariation}
                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar variação
                  </button>
                )}
                <p className="text-xs text-muted-foreground">Esta mensagem terá {variations.filter(v => v.trim()).length || variations.length} variações</p>
                {/* Mode selector */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Modo de seleção</label>
                  <div className="flex gap-2">
                    {(["random", "sequential"] as const).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => updateField("selection_mode", mode)}
                        className={cn(
                          "flex-1 py-1.5 text-xs rounded-md border transition-colors",
                          selectionMode === mode
                            ? "bg-primary text-primary-foreground border-primary"
                            : "text-muted-foreground border-border hover:border-primary/50"
                        )}
                      >
                        {mode === "random" ? "Aleatório" : "Sequencial"}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        );
      }
      case "input":
      case "question":
        return (
          <>
            {textarea("Pergunta", "content", "Digite a pergunta...")}
            {field("Variável para salvar resposta", "variable", "ex: resposta")}
          </>
        );
      case "condition":
        return (
          <>
            {field("Variável", "variable", "ex: {{resposta}}")}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Operador</label>
              <Select
                value={(d.operator as string) ?? "igual"}
                onValueChange={(v) => updateField("operator", v)}
              >
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
      case "menu":
      case "menu_text":
      case "buttons": {
        const optStr = Array.isArray(d.options)
          ? (d.options as string[]).join("\n")
          : (d.options as string) ?? "";
        return (
          <>
            {textarea("Texto do Menu", "content", "Escolha uma opção:")}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                Opções (uma por linha)
              </label>
              <Textarea
                value={optStr}
                onChange={(e) =>
                  updateField("options", e.target.value.split("\n"))
                }
                placeholder={"Opção 1\nOpção 2\nOpção 3"}
                rows={4}
                className="text-sm resize-none"
              />
            </div>
          </>
        );
      }
      case "delay":
        return (
          <>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Duração</label>
              <Input
                type="number"
                value={(d.duration as string) ?? ""}
                onChange={(e) => updateField("duration", e.target.value)}
                placeholder="ex: 5"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Unidade</label>
              <Select
                value={(d.unit as string) ?? "seconds"}
                onValueChange={(v) => updateField("unit", v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="seconds">Segundos</SelectItem>
                  <SelectItem value="minutes">Minutos</SelectItem>
                  <SelectItem value="hours">Horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        );
      case "transfer":
        return field("Fila / Agente", "queue", "ex: Suporte Técnico");
      case "tag":
        return field("Nome da tag", "tag", "ex: cliente_vip");
      case "ai":
      case "chatgpt":
        return (
          <>
            {textarea("Prompt do sistema", "prompt", "Você é um assistente...", 4)}
            {field("Salvar resposta em", "saveAs", "ex: resposta_ia")}
          </>
        );
      case "variable":
        return (
          <>
            {field("Nome da variável", "variable", "ex: nome_usuario")}
            {field("Valor", "value", "ex: {{input}}")}
          </>
        );
      case "webhook":
        return (
          <>
            {field("URL", "url", "https://api.exemplo.com/webhook")}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Método</label>
              <Select
                value={(d.method as string) ?? "POST"}
                onValueChange={(v) => updateField("method", v)}
              >
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
      case "note":
        return textarea("Anotação", "content", "Digite a anotação...");
      case "department":
        return field("Departamento", "department", "ex: Suporte");
      case "assign":
        return field("Agente", "agent", "ex: agente@empresa.com");
      case "media":
        return (
          <>
            {field("URL da Mídia", "url", "https://")}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Tipo</label>
              <Select
                value={(d.mediaType as string) ?? "imagem"}
                onValueChange={(v) => updateField("mediaType", v)}
              >
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
      default:
        return <p className="text-xs text-muted-foreground">Sem campos editáveis para este tipo.</p>;
    }
  };

  return (
    <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className={cn("flex items-center gap-2 px-4 py-3 border-b border-border shrink-0", meta.bg)}
      >
        <div
          className="h-7 w-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: meta.color + "33" }}
        >
          <Icon className="h-4 w-4" style={{ color: meta.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <Input
            value={d.label}
            onChange={(e) => updateField("label", e.target.value)}
            className="h-7 text-sm font-medium border-none bg-transparent p-0 focus-visible:ring-0"
          />
          <p className="text-xs text-muted-foreground">{meta.label}</p>
        </div>
      </div>
      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">{renderFields()}</div>
    </div>
  );
};

// ─── Add Node Toolbar ───
const ADD_TYPES = [
  "message", "input", "condition", "menu", "delay", "tag", "ai", "transfer", "end",
];

// ─── Main FlowCanvas ───
export function FlowCanvas({ nodes, connections, onChange, readOnly = false }: FlowCanvasProps) {
  // ─── Canvas state ───
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedConnId, setSelectedConnId] = useState<string | null>(null);

  // ─── Drag node ───
  const draggingNode = useRef<{ id: string; startX: number; startY: number; mouseX: number; mouseY: number } | null>(null);
  // ─── Pan canvas ───
  const panningRef = useRef<{ startMouseX: number; startMouseY: number; startPanX: number; startPanY: number } | null>(null);
  // ─── Connection drawing ───
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ─── Helpers ───
  const updateNodes = (newNodes: FlowNode[]) => onChange(newNodes, connections);
  const updateConnections = (newConns: FlowConnection[]) => onChange(nodes, newConns);

  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan, zoom]
  );

  // ─── Delete selected ───
  useEffect(() => {
    if (readOnly) return;
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedNodeId && selectedNodeId !== "start") {
          const newNodes = nodes.filter((n) => n.id !== selectedNodeId);
          const newConns = connections.filter(
            (c) => c.from !== selectedNodeId && c.to !== selectedNodeId
          );
          onChange(newNodes, newConns);
          setSelectedNodeId(null);
        }
        if (selectedConnId) {
          updateConnections(connections.filter((c) => c.id !== selectedConnId));
          setSelectedConnId(null);
        }
      }
      if (e.key === "Escape") {
        setConnectingFrom(null);
        setSelectedNodeId(null);
        setSelectedConnId(null);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId, selectedConnId, nodes, connections, readOnly]);

  // ─── Mouse events ───
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const pos = toCanvas(e.clientX, e.clientY);
      setMousePos(pos);

      if (draggingNode.current) {
        const dx = (e.clientX - draggingNode.current.mouseX) / zoom;
        const dy = (e.clientY - draggingNode.current.mouseY) / zoom;
        draggingNode.current.mouseX = e.clientX;
        draggingNode.current.mouseY = e.clientY;
        onChange(
          nodes.map((n) =>
            n.id === draggingNode.current!.id
              ? { ...n, x: n.x + dx, y: n.y + dy }
              : n
          ),
          connections
        );
        return;
      }

      if (panningRef.current) {
        const dx = e.clientX - panningRef.current.startMouseX;
        const dy = e.clientY - panningRef.current.startMouseY;
        setPan({
          x: panningRef.current.startPanX + dx,
          y: panningRef.current.startPanY + dy,
        });
      }
    },
    [nodes, connections, onChange, toCanvas, zoom]
  );

  const handleMouseUp = useCallback(() => {
    draggingNode.current = null;
    panningRef.current = null;
  }, []);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (connectingFrom) {
      setConnectingFrom(null);
      return;
    }
    setSelectedNodeId(null);
    setSelectedConnId(null);
    panningRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
    };
  };

  // ─── Wheel zoom ───
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => Math.max(0.3, Math.min(2.5, z * delta)));
    },
    []
  );

  // ─── Fit view ───
  const fitView = () => {
    if (nodes.length === 0) return;
    const minX = Math.min(...nodes.map((n) => n.x));
    const minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + NODE_W));
    const maxY = Math.max(...nodes.map((n) => n.y + NODE_H));
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cw = rect.width - 280; // minus panel width
    const ch = rect.height;
    const scaleX = cw / (maxX - minX + 80);
    const scaleY = ch / (maxY - minY + 80);
    const newZoom = Math.max(0.3, Math.min(1.5, Math.min(scaleX, scaleY)));
    setZoom(newZoom);
    setPan({
      x: (cw - (maxX - minX) * newZoom) / 2 - minX * newZoom,
      y: (ch - (maxY - minY) * newZoom) / 2 - minY * newZoom,
    });
  };

  // ─── Add node ───
  const addNode = (type: string) => {
    if (readOnly) return;
    const meta = getNodeMeta(type);
    const rect = containerRef.current?.getBoundingClientRect();
    const cx = rect ? (rect.width / 2 - pan.x) / zoom - NODE_W / 2 : 200;
    const cy = rect ? (rect.height / 2 - pan.y) / zoom - NODE_H / 2 : 200;
    const newNode: FlowNode = {
      id: `node-${Date.now()}`,
      type,
      x: cx + (Math.random() - 0.5) * 80,
      y: cy + (Math.random() - 0.5) * 80,
      data: { label: meta.label },
    };
    updateNodes([...nodes, newNode]);
  };

  // ─── Connection logic ───
  const handleOutputDotClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (readOnly) return;
    if (connectingFrom === nodeId) {
      setConnectingFrom(null);
    } else {
      setConnectingFrom(nodeId);
    }
  };

  const handleInputDotClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (readOnly || !connectingFrom || connectingFrom === nodeId) {
      setConnectingFrom(null);
      return;
    }
    // avoid duplicate
    if (!connections.some((c) => c.from === connectingFrom && c.to === nodeId)) {
      const newConn: FlowConnection = {
        id: `conn-${Date.now()}`,
        from: connectingFrom,
        to: nodeId,
      };
      updateConnections([...connections, newConn]);
    }
    setConnectingFrom(null);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (readOnly) return;
    setSelectedNodeId(nodeId);
    setSelectedConnId(null);
    draggingNode.current = {
      id: nodeId,
      startX: e.clientX,
      startY: e.clientY,
      mouseX: e.clientX,
      mouseY: e.clientY,
    };
  };

  const handleNodeClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (connectingFrom && connectingFrom !== nodeId) {
      // treat click on node body as connecting to input dot
      if (!connections.some((c) => c.from === connectingFrom && c.to === nodeId)) {
        const newConn: FlowConnection = {
          id: `conn-${Date.now()}`,
          from: connectingFrom,
          to: nodeId,
        };
        updateConnections([...connections, newConn]);
      }
      setConnectingFrom(null);
      return;
    }
    setSelectedNodeId(nodeId);
    setSelectedConnId(null);
    setConnectingFrom(null);
  };

  // ─── Connection path ───
  const getConnectionPath = (from: FlowNode, to: FlowNode) => {
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const dx = Math.abs(x2 - x1) * 0.5;
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  // ─── Temp line while connecting ───
  const connectingNode = nodes.find((n) => n.id === connectingFrom);
  const tempPath = connectingNode
    ? (() => {
        const x1 = connectingNode.x + NODE_W;
        const y1 = connectingNode.y + NODE_H / 2;
        const x2 = mousePos.x;
        const y2 = mousePos.y;
        const dx = Math.abs(x2 - x1) * 0.5;
        return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      })()
    : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card shrink-0 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground mr-1">Adicionar:</span>
          {ADD_TYPES.map((type) => {
            const meta = getNodeMeta(type);
            const Icon = meta.icon;
            return (
              <button
                key={type}
                onClick={() => addNode(type)}
                title={meta.label}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors hover:opacity-90",
                  meta.bg,
                  meta.border
                )}
                style={{ color: meta.color }}
              >
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))}
              title="Aproximar"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))}
              title="Afastar"
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              onClick={fitView}
              title="Ajustar tela"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs text-muted-foreground w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden select-none"
          style={{ cursor: panningRef.current ? "grabbing" : connectingFrom ? "crosshair" : "default" }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onMouseDown={handleCanvasMouseDown}
          onWheel={handleWheel}
        >
          {/* Dot grid */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 0 }}
          >
            <defs>
              <pattern id="fc-dot-grid" x={pan.x % (20 * zoom)} y={pan.y % (20 * zoom)} width={20 * zoom} height={20 * zoom} patternUnits="userSpaceOnUse">
                <circle cx={1} cy={1} r={0.8} fill="hsl(var(--muted-foreground) / 0.18)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#fc-dot-grid)" />
          </svg>

          {/* SVG layer for connections */}
          <svg
            ref={svgRef}
            className="absolute inset-0 w-full h-full"
            style={{ zIndex: 1 }}
          >
            <defs>
              <marker id="fc-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="hsl(var(--primary) / 0.7)" />
              </marker>
              <marker id="fc-arrow-sel" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="hsl(var(--primary))" />
              </marker>
            </defs>
            <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
              {/* Connections */}
              {connections.map((conn) => {
                const fromNode = nodes.find((n) => n.id === conn.from);
                const toNode = nodes.find((n) => n.id === conn.to);
                if (!fromNode || !toNode) return null;
                const d = getConnectionPath(fromNode, toNode);
                const isSelected = conn.id === selectedConnId;
                return (
                  <g
                    key={conn.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedConnId(conn.id);
                      setSelectedNodeId(null);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    {/* invisible wide hit area */}
                    <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
                    <path
                      d={d}
                      fill="none"
                      stroke={isSelected ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.5)"}
                      strokeWidth={isSelected ? 2.5 : 2}
                      strokeDasharray={isSelected ? "6 3" : undefined}
                      markerEnd={isSelected ? "url(#fc-arrow-sel)" : "url(#fc-arrow)"}
                    />
                    {/* Connection label */}
                    {conn.label && (() => {
                      const mx = (fromNode.x + NODE_W + toNode.x) / 2;
                      const my = (fromNode.y + toNode.y) / 2 + NODE_H / 2;
                      return (
                        <text x={mx} y={my} textAnchor="middle" className="text-xs" fill="hsl(var(--muted-foreground))" fontSize={11}>
                          {conn.label}
                        </text>
                      );
                    })()}
                  </g>
                );
              })}

              {/* Temp connecting line */}
              {tempPath && (
                <path
                  d={tempPath}
                  fill="none"
                  stroke="hsl(var(--primary) / 0.6)"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  style={{ pointerEvents: "none" }}
                />
              )}

              {/* Selected connection delete hint */}
              {selectedConnId && (() => {
                const conn = connections.find((c) => c.id === selectedConnId);
                const fromNode = conn && nodes.find((n) => n.id === conn.from);
                const toNode = conn && nodes.find((n) => n.id === conn.to);
                if (!fromNode || !toNode || !conn) return null;
                const mx = (fromNode.x + NODE_W + toNode.x) / 2;
                const my = (fromNode.y + toNode.y) / 2 + NODE_H / 2 - 18;
                return (
                  <g
                    transform={`translate(${mx - 36}, ${my})`}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateConnections(connections.filter((c) => c.id !== selectedConnId));
                      setSelectedConnId(null);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <rect x={0} y={0} width={72} height={20} rx={10} fill="hsl(var(--destructive))" opacity={0.9} />
                    <text x={36} y={14} textAnchor="middle" fill="white" fontSize={11} fontWeight={500}>
                      Excluir
                    </text>
                  </g>
                );
              })()}

              {/* Nodes */}
              {nodes.map((node) => {
                const meta = getNodeMeta(node.type);
                const Icon = meta.icon;
                const isSelected = node.id === selectedNodeId;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    onMouseDown={(e) => handleNodeMouseDown(e as unknown as React.MouseEvent, node.id)}
                    onClick={(e) => handleNodeClick(e as unknown as React.MouseEvent, node.id)}
                    style={{ cursor: draggingNode.current?.id === node.id ? "grabbing" : "grab" }}
                  >
                    {/* Node body */}
                    <rect
                      x={0}
                      y={0}
                      width={NODE_W}
                      height={NODE_H}
                      rx={10}
                      fill={meta.color + "18"}
                      stroke={isSelected ? "hsl(var(--primary))" : meta.color + "99"}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                    />
                    {/* Selection glow */}
                    {isSelected && (
                      <rect
                        x={-3}
                        y={-3}
                        width={NODE_W + 6}
                        height={NODE_H + 6}
                        rx={13}
                        fill="none"
                        stroke="hsl(var(--primary) / 0.25)"
                        strokeWidth={4}
                      />
                    )}
                    {/* Icon bg */}
                    <rect x={10} y={12} width={36} height={36} rx={8} fill={meta.color + "33"} />
                    {/* Icon (foreign object for lucide) */}
                    <foreignObject x={10} y={12} width={36} height={36}>
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon style={{ width: 18, height: 18, color: meta.color }} />
                      </div>
                    </foreignObject>
                    {/* Label */}
                    <text
                      x={54}
                      y={28}
                      fontSize={12}
                      fontWeight={600}
                      fill="hsl(var(--foreground))"
                    >
                      {node.data.label.length > 14
                        ? node.data.label.slice(0, 13) + "…"
                        : node.data.label}
                    </text>
                    {/* Type badge / variations badge */}
                    {node.type === "message" && node.data.use_variations && (node.data.variations as string[] | undefined)?.filter(v => v).length ? (
                      <>
                        <text x={54} y={44} fontSize={10} fill={meta.color}>
                          {meta.label}
                        </text>
                        <foreignObject x={54} y={46} width={100} height={16}>
                          <div className="flex items-center gap-0.5">
                            <Layers style={{ width: 9, height: 9, color: meta.color }} />
                            <span style={{ fontSize: 9, color: meta.color, fontWeight: 600 }}>
                              {(node.data.variations as string[]).filter(v => v).length} variações
                            </span>
                          </div>
                        </foreignObject>
                      </>
                    ) : (
                      <text
                        x={54}
                        y={44}
                        fontSize={10}
                        fill={meta.color}
                      >
                        {meta.label}
                      </text>
                    )}

                    {/* Input dot (left) */}
                    {node.type !== "start" && (
                      <circle
                        cx={0}
                        cy={NODE_H / 2}
                        r={6}
                        fill={connectingFrom && connectingFrom !== node.id ? "hsl(var(--primary))" : "#3b82f6"}
                        stroke="hsl(var(--background))"
                        strokeWidth={2}
                        style={{ cursor: "crosshair" }}
                        onClick={(e) => handleInputDotClick(e as unknown as React.MouseEvent, node.id)}
                      />
                    )}

                    {/* Output dot (right) */}
                    <circle
                      cx={NODE_W}
                      cy={NODE_H / 2}
                      r={6}
                      fill={connectingFrom === node.id ? "hsl(var(--primary))" : "#22c55e"}
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                      style={{ cursor: "crosshair" }}
                      onClick={(e) => handleOutputDotClick(e as unknown as React.MouseEvent, node.id)}
                    />

                    {/* Delete button */}
                    {isSelected && node.id !== "start" && !readOnly && (
                      <g
                        transform={`translate(${NODE_W - 10}, -10)`}
                        onClick={(e) => {
                          e.stopPropagation();
                          const newNodes = nodes.filter((n) => n.id !== node.id);
                          const newConns = connections.filter(
                            (c) => c.from !== node.id && c.to !== node.id
                          );
                          onChange(newNodes, newConns);
                          setSelectedNodeId(null);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <circle cx={0} cy={0} r={9} fill="hsl(var(--destructive))" />
                        <foreignObject x={-8} y={-8} width={16} height={16}>
                          <div className="w-full h-full flex items-center justify-center">
                            <Trash2 style={{ width: 10, height: 10, color: "white" }} />
                          </div>
                        </foreignObject>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Connecting hint */}
          {connectingFrom && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded-full pointer-events-none shadow">
              Clique em outro nó para conectar — ESC para cancelar
            </div>
          )}

          {/* Selected connection hint */}
          {selectedConnId && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-muted text-foreground text-xs rounded-full pointer-events-none shadow">
              Conexão selecionada — Delete para excluir
            </div>
          )}

          {/* Zoom/fit controls bottom-right */}
          <div className="absolute bottom-4 right-4 flex flex-col gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-card/80 backdrop-blur-sm"
              onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-card/80 backdrop-blur-sm"
              onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 bg-card/80 backdrop-blur-sm"
              onClick={fitView}
              title="Ajustar tela"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Minimap */}
          <div className="absolute bottom-4 right-44 w-36 h-24 rounded-lg bg-card/80 border border-border backdrop-blur-sm overflow-hidden">
            <svg width="100%" height="100%" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet">
              {nodes.map((n) => (
                <rect
                  key={n.id}
                  x={n.x * 0.5}
                  y={n.y * 0.5}
                  width={NODE_W * 0.5}
                  height={NODE_H * 0.5}
                  rx={3}
                  fill={getNodeMeta(n.type).color + "88"}
                />
              ))}
            </svg>
          </div>
        </div>

        {/* Properties panel */}
        {selectedNode && !readOnly && (
          <PropertiesPanel
            node={selectedNode}
            onUpdate={(id, data) => {
              onChange(
                nodes.map((n) => (n.id === id ? { ...n, data } : n)),
                connections
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
