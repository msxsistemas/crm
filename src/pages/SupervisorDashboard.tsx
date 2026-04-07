import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users,
  MessageSquare,
  Clock,
  AlertTriangle,
  RefreshCw,
  UserCheck,
  Eye,
  ChevronDown,
  ChevronUp,
  Filter,
} from "lucide-react";
import { isAgentInShift, type AgentSchedule } from "@/pages/AgentSchedules";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import api from "@/lib/api";

// ---- Types ----
interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  status?: string;
}

interface Contact {
  name: string | null;
  phone: string | null;
}

interface Conversation {
  id: string;
  contact_id: string | null;
  assigned_to: string | null;
  status: string;
  created_at: string;
  unread_count: number | null;
  contacts: Contact | null;
}

interface AgentCardData {
  profile: Profile;
  conversations: Conversation[];
  avgMinutes: number;
  resolvedToday: number;
}

interface LiveAgent {
  id: string;
  full_name: string | null;
  status: string;
  avatar_url: string | null;
  open_count: number;
  assigned_count: number;
  last_message_at: string | null;
  waiting_reply: number;
}

interface LiveAlert {
  id: string;
  contact_name: string | null;
  assigned_to: string | null;
  agent_name: string | null;
  minutes_waiting: number;
  priority: string | null;
}

interface LiveData {
  agents: LiveAgent[];
  alerts: LiveAlert[];
  queue: { unassigned: number };
}

const MAX_CONVERSATIONS = 10; // max capacity per agent

// ---- Helpers ----
const getInitials = (name: string | null) => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const minutesSince = (dateStr: string) => {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
};

const getSLABadgeVariant = (minutes: number): "green" | "yellow" | "red" => {
  if (minutes < 30) return "green";
  if (minutes < 60) return "yellow";
  return "red";
};

const SLABadge = ({ minutes }: { minutes: number }) => {
  const variant = getSLABadgeVariant(minutes);
  const label =
    minutes >= 60
      ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
      : `${minutes}m`;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
        variant === "green" && "bg-green-100 text-green-700",
        variant === "yellow" && "bg-yellow-100 text-yellow-700",
        variant === "red" && "bg-red-100 text-red-700"
      )}
    >
      {label}
    </span>
  );
};

// ---- Capacity Bar ----
const CapacityBar = ({ current, max }: { current: number; max: number }) => {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  const color =
    pct < 50 ? "bg-green-500" : pct < 80 ? "bg-yellow-400" : "bg-red-500";
  return (
    <div className="mt-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-0.5">
        <span>Capacidade</span>
        <span className="font-semibold">
          {current}/{max}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

// ---- Stat Card ----
const StatCard = ({
  icon: Icon,
  label,
  value,
  color,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  color: string;
  badge?: number;
}) => (
  <Card className="flex items-center gap-4 p-4">
    <div className={cn("rounded-lg p-2.5 relative", color)}>
      <Icon className="h-5 w-5 text-white" />
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
          {badge}
        </span>
      )}
    </div>
    <div>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  </Card>
);

// ---- Spy Panel ----
const SpyPanel = ({
  conversation,
  onClose,
}: {
  conversation: Conversation;
  onClose: () => void;
}) => {
  const contactName = conversation.contacts?.name || "Sem nome";
  const phone = conversation.contacts?.phone || "";
  const wait = minutesSince(conversation.created_at);

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-background border-l shadow-xl z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <p className="font-semibold">{contactName}</p>
          <p className="text-xs text-muted-foreground">{phone}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          ✕
        </Button>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="flex items-center gap-2 mb-4">
          <Badge variant="outline">Somente leitura</Badge>
          <SLABadge minutes={wait} />
        </div>
        <p className="text-sm text-muted-foreground text-center mt-8">
          Visualização da conversa em modo de espionagem.
        </p>
        <p className="text-xs text-muted-foreground text-center mt-1">
          (Integração com painel de chat completo)
        </p>
      </div>
    </div>
  );
};

