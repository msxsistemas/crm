import { useState, useEffect, useCallback } from "react";
import {
  Activity,
  User,
  Clock,
  Filter,
  Search,
  RefreshCw,
  Download,
  ChevronLeft,
  ChevronRight,
  LogIn,
  LogOut,
  MessageSquare,
  UserCheck,
  Clipboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---- Types ----
interface ActivityEntry {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_name: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
}

const PAGE_SIZE = 50;

// ---- Action badge config ----
const ACTION_BADGE: Record<string, { label: string; className: string; icon?: React.ReactNode }> = {
  login: {
    label: "Login",
    className: "bg-gray-100 text-gray-700",
    icon: <LogIn className="h-3 w-3" />,
  },
  logout: {
    label: "Logout",
    className: "bg-gray-100 text-gray-700",
    icon: <LogOut className="h-3 w-3" />,
  },
  conversation_opened: {
    label: "Conversa aberta",
    className: "bg-blue-100 text-blue-700",
    icon: <MessageSquare className="h-3 w-3" />,
  },
  conversation_closed: {
    label: "Conversa fechada",
    className: "bg-purple-100 text-purple-700",
    icon: <MessageSquare className="h-3 w-3" />,
  },
  message_sent: {
    label: "Mensagem enviada",
    className: "bg-green-100 text-green-700",
    icon: <MessageSquare className="h-3 w-3" />,
  },
  contact_created: {
    label: "Contato criado",
    className: "bg-cyan-100 text-cyan-700",
    icon: <UserCheck className="h-3 w-3" />,
  },
  contact_updated: {
    label: "Contato atualizado",
    className: "bg-cyan-100 text-cyan-700",
    icon: <UserCheck className="h-3 w-3" />,
  },
  task_created: {
    label: "Tarefa criada",
    className: "bg-orange-100 text-orange-700",
    icon: <Clipboard className="h-3 w-3" />,
  },
  campaign_sent: {
    label: "Campanha enviada",
    className: "bg-red-100 text-red-700",
    icon: <Activity className="h-3 w-3" />,
  },
  page_view: {
    label: "Página visitada",
    className: "bg-slate-100 text-slate-600",
    icon: <Activity className="h-3 w-3" />,
  },
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  conversation: "Conversa",
  contact: "Contato",
  task: "Tarefa",
  campaign: "Campanha",
  chatbot_rule: "Chatbot",
  user: "Usuário",
  page: "Página",
};

const getActionBadge = (action: string) =>
  ACTION_BADGE[action] ?? {
    label: action,
    className: "bg-slate-100 text-slate-600",
  };

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

const getInitials = (name: string | null) => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

// ---- Stats helpers ----
const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  );
};

const isThisWeek = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return d >= weekAgo && d <= now;
};

