import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  GitBranch, Plus, Trash2, Save, Play, Square, Link, Unlink, ZapOff
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FlowNode {
  id: string;
  type: string;
  x: number;
  y: number;
  data: Record<string, string>;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
}

interface Flow {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  is_active: boolean;
  created_at: string;
}

const NODE_TYPES = [
  { type: "trigger", label: "Trigger", color: "#3b82f6", description: "Início do fluxo" },
  { type: "send_message", label: "Enviar Mensagem", color: "#10b981", description: "Envia texto" },
  { type: "condition", label: "Condição", color: "#f59e0b", description: "Verifica palavra-chave" },
  { type: "wait", label: "Aguardar", color: "#8b5cf6", description: "Aguarda resposta" },
  { type: "end", label: "Encerrar", color: "#ef4444", description: "Finaliza fluxo" },
];

const NODE_COLORS: Record<string, string> = {
  trigger: "#3b82f6",
  send_message: "#10b981",
  condition: "#f59e0b",
  wait: "#8b5cf6",
  end: "#ef4444",
};

const NODE_LABELS: Record<string, string> = {
  trigger: "Trigger",
  send_message: "Enviar Mensagem",
  condition: "Condição",
  wait: "Aguardar",
  end: "Encerrar",
};

function generateId(): string {
  return "node-" + Math.random().toString(36).slice(2, 9);
}

// ── FlowBuilderVisual ─────────────────────────────────────────────────────────