// ---- Agent Card ----
const AgentCard = ({
  data,
  schedule,
  onIntervene,
  onSpy,
  typingAgentIds,
}: {
  data: AgentCardData;
  schedule?: AgentSchedule;
  onIntervene: (convId: string) => void;
  onSpy: (conv: Conversation) => void;
  typingAgentIds: Set<string>;
}) => {
  const { profile, conversations, avgMinutes, resolvedToday } = data;
  const name = profile.full_name || "Agente";
  const initials = getInitials(profile.full_name);
  const isOnline = profile.status !== "away";
  const inShift = schedule ? isAgentInShift(schedule) : null;
  const shown = conversations.slice(0, 3);
  const extra = conversations.length - 3;
  const isTyping = typingAgentIds.has(profile.id);

  return (
    <Card className="p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
            {initials}
          </div>
          <span
            className={cn(
              "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background",
              isOnline ? "bg-green-500" : "bg-yellow-400"
            )}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-sm truncate">{name}</p>
            {isTyping && (
              <span className="inline-flex items-center gap-0.5 text-[9px] text-blue-500 font-medium animate-pulse">
                <span className="h-1 w-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-1 w-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-1 w-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
                digitando
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground capitalize">
            {isOnline ? "Online" : "Ausente"}
          </p>
          {inShift !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5",
                inShift
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-500"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", inShift ? "bg-green-500" : "bg-gray-400")} />
              {inShift ? "Em turno" : "Fora do turno"}
            </span>
          )}
        </div>
      </div>

      {/* Capacity Bar */}
      <CapacityBar current={conversations.length} max={MAX_CONVERSATIONS} />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="bg-muted/50 rounded p-1.5">
          <p className="text-sm font-bold">{conversations.length}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            ativas
          </p>
        </div>
        <div className="bg-muted/50 rounded p-1.5">
          <p className="text-sm font-bold">{avgMinutes}m</p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            média
          </p>
        </div>
        <div className="bg-muted/50 rounded p-1.5">
          <p className="text-sm font-bold">{resolvedToday}</p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            resolvidas
          </p>
        </div>
      </div>

      {/* Conversations */}
      <div className="space-y-2">
        {shown.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Sem conversas abertas
          </p>
        )}
        {shown.map((conv) => {
          const wait = minutesSince(conv.created_at);
          const contactName = conv.contacts?.name || "Sem nome";
          const phone = conv.contacts?.phone || "";
          return (
            <div
              key={conv.id}
              className="rounded border bg-muted/30 p-2 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between gap-1">
                <div className="min-w-0">
                  <p className="font-medium truncate">{contactName}</p>
                  <p className="text-muted-foreground truncate">{phone}</p>
                </div>
                <SLABadge minutes={wait} />
              </div>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => onIntervene(conv.id)}
                >
                  <UserCheck className="h-3 w-3 mr-1" />
                  Intervir
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px] flex-1"
                  onClick={() => onSpy(conv)}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Espiar
                </Button>
              </div>
            </div>
          );
        })}
        {extra > 0 && (
          <button className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
            <ChevronDown className="h-3 w-3" />+{extra} mais
          </button>
        )}
      </div>
    </Card>
  );
};

