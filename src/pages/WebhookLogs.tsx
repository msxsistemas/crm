import { useState, useEffect, useCallback, useRef } from "react";
import {
  Webhook,
  RefreshCw,
  Eye,
  ChevronLeft,
  ChevronRight,
  ArrowDownCircle,
  ArrowUpCircle,
  X,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---- Types ----
interface WebhookLog {
  id: string;
  webhook_id: string | null;
  direction: "inbound" | "outbound";
  event_type: string | null;
  url: string | null;
  status_code: number | null;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

const PAGE_SIZE = 50;

// ---- Helpers ----
const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const getStatusBadge = (code: number | null) => {
  if (code === null) {
    return {
      label: "Pendente",
      className: "bg-gray-100 text-gray-600 border-gray-200",
    };
  }
  if (code >= 200 && code < 300) {
    return {
      label: `${code} OK`,
      className: "bg-green-100 text-green-700 border-green-200",
    };
  }
  if (code >= 400) {
    return {
      label: `${code} Erro`,
      className: "bg-red-100 text-red-700 border-red-200",
    };
  }
  return {
    label: String(code),
    className: "bg-yellow-100 text-yellow-700 border-yellow-200",
  };
};

const isSuccess = (code: number | null) => code !== null && code >= 200 && code < 300;
const isError = (code: number | null) => code !== null && code >= 400;

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
};

// ---- JSON Syntax Highlight ----
const highlightJSON = (json: string): string => {
  return json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
      (match) => {
        let cls = "json-number";
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? "json-key" : "json-string";
        } else if (/true|false/.test(match)) {
          cls = "json-boolean";
        } else if (/null/.test(match)) {
          cls = "json-null";
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
};

// ---- Payload Modal ----
interface PayloadModalProps {
  log: WebhookLog;
  onClose: () => void;
}

const PayloadModal = ({ log, onClose }: PayloadModalProps) => {
  const [tab, setTab] = useState<"request" | "response">("request");

  const getJson = (payload: Record<string, unknown> | null) => {
    if (!payload) return "null";
    return JSON.stringify(payload, null, 2);
  };

  const currentPayload = tab === "request" ? log.request_payload : log.response_payload;
  const jsonText = getJson(currentPayload);
  const highlighted = highlightJSON(jsonText);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-border">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <Webhook className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-base font-semibold">Detalhes do Log</h2>
              <p className="text-xs text-muted-foreground">{formatDateTime(log.created_at)}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Meta info */}
        <div className="px-5 py-3 border-b border-border bg-muted/30 shrink-0 flex flex-wrap gap-4">
          <div>
            <span className="text-xs text-muted-foreground">Direção</span>
            <p className="text-sm font-medium">
              {log.direction === "inbound" ? "Entrada" : "Saída"}
            </p>
          </div>
          {log.event_type && (
            <div>
              <span className="text-xs text-muted-foreground">Evento</span>
              <p className="text-sm font-medium">{log.event_type}</p>
            </div>
          )}
          {log.url && (
            <div className="flex-1 min-w-0">
              <span className="text-xs text-muted-foreground">URL</span>
              <p className="text-sm font-medium truncate">{log.url}</p>
            </div>
          )}
          {log.status_code !== null && (
            <div>
              <span className="text-xs text-muted-foreground">Status</span>
              <p className="text-sm font-medium">{log.status_code}</p>
            </div>
          )}
          {log.duration_ms !== null && (
            <div>
              <span className="text-xs text-muted-foreground">Duração</span>
              <p className="text-sm font-medium">{log.duration_ms}ms</p>
            </div>
          )}
          {log.error_message && (
            <div className="w-full">
              <span className="text-xs text-muted-foreground">Erro</span>
              <p className="text-sm text-red-600 font-medium">{log.error_message}</p>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 shrink-0">
          <button
            className={cn(
              "px-4 py-1.5 text-sm rounded-t-md font-medium border-b-2 transition-colors",
              tab === "request"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTab("request")}
          >
            Request
          </button>
          <button
            className={cn(
              "px-4 py-1.5 text-sm rounded-t-md font-medium border-b-2 transition-colors",
              tab === "response"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setTab("response")}
          >
            Response
          </button>
        </div>

        {/* JSON Viewer */}
        <div className="flex-1 overflow-auto px-5 pb-5">
          <style>{`
            .json-key { color: #3b82f6; }
            .json-string { color: #22c55e; }
            .json-number { color: #f59e0b; }
            .json-boolean { color: #a78bfa; }
            .json-null { color: #94a3b8; }
            .dark .json-key { color: #60a5fa; }
            .dark .json-string { color: #4ade80; }
            .dark .json-number { color: #fbbf24; }
            .dark .json-boolean { color: #c4b5fd; }
            .dark .json-null { color: #64748b; }
          `}</style>
          <pre
            className="text-xs font-mono bg-muted/50 rounded-lg p-4 overflow-auto whitespace-pre leading-relaxed"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </div>
      </div>
    </div>
  );
};

// ---- Main Component ----
const WebhookLogs = () => {
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDirection, setFilterDirection] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterDays, setFilterDays] = useState("7");
  const [page, setPage] = useState(0);
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const daysNum = parseInt(filterDays, 10);
      const from = new Date();
      from.setDate(from.getDate() - daysNum);

      const { data, error } = await supabase
        .from("webhook_logs" as never)
        .select("*")
        .gte("created_at", from.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) throw error;
      setLogs((data as WebhookLog[]) ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar logs de webhook");
    } finally {
      setLoading(false);
    }
  }, [filterDays]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(loadData, 30000);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [autoRefresh, loadData]);

  // Filter
  const filtered = logs.filter((log) => {
    if (filterDirection !== "all" && log.direction !== filterDirection) return false;
    if (filterStatus === "success" && !isSuccess(log.status_code)) return false;
    if (filterStatus === "error" && !isError(log.status_code)) return false;
    if (filterStatus === "pending" && log.status_code !== null) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Stats (today's data)
  const todayLogs = logs.filter((l) => isToday(l.created_at));
  const todaySuccess = todayLogs.filter((l) => isSuccess(l.status_code)).length;
  const todayError = todayLogs.filter((l) => isError(l.status_code)).length;
  const todaySuccessRate =
    todayLogs.length > 0 ? Math.round((todaySuccess / todayLogs.length) * 100) : 0;

  const resetPage = () => setPage(0);

  return (
    <>
      {selectedLog && (
        <PayloadModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}

      <div className="flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mx-6 py-4 border-b border-border gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Webhook className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-bold text-blue-600">Logs de Webhook</h1>
            </div>
            <div className="flex items-center gap-2">
              {/* Auto-refresh toggle */}
              <button
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setAutoRefresh((v) => !v)}
                title="Auto-atualizar a cada 30s"
              >
                {autoRefresh ? (
                  <ToggleRight className="h-5 w-5 text-blue-600" />
                ) : (
                  <ToggleLeft className="h-5 w-5" />
                )}
                <span className="text-xs">Auto (30s)</span>
              </button>

              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={loadData}
                disabled={loading}
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Atualizar
              </Button>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {/* Stats Bar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <Webhook className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total hoje</p>
                  <p className="text-2xl font-bold">{todayLogs.length}</p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sucesso</p>
                  <p className="text-2xl font-bold">{todaySuccess}</p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Erros</p>
                  <p className="text-2xl font-bold">{todayError}</p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Taxa de sucesso</p>
                  <p className="text-2xl font-bold">{todaySuccessRate}%</p>
                </div>
              </Card>
            </div>

            {/* Filter bar */}
            <Card className="p-4">
              <div className="flex flex-wrap gap-3 items-center">
                <Select
                  value={filterDirection}
                  onValueChange={(v) => {
                    setFilterDirection(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Direção" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas direções</SelectItem>
                    <SelectItem value="inbound">Entrada</SelectItem>
                    <SelectItem value="outbound">Saída</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filterStatus}
                  onValueChange={(v) => {
                    setFilterStatus(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="success">Sucesso (2xx)</SelectItem>
                    <SelectItem value="error">Erro (4xx/5xx)</SelectItem>
                    <SelectItem value="pending">Pendente</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={filterDays}
                  onValueChange={(v) => {
                    setFilterDays(v);
                    resetPage();
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Hoje</SelectItem>
                    <SelectItem value="7">Últimos 7 dias</SelectItem>
                    <SelectItem value="30">Últimos 30 dias</SelectItem>
                    <SelectItem value="90">Últimos 90 dias</SelectItem>
                  </SelectContent>
                </Select>

                {(filterDirection !== "all" || filterStatus !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterDirection("all");
                      setFilterStatus("all");
                      resetPage();
                    }}
                  >
                    Limpar filtros
                  </Button>
                )}
              </div>
            </Card>

            {/* Table */}
            <Card className="overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Webhook className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">Nenhum log encontrado</p>
                  <p className="text-sm mt-1">
                    Ajuste os filtros ou aguarde novos eventos de webhook.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">Data/Hora</th>
                        <th className="text-left px-4 py-3 font-medium">Direção</th>
                        <th className="text-left px-4 py-3 font-medium">Evento</th>
                        <th className="text-left px-4 py-3 font-medium">URL</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-left px-4 py-3 font-medium">Duração</th>
                        <th className="text-left px-4 py-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginated.map((log) => {
                        const statusBadge = getStatusBadge(log.status_code);
                        return (
                          <tr
                            key={log.id}
                            className="hover:bg-muted/30 transition-colors"
                          >
                            {/* Data/Hora */}
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3 shrink-0" />
                                {formatDateTime(log.created_at)}
                              </div>
                            </td>

                            {/* Direção */}
                            <td className="px-4 py-3">
                              {log.direction === "inbound" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 bg-purple-100 px-2 py-1 rounded-full">
                                  <ArrowDownCircle className="h-3 w-3" />
                                  Entrada
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 px-2 py-1 rounded-full">
                                  <ArrowUpCircle className="h-3 w-3" />
                                  Saída
                                </span>
                              )}
                            </td>

                            {/* Evento */}
                            <td className="px-4 py-3">
                              <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                                {log.event_type ?? "—"}
                              </span>
                            </td>

                            {/* URL */}
                            <td className="px-4 py-3 max-w-[200px]">
                              <span
                                className="text-xs text-muted-foreground truncate block"
                                title={log.url ?? ""}
                              >
                                {log.url ?? "—"}
                              </span>
                            </td>

                            {/* Status */}
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border",
                                  statusBadge.className
                                )}
                              >
                                {statusBadge.label}
                              </span>
                              {log.error_message && (
                                <p
                                  className="text-xs text-red-500 mt-0.5 truncate max-w-[120px]"
                                  title={log.error_message}
                                >
                                  {log.error_message}
                                </p>
                              )}
                            </td>

                            {/* Duração */}
                            <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                              {log.duration_ms !== null ? `${log.duration_ms}ms` : "—"}
                            </td>

                            {/* Ações */}
                            <td className="px-4 py-3">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title="Ver payload"
                                onClick={() => setSelectedLog(log)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {filtered.length > 0 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                  <span className="text-sm text-muted-foreground">
                    {page * PAGE_SIZE + 1}–
                    {Math.min((page + 1) * PAGE_SIZE, filtered.length)} de{" "}
                    {filtered.length} registros
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      {page + 1} / {Math.max(1, totalPages)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
};

export default WebhookLogs;