const FlowBuilderVisual = () => {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [currentFlow, setCurrentFlow] = useState<Flow | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [flowName, setFlowName] = useState("Novo Fluxo");
  const [isActive, setIsActive] = useState(false);
  const [saving, setSaving] = useState(false);

  // Connect mode
  const [connectMode, setConnectMode] = useState(false);
  const [connectSource, setConnectSource] = useState<string | null>(null);

  // Drag state
  const draggingRef = useRef<{ nodeId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Load flows
  const loadFlows = useCallback(async () => {
    try {
      const data = await api.get<Flow[]>("/flow-builder/flows");
      setFlows(Array.isArray(data) ? data : []);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => { loadFlows(); }, [loadFlows]);

  // Open a flow
  const openFlow = (flow: Flow) => {
    setCurrentFlow(flow);
    setNodes(Array.isArray(flow.nodes) ? flow.nodes : []);
    setEdges(Array.isArray(flow.edges) ? flow.edges : []);
    setFlowName(flow.name);
    setIsActive(flow.is_active);
    setConnectMode(false);
    setConnectSource(null);
  };

  // Create new flow
  const createFlow = async () => {
    try {
      const data = await api.post<Flow>("/flow-builder/flows", {
        name: "Novo Fluxo",
        nodes: [],
        edges: [],
      });
      if (data?.id) {
        await loadFlows();
        openFlow(data);
      }
    } catch {
      toast.error("Erro ao criar fluxo");
    }
  };

  // Delete flow
  const deleteFlow = async (id: string) => {
    if (!confirm("Excluir este fluxo?")) return;
    try {
      await api.delete(`/flow-builder/flows/${id}`);
      setFlows((prev) => prev.filter((f) => f.id !== id));
      if (currentFlow?.id === id) {
        setCurrentFlow(null);
        setNodes([]);
        setEdges([]);
      }
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  // Save current flow
  const saveFlow = async () => {
    if (!currentFlow) return;
    setSaving(true);
    try {
      await api.patch(`/flow-builder/flows/${currentFlow.id}`, {
        name: flowName,
        nodes,
        edges,
        is_active: isActive,
      });
      await loadFlows();
      toast.success("Fluxo salvo!");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  // Add node to canvas
  const addNode = (type: string) => {
    const newNode: FlowNode = {
      id: generateId(),
      type,
      x: 80 + Math.random() * 200,
      y: 80 + Math.random() * 200,
      data: {},
    };
    setNodes((prev) => [...prev, newNode]);
  };

  // Remove node
  const removeNode = (id: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== id));
    setEdges((prev) => prev.filter((e) => e.source !== id && e.target !== id));
    if (connectSource === id) setConnectSource(null);
  };

  // Update node data
  const updateNodeData = (id: string, key: string, value: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, data: { ...n.data, [key]: value } } : n))
    );
  };

  // Handle node click in connect mode
  const handleNodeClick = (nodeId: string) => {
    if (!connectMode) return;
    if (!connectSource) {
      setConnectSource(nodeId);
      return;
    }
    if (connectSource === nodeId) {
      setConnectSource(null);
      return;
    }
    // Check if edge already exists
    const exists = edges.find(
      (e) => e.source === connectSource && e.target === nodeId
    );
    if (!exists) {
      const newEdge: FlowEdge = {
        id: "e-" + Math.random().toString(36).slice(2, 9),
        source: connectSource,
        target: nodeId,
      };
      setEdges((prev) => [...prev, newEdge]);
    }
    setConnectSource(null);
  };

  // Remove edge
  const removeEdge = (id: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== id));
  };

  // Drag handlers
  const onMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (connectMode) return;
    e.preventDefault();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    draggingRef.current = {
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
    };
  };

  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (!draggingRef.current) return;
    const { nodeId, startX, startY, origX, origY } = draggingRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId ? { ...n, x: origX + dx, y: origY + dy } : n
      )
    );
  };

  const onCanvasMouseUp = () => {
    draggingRef.current = null;
  };

  // Compute node center position for edges
  const nodeCenter = (node: FlowNode) => ({
    x: node.x + 110,
    y: node.y + 36,
  });

  return (
    <div className="flex h-full overflow-hidden bg-background">
      {/* ── Left Panel ───────────────────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 border-r border-border bg-muted/20 flex flex-col">
        {/* Palette */}
        <div className="border-b border-border px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Nós disponíveis
          </p>
          <div className="space-y-1">
            {NODE_TYPES.map((nt) => (
              <button
                key={nt.type}
                onClick={() => { if (currentFlow) addNode(nt.type); }}
                disabled={!currentFlow}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-left hover:bg-accent transition-colors disabled:opacity-40"
              >
                <span
                  className="h-3 w-3 rounded-sm shrink-0"
                  style={{ background: nt.color }}
                />
                <span className="font-medium">{nt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Saved flows list */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Fluxos salvos
            </p>
            <button
              onClick={createFlow}
              className="p-1 rounded hover:bg-accent transition-colors"
              title="Novo fluxo"
            >
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          {flows.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum fluxo criado
            </p>
          )}
          <div className="space-y-1">
            {flows.map((f) => (
              <div
                key={f.id}
                className={`flex items-center gap-1 rounded px-2 py-1.5 cursor-pointer group transition-colors ${
                  currentFlow?.id === f.id ? "bg-primary/10 text-primary" : "hover:bg-accent text-foreground"
                }`}
                onClick={() => openFlow(f)}
              >
                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs flex-1 truncate">{f.name}</span>
                {f.is_active && (
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); deleteFlow(f.id); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-500 transition-all"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground space-y-0.5">
          <p className="font-semibold">Legenda de cores:</p>
          {NODE_TYPES.map((nt) => (
            <div key={nt.type} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: nt.color }} />
              <span>{nt.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Area ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="h-12 border-b border-border flex items-center gap-3 px-4 bg-background shrink-0">
          {currentFlow ? (
            <>
              <input
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                className="text-sm font-medium bg-transparent border-b border-dashed border-border focus:outline-none focus:border-primary px-1 py-0.5 w-48"
                placeholder="Nome do fluxo"
              />

              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => {
                    setConnectMode(!connectMode);
                    setConnectSource(null);
                  }}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                    connectMode
                      ? "bg-amber-500 text-white"
                      : "bg-muted text-foreground hover:bg-accent"
                  }`}
                >
                  {connectMode ? <Unlink className="h-3.5 w-3.5" /> : <Link className="h-3.5 w-3.5" />}
                  {connectMode
                    ? connectSource
                      ? "Clique no destino"
                      : "Clique na origem"
                    : "Conectar nós"}
                </button>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                  {isActive ? (
                    <Play className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Square className="h-3.5 w-3.5 text-muted-foreground" />
                  )}
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="sr-only"
                  />
                  <span className={isActive ? "text-green-600 font-medium" : "text-muted-foreground"}>
                    {isActive ? "Ativo" : "Inativo"}
                  </span>
                </label>

                <button
                  onClick={saveFlow}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <GitBranch className="h-4 w-4" />
              <span>Selecione um fluxo ou clique em <strong>+</strong> para criar um novo</span>
              <button
                onClick={createFlow}
                className="ml-2 flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90"
              >
                <Plus className="h-3.5 w-3.5" />
                Novo Fluxo
              </button>
            </div>
          )}
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 relative overflow-auto bg-muted/10 cursor-default"
          style={{
            backgroundImage:
              "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
        >
          {!currentFlow && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Selecione ou crie um fluxo para começar</p>
              </div>
            </div>
          )}

          {/* SVG edges */}
          {currentFlow && (
            <svg
              className="absolute inset-0 pointer-events-none"
              style={{ width: "100%", height: "100%", overflow: "visible" }}
            >
              {edges.map((edge) => {
                const src = nodes.find((n) => n.id === edge.source);
                const tgt = nodes.find((n) => n.id === edge.target);
                if (!src || !tgt) return null;
                const s = nodeCenter(src);
                const t = nodeCenter(tgt);
                const midX = (s.x + t.x) / 2;
                return (
                  <g key={edge.id} className="pointer-events-auto">
                    <path
                      d={`M ${s.x} ${s.y} C ${midX} ${s.y} ${midX} ${t.y} ${t.x} ${t.y}`}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="2"
                      strokeDasharray="5,3"
                      markerEnd="url(#arrow)"
                    />
                    {/* Delete button on edge midpoint */}
                    <circle
                      cx={midX}
                      cy={(s.y + t.y) / 2}
                      r={8}
                      fill="#ef4444"
                      opacity={0.7}
                      onClick={() => removeEdge(edge.id)}
                      className="cursor-pointer hover:opacity-100"
                    />
                    <text
                      x={midX}
                      y={(s.y + t.y) / 2 + 4}
                      textAnchor="middle"
                      fill="white"
                      fontSize="10"
                      fontWeight="bold"
                      onClick={() => removeEdge(edge.id)}
                      className="cursor-pointer"
                    >
                      ×
                    </text>
                  </g>
                );
              })}
              <defs>
                <marker
                  id="arrow"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
                </marker>
              </defs>
            </svg>
          )}

          {/* Nodes */}
          {currentFlow &&
            nodes.map((node) => {
              const color = NODE_COLORS[node.type] || "#6b7280";
              const label = NODE_LABELS[node.type] || node.type;
              const isSource = connectSource === node.id;
              return (
                <div
                  key={node.id}
                  style={{
                    position: "absolute",
                    left: node.x,
                    top: node.y,
                    width: 220,
                    minHeight: 72,
                    userSelect: "none",
                    zIndex: isSource ? 20 : 10,
                  }}
                  className={`rounded-lg border-2 bg-background shadow-md transition-shadow ${
                    isSource ? "border-amber-400 shadow-amber-200" : "border-border hover:shadow-lg"
                  } ${connectMode ? "cursor-pointer" : ""}`}
                  onClick={() => handleNodeClick(node.id)}
                  onMouseDown={(e) => onMouseDown(e, node.id)}
                >
                  {/* Node header */}
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-t-md"
                    style={{ background: color }}
                  >
                    <span className="text-white text-xs font-semibold flex-1">{label}</span>
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}
                      className="text-white/70 hover:text-white transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Node content */}
                  <div className="px-3 py-2" onMouseDown={(e) => e.stopPropagation()}>
                    {node.type === "trigger" && (
                      <p className="text-xs text-muted-foreground">Início do fluxo</p>
                    )}
                    {node.type === "send_message" && (
                      <textarea
                        value={node.data.text || ""}
                        onChange={(e) => updateNodeData(node.id, "text", e.target.value)}
                        placeholder="Digite a mensagem..."
                        rows={2}
                        className="w-full text-xs border border-border rounded px-2 py-1 bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {node.type === "condition" && (
                      <input
                        value={node.data.keyword || ""}
                        onChange={(e) => updateNodeData(node.id, "keyword", e.target.value)}
                        placeholder="Palavra-chave..."
                        className="w-full text-xs border border-border rounded px-2 py-1 bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {node.type === "wait" && (
                      <p className="text-xs text-muted-foreground">Aguarda próxima mensagem</p>
                    )}
                    {node.type === "end" && (
                      <p className="text-xs text-muted-foreground">Encerrar atendimento</p>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* ── Info panel hint ───────────────────────────────────────────────────── */}
      {currentFlow && (
        <div className="absolute bottom-4 right-4 bg-background/90 backdrop-blur border border-border rounded-lg px-3 py-2 text-[11px] text-muted-foreground shadow-md space-y-0.5">
          <p className="font-medium text-foreground">Como usar:</p>
          <p>• Clique nos nós da paleta para adicionar</p>
          <p>• Arraste nós para reposicionar</p>
          <p>• Use "Conectar nós" para ligar nós</p>
          <p>• Clique no <span className="text-red-500">×</span> da aresta para remover</p>
          <div className="flex items-center gap-1 mt-1">
            <ZapOff className="h-3 w-3 text-amber-500" />
            <span>Apenas 1 fluxo pode estar ativo por vez</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlowBuilderVisual;
