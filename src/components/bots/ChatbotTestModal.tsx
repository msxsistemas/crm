import { useState, useEffect, useRef, useCallback } from "react";
import { X, RotateCcw, Send, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Types ───
interface MessageNodeData {
  content?: string;
  message?: string;
  variations?: string[];
  selection_mode?: "random" | "sequential";
  use_variations?: boolean;
}

interface FlowNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  data?: Record<string, unknown>;
}

// ─── Pick message content (supports variations) ───
function getMessageContent(data: MessageNodeData, label: string): string {
  if (data.use_variations && data.variations && data.variations.length > 0) {
    const filtered = data.variations.filter((v) => v.trim());
    if (filtered.length > 0) {
      const idx = Math.floor(Math.random() * filtered.length);
      return filtered[idx];
    }
  }
  return data.content || data.message || label || "...";
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
  flow_data?: FlowNode[] | null | { nodes: FlowNode[]; connections: FlowConnection[] } | unknown;
}

interface TestMessage {
  role: "bot" | "user" | "system";
  content: string;
}

interface ChatbotTestModalProps {
  open: boolean;
  onClose: () => void;
  rule: ChatbotRule;
}

// ─── Parse flow data ───
function parseFlow(rule: ChatbotRule): { nodes: FlowNode[]; connections: FlowConnection[] } {
  const fd = rule.flow_data;
  if (!fd) return { nodes: [], connections: [] };
  if (Array.isArray(fd)) return { nodes: fd as FlowNode[], connections: [] };
  const d = fd as { nodes?: FlowNode[]; connections?: FlowConnection[] };
  return { nodes: d.nodes ?? [], connections: d.connections ?? [] };
}