// ---- Alerts Panel ----
const AlertsPanel = ({
  alerts,
  onAssume,
  expanded,
  onToggle,
}: {
  alerts: LiveAlert[];
  onAssume: (convId: string) => void;
  expanded: boolean;
  onToggle: () => void;
}) => {
  if (alerts.length === 0) return null;

  const getPriorityBadge = (priority: string | null) => {
    if (priority === 'urgent') return <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">urgente</span>;
    if (priority === 'high') return <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold text-white uppercase">alta</span>;
    return null;
  };

  return (
    <Card className="border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20">
      <button
        className="w-full flex items-center justify-between p-3 text-left"
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
          <span className="text-sm font-semibold text-red-700 dark:text-red-400">
            Sem resposta há +15 min
          </span>
          <span className="inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
            {alerts.length}
          </span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-red-500" /> : <ChevronDown className="h-4 w-4 text-red-500" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 max-h-64 overflow-y-auto">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="rounded border border-red-200 bg-white dark:bg-red-950/30 dark:border-red-900 p-2 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold truncate">{alert.contact_name || "Sem nome"}</span>
                    {getPriorityBadge(alert.priority)}
                  </div>
                  <p className="text-muted-foreground mt-0.5">
                    {alert.agent_name ? `Agente: ${alert.agent_name}` : "Sem agente"}
                  </p>
                  <p className="text-red-600 dark:text-red-400 font-medium mt-0.5">
                    Aguardando {Math.floor(alert.minutes_waiting)}min
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-6 px-2 text-[10px] shrink-0"
                  onClick={() => onAssume(alert.id)}
                >
                  Assumir
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// ---- Waiting Queue Panel ----
const WaitingQueuePanel = ({
  conversations,
  agents,
  onAssignMe,
  onAssignAgent,
}: {
  conversations: Conversation[];
  agents: Profile[];
  onAssignMe: (convId: string) => void;
  onAssignAgent: (convId: string, agentId: string) => void;
}) => {
  const longWaiting = conversations.filter(
    (c) => minutesSince(c.created_at) > 10
  ).length;

  return (
    <div className="flex flex-col gap-3">
      {longWaiting > 5 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-700 text-sm font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {longWaiting} conversas aguardando há mais de 10 minutos
        </div>
      )}

      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-orange-500" />
          Fila de Espera ({conversations.length})
        </h3>
        {conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma conversa aguardando
          </p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {conversations.map((conv) => {
              const wait = minutesSince(conv.created_at);
              const contactName = conv.contacts?.name || "Sem nome";
              const phone = conv.contacts?.phone || "";
              return (
                <div
                  key={conv.id}
                  className="rounded border bg-muted/30 p-2 text-xs space-y-2"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{contactName}</p>
                      <p className="text-muted-foreground">{phone}</p>
                    </div>
                    <SLABadge minutes={wait} />
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => onAssignMe(conv.id)}
                    >
                      Atribuir para mim
                    </Button>
                    <Select
                      onValueChange={(val) => onAssignAgent(conv.id, val)}
                    >
                      <SelectTrigger className="h-6 text-[10px] flex-1">
                        <SelectValue placeholder="Agente..." />
                      </SelectTrigger>
                      <SelectContent>
                        {agents.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.full_name || a.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

// ---- Main Page ----
const SupervisorDashboard = () => {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Profile[]>([]);
  const [activeConvos, setActiveConvos] = useState<Conversation[]>([]);
  const [waitingConvos, setWaitingConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [spyConv, setSpyConv] = useState<Conversation | null>(null);
  const [agentSchedules, setAgentSchedules] = useState<Record<string, AgentSchedule>>({});
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [alertsExpanded, setAlertsExpanded] = useState(true);
  const [typingAgentIds, setTypingAgentIds] = useState<Set<string>>(new Set());
  const [filterTeam, setFilterTeam] = useState("all");
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchLiveData = useCallback(async () => {
    try {
      const data = await api.get<LiveData>('/stats/supervisor-live');
      if (data) setLiveData(data);
    } catch (e) {
      // silently fall back to legacy data
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [agentsRes, activeRes, waitingRes] = await Promise.all([
        db
          .from("profiles")
          .select("id, full_name, avatar_url, role, status")
          .in("role", ["agent", "admin", "supervisor"]),
        db
          .from("conversations")
          .select(
            "id, contact_id, assigned_to, status, created_at, unread_count, contacts(name, phone)"
          )
          .eq("status", "open")
          .not("assigned_to", "is", null),
        db
          .from("conversations")
          .select(
            "id, contact_id, assigned_to, created_at, contacts(name, phone)"
          )
          .eq("status", "open")
          .is("assigned_to", null),
      ]);

      if (agentsRes.data) setAgents(agentsRes.data as Profile[]);
      if (activeRes.data) setActiveConvos(activeRes.data as Conversation[]);

      // Load agent schedules
      const schedRes = await db.from("agent_schedules" as any).select("*");
      if (schedRes.data) {
        const map: Record<string, AgentSchedule> = {};
        for (const s of schedRes.data as AgentSchedule[]) {
          map[s.agent_id] = s;
        }
        setAgentSchedules(map);
      }

      if (waitingRes.data) {
        const sorted = [...(waitingRes.data as Conversation[])].sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setWaitingConvos(sorted);
      }
      setLastUpdated(new Date());
    } catch (err) {
      console.error("SupervisorDashboard fetchData error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load teams for filter
  useEffect(() => {
    db.from("teams" as any).select("id, name").order("name").then(({ data }) => {
      if (data) setTeams(data as { id: string; name: string }[]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
    fetchLiveData();
    const interval = setInterval(() => {
      fetchData();
      fetchLiveData();
    }, 15000);

    const channel = db
      .channel("supervisor-conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          fetchData();
          fetchLiveData();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      db.removeChannel(channel);
    };
  }, [fetchData, fetchLiveData]);

  // Listen for agent typing events via socket
  useEffect(() => {
    // Try to get socket from window if available
    const socket = (window as any).__socket;
    if (!socket) return;

    const handler = (data: { agent_id: string }) => {
      const { agent_id } = data;
      setTypingAgentIds(prev => new Set([...prev, agent_id]));
      // Clear after 3s
      if (typingTimers.current[agent_id]) clearTimeout(typingTimers.current[agent_id]);
      typingTimers.current[agent_id] = setTimeout(() => {
        setTypingAgentIds(prev => {
          const next = new Set(prev);
          next.delete(agent_id);
          return next;
        });
      }, 3000);
    };

    socket.on('agent:typing', handler);
    return () => {
      socket.off('agent:typing', handler);
    };
  }, []);

  const handleIntervene = async (conversationId: string) => {
    if (!user) return;
    const { error } = await db
      .from("conversations")
      .update({ assigned_to: user.id })
      .eq("id", conversationId);

    if (error) {
      toast.error("Erro ao intervir na conversa");
      return;
    }

    await db.from("activity_logs").insert({
      action: "supervisor_intervene",
      entity_type: "conversation",
      entity_id: conversationId,
      user_id: user.id,
      details: { note: "Intervenção do supervisor" },
    });

    toast.success("Conversa atribuída para você");
    fetchData();
    fetchLiveData();
  };

  const handleAssignMe = async (conversationId: string) => {
    await handleIntervene(conversationId);
  };

  const handleAssignAgent = async (conversationId: string, agentId: string) => {
    const { error } = await db
      .from("conversations")
      .update({ assigned_to: agentId })
      .eq("id", conversationId);

    if (error) {
      toast.error("Erro ao atribuir conversa");
      return;
    }
    toast.success("Conversa atribuída ao agente");
    fetchData();
    fetchLiveData();
  };

  const handleAssumeAlert = async (conversationId: string) => {
    if (!user) return;
    const { error } = await db
      .from("conversations")
      .update({ assigned_to: user.id })
      .eq("id", conversationId);

    if (error) {
      toast.error("Erro ao assumir conversa");
      return;
    }
    toast.success("Conversa assumida!");
    fetchData();
    fetchLiveData();
  };

  // Build agent card data (filter by team if selected)
  const filteredAgents = filterTeam === "all"
    ? agents
    : agents.filter((a) => (a as any).team_id === filterTeam);

  const agentCards: AgentCardData[] = filteredAgents.map((profile) => {
    const convos = activeConvos.filter((c) => c.assigned_to === profile.id);
    const avgMinutes =
      convos.length > 0
        ? Math.round(
            convos.reduce((s, c) => s + minutesSince(c.created_at), 0) /
              convos.length
          )
        : 0;
    return {
      profile,
      conversations: convos,
      avgMinutes,
      resolvedToday: 0,
    };
  });

  const onlineAgents = agents.length;
  const totalActive = activeConvos.length;
  const totalWaiting = waitingConvos.length;
  const slaAtRisk = activeConvos.filter(
    (c) => minutesSince(c.created_at) >= 45
  ).length;
  const alertCount = liveData?.alerts?.length || 0;

  const formatTime = (d: Date) =>
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="flex h-full flex-col gap-4 p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Central do Supervisor</h1>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            <span className="text-xs text-muted-foreground">
              Ao vivo · Atualizado às {formatTime(lastUpdated)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {teams.length > 0 && (
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="h-8 text-xs w-40">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Filtrar por equipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as equipes</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => { fetchData(); fetchLiveData(); }}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Users}
          label="Agentes Online"
          value={onlineAgents}
          color="bg-blue-500"
        />
        <StatCard
          icon={MessageSquare}
          label="Conversas Ativas"
          value={totalActive}
          color="bg-green-500"
        />
        <StatCard
          icon={Clock}
          label="Aguardando Atendimento"
          value={totalWaiting}
          color="bg-orange-500"
        />
        <StatCard
          icon={AlertTriangle}
          label="SLA em Risco"
          value={slaAtRisk}
          color="bg-red-500"
          badge={alertCount}
        />
      </div>

      {/* Alerts panel */}
      {liveData && liveData.alerts.length > 0 && (
        <AlertsPanel
          alerts={liveData.alerts}
          onAssume={handleAssumeAlert}
          expanded={alertsExpanded}
          onToggle={() => setAlertsExpanded(!alertsExpanded)}
        />
      )}

      {/* Main content */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Agent grid */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Carregando agentes...
            </div>
          ) : agentCards.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Nenhum agente encontrado
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {agentCards.map((data) => (
                <AgentCard
                  key={data.profile.id}
                  data={data}
                  schedule={agentSchedules[data.profile.id]}
                  onIntervene={handleIntervene}
                  onSpy={setSpyConv}
                  typingAgentIds={typingAgentIds}
                />
              ))}
            </div>
          )}
        </div>

        {/* Waiting queue */}
        <div className="w-72 shrink-0">
          <WaitingQueuePanel
            conversations={waitingConvos}
            agents={agents}
            onAssignMe={handleAssignMe}
            onAssignAgent={handleAssignAgent}
          />
        </div>
      </div>

      {/* Spy panel */}
      {spyConv && (
        <SpyPanel conversation={spyConv} onClose={() => setSpyConv(null)} />
      )}
    </div>
  );
};

export default SupervisorDashboard;