// ---- CSV export ----
const exportCSV = (rows: ActivityEntry[]) => {
  const headers = [
    "ID",
    "Usuário",
    "Ação",
    "Tipo de Entidade",
    "ID da Entidade",
    "Nome da Entidade",
    "Detalhes",
    "IP",
    "Data/Hora",
  ];
  const escape = (val: unknown) => {
    const s = val == null ? "" : String(val).replace(/"/g, '""');
    return `"${s}"`;
  };
  const csvRows = [
    headers.join(","),
    ...rows.map((r) =>
      [
        r.id,
        r.user_name ?? r.user_id ?? "",
        r.action,
        r.entity_type ?? "",
        r.entity_id ?? "",
        r.entity_name ?? "",
        JSON.stringify(r.details),
        r.ip_address ?? "",
        r.created_at,
      ]
        .map(escape)
        .join(",")
    ),
  ];
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `activity_log_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ---- Component ----
const ActivityLog = () => {
  const { user } = useAuth();

  // Data
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [allEntries, setAllEntries] = useState<ActivityEntry[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterUser, setFilterUser] = useState("all");
  const [filterAction, setFilterAction] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");

  // Pagination
  const [page, setPage] = useState(0);

  // Log page view on mount
  useEffect(() => {
    if (user) {
      supabase.from("activity_log" as never).insert({
        user_id: user.id,
        action: "page_view",
        entity_type: "page",
        entity_name: "Registro de Atividades",
      } as never);
    }
  }, [user]);

  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id, full_name");
    setProfiles((data as Profile[]) ?? []);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("activity_log" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5000);

      if (error) throw error;
      setAllEntries((data as ActivityEntry[]) ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar registro de atividades");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfiles();
    loadData();
  }, [loadProfiles, loadData]);

  // Apply filters
  const filtered = allEntries.filter((e) => {
    if (search) {
      const s = search.toLowerCase();
      const matchName = (e.entity_name ?? "").toLowerCase().includes(s);
      const matchUser = (e.user_name ?? "").toLowerCase().includes(s);
      if (!matchName && !matchUser) return false;
    }
    if (filterUser !== "all" && e.user_id !== filterUser) return false;
    if (filterAction !== "all" && e.action !== filterAction) return false;
    if (filterEntity !== "all" && e.entity_type !== filterEntity) return false;
    if (dateStart) {
      const start = new Date(dateStart);
      if (new Date(e.created_at) < start) return false;
    }
    if (dateEnd) {
      const end = new Date(dateEnd);
      end.setHours(23, 59, 59, 999);
      if (new Date(e.created_at) > end) return false;
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Stats
  const todayCount = allEntries.filter((e) => isToday(e.created_at)).length;
  const weekCount = allEntries.filter((e) => isThisWeek(e.created_at)).length;
  const activeUsers = new Set(allEntries.map((e) => e.user_id).filter(Boolean)).size;

  // Prevent stale page when filters change
  const resetPage = () => setPage(0);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mx-6 py-4 border-b border-border gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-blue-600">Registro de Atividades</h1>
          </div>
          <div className="flex items-center gap-2">
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
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => exportCSV(filtered)}
              disabled={filtered.length === 0}
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <Activity className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total registros</p>
                <p className="text-2xl font-bold">{allEntries.length}</p>
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Hoje</p>
                <p className="text-2xl font-bold">{todayCount}</p>
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Esta semana</p>
                <p className="text-2xl font-bold">{weekCount}</p>
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Usuários ativos</p>
                <p className="text-2xl font-bold">{activeUsers}</p>
              </div>
            </Card>
          </div>

          {/* Filters */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filtros
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              {/* Search */}
              <div className="relative xl:col-span-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Buscar por entidade ou usuário..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    resetPage();
                  }}
                />
              </div>

              {/* User filter */}
              <Select
                value={filterUser}
                onValueChange={(v) => {
                  setFilterUser(v);
                  resetPage();
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Usuário" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os usuários</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name ?? p.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Action filter */}
              <Select
                value={filterAction}
                onValueChange={(v) => {
                  setFilterAction(v);
                  resetPage();
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as ações</SelectItem>
                  <SelectItem value="conversation_opened">Conversa aberta</SelectItem>
                  <SelectItem value="conversation_closed">Conversa fechada</SelectItem>
                  <SelectItem value="message_sent">Mensagem enviada</SelectItem>
                  <SelectItem value="contact_created">Contato criado</SelectItem>
                  <SelectItem value="contact_updated">Contato atualizado</SelectItem>
                  <SelectItem value="task_created">Tarefa criada</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="logout">Logout</SelectItem>
                </SelectContent>
              </Select>

              {/* Entity type filter */}
              <Select
                value={filterEntity}
                onValueChange={(v) => {
                  setFilterEntity(v);
                  resetPage();
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tipo de entidade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="conversation">Conversa</SelectItem>
                  <SelectItem value="contact">Contato</SelectItem>
                  <SelectItem value="task">Tarefa</SelectItem>
                  <SelectItem value="campaign">Campanha</SelectItem>
                  <SelectItem value="chatbot_rule">Chatbot</SelectItem>
                </SelectContent>
              </Select>

              {/* Date start */}
              <div className="flex gap-2 xl:col-span-1">
                <Input
                  type="date"
                  value={dateStart}
                  onChange={(e) => {
                    setDateStart(e.target.value);
                    resetPage();
                  }}
                  placeholder="De"
                  className="text-sm"
                />
              </div>
            </div>

            {/* Date end on second row to avoid overflow */}
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Até:</span>
              <Input
                type="date"
                value={dateEnd}
                onChange={(e) => {
                  setDateEnd(e.target.value);
                  resetPage();
                }}
                placeholder="Até"
                className="text-sm w-48"
              />
              {(search || filterUser !== "all" || filterAction !== "all" || filterEntity !== "all" || dateStart || dateEnd) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setFilterUser("all");
                    setFilterAction("all");
                    setFilterEntity("all");
                    setDateStart("");
                    setDateEnd("");
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
                <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhuma atividade encontrada</p>
                <p className="text-sm mt-1">Tente ajustar os filtros.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Usuário</th>
                      <th className="text-left px-4 py-3 font-medium">Ação</th>
                      <th className="text-left px-4 py-3 font-medium">Entidade</th>
                      <th className="text-left px-4 py-3 font-medium">Detalhes</th>
                      <th className="text-left px-4 py-3 font-medium">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {paginated.map((entry) => {
                      const badge = getActionBadge(entry.action);
                      const entityLabel =
                        entry.entity_type
                          ? (ENTITY_TYPE_LABELS[entry.entity_type] ?? entry.entity_type)
                          : null;
                      const detailsStr =
                        entry.details && Object.keys(entry.details).length > 0
                          ? JSON.stringify(entry.details)
                          : "—";

                      const displayName = entry.user_name ?? "Desconhecido";

                      return (
                        <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                          {/* User */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700 shrink-0">
                                {getInitials(displayName)}
                              </div>
                              <span className="truncate max-w-[120px]" title={displayName}>
                                {displayName}
                              </span>
                            </div>
                          </td>

                          {/* Action badge */}
                          <td className="px-4 py-3">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                                badge.className
                              )}
                            >
                              {badge.icon}
                              {badge.label}
                            </span>
                          </td>

                          {/* Entity */}
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              {entityLabel && (
                                <span className="text-xs text-muted-foreground">{entityLabel}</span>
                              )}
                              {entry.entity_name && (
                                <span
                                  className="text-sm font-medium truncate max-w-[160px]"
                                  title={entry.entity_name}
                                >
                                  {entry.entity_name}
                                </span>
                              )}
                              {!entityLabel && !entry.entity_name && (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          </td>

                          {/* Details */}
                          <td className="px-4 py-3">
                            <span
                              className="text-xs text-muted-foreground truncate max-w-[200px] block"
                              title={detailsStr}
                            >
                              {detailsStr}
                            </span>
                          </td>

                          {/* Date/Time */}
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 shrink-0" />
                              {formatDateTime(entry.created_at)}
                            </div>
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
  );
};

export default ActivityLog;