// ─── Component ───
export function ChatbotTestModal({ open, onClose, rule }: ChatbotTestModalProps) {
  const [testMessages, setTestMessages] = useState<TestMessage[]>([]);
  const [testInput, setTestInput] = useState("");
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [testVariables, setTestVariables] = useState<Record<string, string>>({});
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [menuOptions, setMenuOptions] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);

  const { nodes, connections } = parseFlow(rule);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addMessage = useCallback((msg: TestMessage) => {
    setTestMessages((prev) => [...prev, msg]);
  }, []);

  const getNextNodeId = useCallback(
    (fromId: string): string | null => {
      const conn = connections.find((c) => c.from === fromId);
      return conn ? conn.to : null;
    },
    [connections]
  );

  const resolveVars = useCallback(
    (text: string): string => {
      return text.replace(/\{\{(\w+)\}\}/g, (_, key) => testVariables[key] ?? `{{${key}}}`);
    },
    [testVariables]
  );

  // ─── Execute a node ───
  const executeNode = useCallback(
    (nodeId: string) => {
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) {
        addMessage({ role: "system", content: "✅ Fluxo concluído" });
        setFinished(true);
        setWaitingForInput(false);
        return;
      }

      const d = (node.data ?? {}) as Record<string, unknown>;
      const ds = (key: string): string => (d[key] as string) ?? "";

      switch (node.type) {
        case "start": {
          const nextId = getNextNodeId(nodeId);
          if (nextId) {
            setCurrentNodeId(nextId);
            executeNode(nextId);
          } else {
            addMessage({ role: "system", content: "✅ Fluxo concluído" });
            setFinished(true);
          }
          break;
        }

        case "message": {
          const text = resolveVars(getMessageContent(d as MessageNodeData, node.label));
          addMessage({ role: "bot", content: text });
          const nextId = getNextNodeId(nodeId);
          if (nextId) {
            setCurrentNodeId(nextId);
            setTimeout(() => executeNode(nextId), 400);
          } else {
            addMessage({ role: "system", content: "✅ Fluxo concluído" });
            setFinished(true);
          }
          break;
        }

        case "question":
        case "input": {
          const text = resolveVars(ds("question") || ds("message") || node.label || "Sua resposta:");
          addMessage({ role: "bot", content: text });
          setCurrentNodeId(nodeId);
          setWaitingForInput(true);
          setMenuOptions([]);
          break;
        }

        case "menu_text":
        case "menu": {
          const text = resolveVars(ds("text") || node.label || "Escolha uma opção:");
          addMessage({ role: "bot", content: text });
          const rawOpts = (Array.isArray(d.options) ? (d.options as string[]).join("\n") : ds("options") || ds("buttons"));
          const opts = rawOpts.split("\n").map((o) => o.trim()).filter(Boolean);
          setMenuOptions(opts);
          setCurrentNodeId(nodeId);
          setWaitingForInput(true);
          break;
        }

        case "buttons": {
          const text = resolveVars(ds("text") || node.label || "Escolha:");
          addMessage({ role: "bot", content: text });
          const opts = ds("buttons").split("\n").map((o) => o.trim()).filter(Boolean);
          setMenuOptions(opts);
          setCurrentNodeId(nodeId);
          setWaitingForInput(true);
          break;
        }

        case "condition": {
          const variable = ds("variable").replace(/\{\{|\}\}/g, "");
          const varValue = testVariables[variable] ?? "";
          const operator = ds("operator") || "igual";
          const compareValue = ds("value");

          let result = false;
          if (operator === "igual") result = varValue === compareValue;
          else if (operator === "diferente") result = varValue !== compareValue;
          else if (operator === "contém") result = varValue.includes(compareValue);
          else if (operator === "maior") result = Number(varValue) > Number(compareValue);
          else if (operator === "menor") result = Number(varValue) < Number(compareValue);

          addMessage({
            role: "system",
            content: `🔀 Condição: ${variable} ${operator} "${compareValue}" → ${result ? "Verdadeiro ✓" : "Falso ✗"}`,
          });

          const nextId = getNextNodeId(nodeId);
          if (nextId) {
            setCurrentNodeId(nextId);
            setTimeout(() => executeNode(nextId), 600);
          } else {
            addMessage({ role: "system", content: "✅ Fluxo concluído" });
            setFinished(true);
          }
          break;
        }

        case "delay": {
          const secs = parseInt(ds("seconds") || "2", 10);
          addMessage({ role: "system", content: `⏳ Aguardando ${secs} segundo${secs !== 1 ? "s" : ""}...` });
          setTimeout(() => {
            const nextId = getNextNodeId(nodeId);
            if (nextId) {
              setCurrentNodeId(nextId);
              executeNode(nextId);
            } else {
              addMessage({ role: "system", content: "✅ Fluxo concluído" });
              setFinished(true);
            }
          }, Math.min(secs * 1000, 3000));
          break;
        }

        case "transfer": {
          const dest = ds("destination") || ds("queue") || ds("agent") || "agente";
          addMessage({ role: "system", content: `🔄 Conversa seria transferida para "${dest}"` });
          setFinished(true);
          break;
        }

        case "tag": {
          addMessage({ role: "system", content: `🏷️ Tag adicionada: "${ds("tag") || node.label}"` });
          const nextId = getNextNodeId(nodeId);
          if (nextId) {
            setCurrentNodeId(nextId);
            setTimeout(() => executeNode(nextId), 400);
          } else {
            addMessage({ role: "system", content: "✅ Fluxo concluído" });
            setFinished(true);
          }
          break;
        }

        case "variable": {
          const varName = ds("name") || "var";
          const varVal = resolveVars(ds("value"));
          setTestVariables((prev) => ({ ...prev, [varName]: varVal }));
          addMessage({ role: "system", content: `📝 Variável definida: ${varName} = "${varVal}"` });
          const nextId = getNextNodeId(nodeId);
          if (nextId) {
            setCurrentNodeId(nextId);
            setTimeout(() => executeNode(nextId), 300);
          } else {
            addMessage({ role: "system", content: "✅ Fluxo concluído" });
            setFinished(true);
          }
          break;
        }

        case "chatgpt":
        case "ai": {
          addMessage({ role: "bot", content: `[IA] Resposta simulada para o prompt: "${ds("prompt").slice(0, 80)}..."` });
          const saveAsKey = ds("saveAs");
          if (saveAsKey) setTestVariables((prev) => ({ ...prev, [saveAsKey]: "resposta simulada" }));
          const nextId = getNextNodeId(nodeId);
          if (nextId) {
            setCurrentNodeId(nextId);
            setTimeout(() => executeNode(nextId), 500);
          } else {
            addMessage({ role: "system", content: "✅ Fluxo concluído" });
            setFinished(true);
          }
          break;
        }

        case "note": {
          addMessage({ role: "system", content: `📌 Nota: "${ds("note")}"` });
          const nextId = getNextNodeId(nodeId);
          if (nextId) {
            setCurrentNodeId(nextId);
            setTimeout(() => executeNode(nextId), 300);
          } else {
            addMessage({ role: "system", content: "✅ Fluxo concluído" });
            setFinished(true);
          }
          break;
        }

        case "department": {
          addMessage({ role: "system", content: `🏢 Departamento definido: "${ds("department")}"` });
          const nextId = getNextNodeId(nodeId);
          if (nextId) {
            setCurrentNodeId(nextId);
            setTimeout(() => executeNode(nextId), 300);
          } else {
            addMessage({ role: "system", content: "✅ Fluxo concluído" });
            setFinished(true);
          }
          break;
        }

        case "assign": {
          addMessage({ role: "system", content: `👤 Conversa atribuída a: "${ds("agent")}"` });
          const nextId = getNextNodeId(nodeId);
          if (nextId) {
            setCurrentNodeId(nextId);
            setTimeout(() => executeNode(nextId), 300);
          } else {
            addMessage({ role: "system", content: "✅ Fluxo concluído" });
            setFinished(true);
          }
          break;
        }

        case "webhook": {
          addMessage({ role: "system", content: `🌐 Webhook chamado: ${ds("method") || "POST"} ${ds("url")}` });
          const nextId = getNextNodeId(nodeId);
          if (nextId) {
            setCurrentNodeId(nextId);
            setTimeout(() => executeNode(nextId), 500);
          } else {
            addMessage({ role: "system", content: "✅ Fluxo concluído" });
            setFinished(true);
          }
          break;
        }

        case "close":
        case "end": {
          addMessage({ role: "system", content: "✅ Fluxo concluído" });
          setFinished(true);
          setWaitingForInput(false);
          break;
        }

        default: {
          addMessage({ role: "system", content: `⚙️ Nó: ${node.label} (tipo: ${node.type})` });
          const nextId = getNextNodeId(nodeId);
          if (nextId) {
            setCurrentNodeId(nextId);
            setTimeout(() => executeNode(nextId), 400);
          } else {
            addMessage({ role: "system", content: "✅ Fluxo concluído" });
            setFinished(true);
          }
          break;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodes, connections, testVariables, addMessage, getNextNodeId, resolveVars]
  );

  // ─── Start flow ───
  const startFlow = useCallback(() => {
    setTestMessages([]);
    setTestInput("");
    setTestVariables({});
    setWaitingForInput(false);
    setMenuOptions([]);
    setFinished(false);

    const startNode = nodes.find((n) => n.type === "start");
    if (!startNode) {
      setTestMessages([{ role: "system", content: "⚠️ Nenhum nó de início encontrado no fluxo." }]);
      return;
    }
    setCurrentNodeId(startNode.id);
    setTimeout(() => executeNode(startNode.id), 200);
  }, [nodes, executeNode]);

  // ─── Start on open ───
  useEffect(() => {
    if (open) startFlow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ─── Auto-scroll ───
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [testMessages]);

  // ─── Handle user send ───
  const handleSend = useCallback(
    (value?: string) => {
      const text = (value ?? testInput).trim();
      if (!text || !waitingForInput) return;

      addMessage({ role: "user", content: text });
      setTestInput("");
      setMenuOptions([]);
      setWaitingForInput(false);

      // Save variable if current node is an input/question
      if (currentNodeId) {
        const node = nodes.find((n) => n.id === currentNodeId);
        if (node) {
          const nd = (node.data ?? {}) as Record<string, unknown>;
          const varName = (nd.variable as string) || (nd.saveAs as string) || node.type;
          setTestVariables((prev) => ({ ...prev, [varName]: text }));
        }
      }

      const nextId = currentNodeId ? getNextNodeId(currentNodeId) : null;
      if (nextId) {
        setCurrentNodeId(nextId);
        setTimeout(() => executeNode(nextId), 400);
      } else {
        addMessage({ role: "system", content: "✅ Fluxo concluído" });
        setFinished(true);
      }
    },
    [testInput, waitingForInput, currentNodeId, nodes, addMessage, getNextNodeId, executeNode]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col w-full max-w-lg h-[90vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">🧪 Testando: {rule.name}</p>
              <p className="text-xs text-muted-foreground">Simulação do fluxo</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs h-7" onClick={startFlow}>
              <RotateCcw className="h-3 w-3" />
              Reiniciar
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {testMessages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">Iniciando fluxo...</p>
            </div>
          )}

          {testMessages.map((msg, i) => {
            if (msg.role === "system") {
              return (
                <div key={i} className="flex justify-center">
                  <span className="text-xs bg-muted text-muted-foreground px-3 py-1 rounded-full">
                    {msg.content}
                  </span>
                </div>
              );
            }

            if (msg.role === "bot") {
              return (
                <div key={i} className="flex items-end gap-2">
                  <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="max-w-[80%] bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5">
                    <p className="text-sm text-foreground whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              );
            }

            // user
            return (
              <div key={i} className="flex items-end justify-end gap-2">
                <div className="max-w-[80%] bg-primary rounded-2xl rounded-br-sm px-4 py-2.5">
                  <p className="text-sm text-primary-foreground whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            );
          })}

          {/* Finished state */}
          {finished && (
            <div className="flex justify-center pt-2">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={startFlow}>
                <RotateCcw className="h-3 w-3" />
                Reiniciar
              </Button>
            </div>
          )}
        </div>

        {/* Menu options */}
        {menuOptions.length > 0 && waitingForInput && (
          <div className="px-4 pb-2 flex flex-wrap gap-2 shrink-0">
            {menuOptions.map((opt, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(opt)}
                className={cn(
                  "px-3 py-1.5 text-sm rounded-full border border-primary/40 text-primary",
                  "hover:bg-primary hover:text-primary-foreground transition-colors"
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border shrink-0">
          <Input
            placeholder={
              finished
                ? "Fluxo encerrado"
                : waitingForInput
                ? "Digite sua resposta..."
                : "Aguardando..."
            }
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={!waitingForInput || finished}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={() => handleSend()}
            disabled={!waitingForInput || !testInput.trim() || finished}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
