import { useState, useEffect, useMemo, useCallback, useRef, startTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FloatingInput, FloatingSelectWrapper } from "@/components/ui/floating-input";
import {
  BarChart3, Clock, RefreshCw, Calendar, Filter, Eraser,
  MessageCircle, CheckCircle2, Timer, Star, Shield, FileText,
  TrendingUp, AlertTriangle, Smartphone, Download, ChevronUp, ChevronDown,
  Phone, ArrowDownToLine, ArrowUpFromLine, MessageSquare, Activity,
  Wifi, Printer, Target, DollarSign, CheckCircle, Settings2, X, GripVertical,
  Users, Zap, Cake, Send,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Link } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { db } from "@/lib/db";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformName } from "@/hooks/usePlatformName";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

// ── Widget Registry ──
interface DashboardWidget {
  id: string;
  title: string;
  description: string;
  defaultVisible: boolean;
  defaultOrder: number;
  minHeight: string;
}

const AVAILABLE_WIDGETS: DashboardWidget[] = [
  { id: 'stats_cards', title: 'Cards de Métricas', description: 'Total de conversas, TMA, CSAT', defaultVisible: true, defaultOrder: 0, minHeight: 'auto' },
  { id: 'realtime_indicator', title: 'Indicador em Tempo Real', description: 'Status ao vivo das conversas', defaultVisible: true, defaultOrder: 1, minHeight: 'auto' },
  { id: 'conversations_chart', title: 'Gráfico de Conversas', description: 'Conversas por dia', defaultVisible: true, defaultOrder: 2, minHeight: '200px' },
  { id: 'agent_performance', title: 'Performance dos Agentes', description: 'Tabela por agente', defaultVisible: true, defaultOrder: 3, minHeight: '200px' },
  { id: 'heatmap', title: 'Heatmap de Horários', description: 'Volume por hora/dia', defaultVisible: true, defaultOrder: 4, minHeight: '200px' },
  { id: 'sales_goals', title: 'Metas do Mês', description: 'Progresso das metas', defaultVisible: true, defaultOrder: 5, minHeight: '150px' },
  { id: 'top_contacts', title: 'Top Contatos', description: 'Contatos mais ativos', defaultVisible: false, defaultOrder: 6, minHeight: '150px' },
  { id: 'recent_activity', title: 'Atividade Recente', description: 'Últimas ações no sistema', defaultVisible: false, defaultOrder: 7, minHeight: '150px' },
  { id: 'birthdays', title: 'Aniversários', description: 'Próximos aniversários (7 dias)', defaultVisible: true, defaultOrder: 8, minHeight: '150px' },
];

interface WidgetLayout {
  id: string;
  visible: boolean;
  order: number;
}

function getDefaultWidgetLayout(): WidgetLayout[] {
  return AVAILABLE_WIDGETS.map(w => ({ id: w.id, visible: w.defaultVisible, order: w.defaultOrder }));
}

function loadWidgetLayout(): WidgetLayout[] {
  try {
    const saved = localStorage.getItem('dashboard_widget_layout');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch { /* ignore */ }
  return getDefaultWidgetLayout();
}

function saveWidgetLayout(layout: WidgetLayout[]) {
  localStorage.setItem('dashboard_widget_layout', JSON.stringify(layout));
}

// ── Top Contacts Widget ──
function useTopContacts(enabled: boolean) {
  const [topContacts, setTopContacts] = useState<{ name: string | null; phone: string; count: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    db
      .from('messages')
      .select('conversation_id')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .limit(200)
      .then(async ({ data: msgs }) => {
        if (!msgs || msgs.length === 0) { setLoading(false); return; }
        const convCount: Record<string, number> = {};
        for (const m of msgs) {
          convCount[m.conversation_id] = (convCount[m.conversation_id] || 0) + 1;
        }
        const topConvIds = Object.entries(convCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id]) => id);
        const { data: convos } = await db
          .from('conversations')
          .select('id, contact_id, contacts(name, phone)')
          .in('id', topConvIds);
        const result = (convos || []).map((c: any) => ({
          name: c.contacts?.name || null,
          phone: c.contacts?.phone || '',
          count: convCount[c.id] || 0,
        })).sort((a, b) => b.count - a.count);
        setTopContacts(result);
        setLoading(false);
      });
  }, [enabled]);

  return { topContacts, loading };
}

// ── Recent Activity Widget ──
function useRecentActivity(enabled: boolean) {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    db
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setActivities(data || []);
        setLoading(false);
      });
  }, [enabled]);

  return { activities, loading };
}

// ── Upcoming Birthdays Hook ──
interface BirthdayContact {
  id: string;
  name: string | null;
  phone: string;
  birthday: string;
  daysUntil: number;
}

function useUpcomingBirthdays(enabled: boolean) {
  const [birthdays, setBirthdays] = useState<BirthdayContact[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    api.get<BirthdayContact[]>('/stats/birthdays')
      .then(data => { setBirthdays(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [enabled]);

  return { birthdays, loading };
}

// ── Dashboard stats from backend ──
interface DashboardStats {
  realtime: { openCount: number; pendingCount: number; closedCount: number };
  kpis: {
    totalTickets: number; resolvedTickets: number; resolutionRate: string;
    avgResponseMinutes: number; avgResolutionHours: number; slaCompliance: number;
    sentMessages: number; receivedMessages: number; totalContacts: number;
  };
  timeline: { name: string; Criados: number; Resolvidos: number; Pendentes: number }[];
  agentData: { id: string; name: string; email: string; status: string; total: number; resolved: number; rate: string; avgTime: string; initials: string; online: boolean }[];
  hourlyData: { name: string; value: number }[];
  heatmapGrid: number[][];
  connectionStats: { id: string; instance_name: string; label: string; status: string; type: string; sent: number; received: number; created: number; resolved: number }[];
  profiles: { id: string; full_name: string | null; email: string; status: string }[];
  prevKpis?: { totalTickets: number; resolutionRate: number; avgResponseMinutes: number; slaCompliance: number };
}

function useDashboardData(params: {
  start: string; end: string; groupBy: string; connection: string; agent: string;
  comparePrevious: boolean; prevStart: string; prevEnd: string;
}) {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    if (!params.start || !params.end) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        start: params.start, end: params.end,
        groupBy: params.groupBy,
        connection: params.connection,
        agent: params.agent,
        ...(params.comparePrevious && params.prevStart
          ? { prevStart: params.prevStart, prevEnd: params.prevEnd }
          : {}),
      });
      const result = await api.get<DashboardStats>(`/stats/dashboard-full?${qs}`);
      startTransition(() => { setData(result); setLoading(false); });
    } catch {
      setLoading(false);
    }
  }, [params.start, params.end, params.groupBy, params.connection, params.agent, params.comparePrevious, params.prevStart, params.prevEnd]);

  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(), 3000);
  }, [fetchData]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    const socket = getSocket();
    const handleUpdate = () => { setLastUpdate(new Date()); debouncedFetch(); };
    socket.on('conversation:updated', handleUpdate);
    socket.on('message:new', handleUpdate);
    setIsLive(socket.connected);
    socket.on('connect', () => setIsLive(true));
    socket.on('disconnect', () => setIsLive(false));
    return () => {
      socket.off('conversation:updated', handleUpdate);
      socket.off('message:new', handleUpdate);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [debouncedFetch]);

  return { data, loading, isLive, lastUpdate, refresh: fetchData };
}

// ── Helpers ──
const formatDate = (d: Date) => d.toLocaleDateString("pt-BR");
const formatDateShort = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

const formatMinSec = (minutes: number) => {
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}min ${s}s` : `${m}min`;
};

const formatHoursMin = (hours: number) => {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
};

const getDateRange = (preset: string): [Date, Date] => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today": return [today, now];
    case "yesterday": { const y = new Date(today); y.setDate(y.getDate() - 1); return [y, today]; }
    case "7days": { const d = new Date(today); d.setDate(d.getDate() - 7); return [d, now]; }
    case "30days": { const d = new Date(today); d.setDate(d.getDate() - 30); return [d, now]; }
    case "thisMonth": return [new Date(now.getFullYear(), now.getMonth(), 1), now];
    case "lastMonth": { const s = new Date(now.getFullYear(), now.getMonth() - 1, 1); const e = new Date(now.getFullYear(), now.getMonth(), 0); return [s, e]; }
    default: { const d = new Date(today); d.setDate(d.getDate() - 7); return [d, now]; }
  }
};

const getWeekKey = (d: Date) => {
  const start = new Date(d);
  start.setDate(start.getDate() - start.getDay());
  return `${start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
};

const getMonthKey = (d: Date) => d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-card p-3 shadow-md text-xs">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-muted-foreground">
          <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: p.color }} />
          {p.name}: <span className="font-medium text-foreground">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

// ── CSV/XLSX Export helper ──
const downloadCSV = (data: Record<string, any>[], filename: string) => {
  if (data.length === 0) {
    toast.error("Sem dados para exportar");
    return;
  }
  const headers = Object.keys(data[0]);
  const csvContent =
    '\uFEFF' +
    headers.join(';') + '\n' +
    data.map(row =>
      headers.map(h => {
        const val = row[h] ?? '';
        const str = String(val);
        return str.includes(';') || str.includes('\n') || str.includes('"')
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(';')
    ).join('\n');

  const blob = new Blob([csvContent], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Relatório exportado com sucesso!");
};

// ── Mini Goals Hook ──
function useMyGoals(userId: string | undefined) {
  const [goals, setGoals] = useState<any[]>([]);
  const [currentVals, setCurrentVals] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!userId) return;
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();
    const start = new Date(y, m - 1, 1).toISOString();
    const end = new Date(y, m, 0, 23, 59, 59).toISOString();

    Promise.all([
      db.from("sales_goals").select("*").eq("agent_id", userId).eq("period_month", m).eq("period_year", y),
      db.from("conversations").select("id").eq("assigned_to", userId).gte("created_at", start).lte("created_at", end),
      db.from("opportunities").select("id, value, status").eq("assigned_to", userId).gte("created_at", start).lte("created_at", end),
      db.from("reviews").select("rating").eq("agent_id", userId).gte("created_at", start).lte("created_at", end),
    ]).then(([goalsRes, convRes, oppRes, reviewRes]) => {
      setGoals(goalsRes.data || []);
      const convs = convRes.data || [];
      const opps = oppRes.data || [];
      const reviews = reviewRes.data || [];
      const won = opps.filter((o: any) => o.status === "won");
      const revenue = opps.reduce((s: number, o: any) => s + (o.value || 0), 0);
      const avgNps = reviews.length > 0
        ? reviews.reduce((s: number, r: any) => s + (r.rating || 0), 0) / reviews.length
        : 0;
      setCurrentVals({
        conversations: convs.length,
        revenue,
        conversions: won.length,
        nps: parseFloat(avgNps.toFixed(1)),
      });
    });
  }, [userId]);

  return { goals, currentVals };
}

const GOAL_TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; formatter: (v: number) => string }> = {
  conversations: {
    label: "Atendimentos",
    icon: <MessageSquare className="h-3.5 w-3.5" />,
    formatter: (v) => String(Math.round(v)),
  },
  revenue: {
    label: "Receita",
    icon: <DollarSign className="h-3.5 w-3.5" />,
    formatter: (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v),
  },
  conversions: {
    label: "Conversões",
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    formatter: (v) => String(Math.round(v)),
  },
  nps: {
    label: "NPS",
    icon: <Star className="h-3.5 w-3.5" />,
    formatter: (v) => v.toFixed(1),
  },
};

// ── Main Component ──
const Index = () => {
  const { user } = useAuth();
  const { platformName } = usePlatformName();
  const { goals: myGoals, currentVals: myGoalCurrentVals } = useMyGoals(user?.id);

  // Defer non-critical widgets until after first render settles
  const [widgetsReady, setWidgetsReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWidgetsReady(true), 1500);
    return () => clearTimeout(t);
  }, []);
  const [datePreset, setDatePreset] = useState("7days");
  const [startDate, setStartDate] = useState(() => {
    const [s] = getDateRange("7days");
    return s.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const [, e] = getDateRange("7days");
    return e.toISOString().split("T")[0];
  });
  const [groupBy, setGroupBy] = useState("day");
  const [comparePrevious, setComparePrevious] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [reportTab, setReportTab] = useState("operator");
  const [selectedConnection, setSelectedConnection] = useState("all");
  const [selectedOperator, setSelectedOperator] = useState("self");
  const [agentFilter, setAgentFilter] = useState("all");

  // ── Widget Layout State ──
  const [widgetLayout, setWidgetLayout] = useState<WidgetLayout[]>(loadWidgetLayout);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const visibleWidgets = useMemo(
    () => widgetLayout.filter(w => w.visible).sort((a, b) => a.order - b.order),
    [widgetLayout]
  );

  const updateWidgetLayout = (newLayout: WidgetLayout[]) => {
    setWidgetLayout(newLayout);
    saveWidgetLayout(newLayout);
  };

  const toggleWidget = (id: string) => {
    updateWidgetLayout(widgetLayout.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const moveWidget = (id: string, dir: -1 | 1) => {
    const sorted = [...widgetLayout].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex(w => w.id === id);
    if (idx < 0) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const newSorted = [...sorted];
    const aOrder = newSorted[idx].order;
    const bOrder = newSorted[swapIdx].order;
    newSorted[idx] = { ...newSorted[idx], order: bOrder };
    newSorted[swapIdx] = { ...newSorted[swapIdx], order: aOrder };
    updateWidgetLayout(newSorted);
  };

  const resetWidgetLayout = () => {
    const defaults = getDefaultWidgetLayout();
    updateWidgetLayout(defaults);
  };

  // Date range derived values
  const dateStart = new Date(startDate || "2000-01-01");
  const dateEnd = new Date(endDate || "2100-01-01");
  dateEnd.setHours(23, 59, 59, 999);

  const prevDateRange = useMemo(() => {
    const diff = dateEnd.getTime() - dateStart.getTime();
    const prevEnd = new Date(dateStart.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - diff);
    return { start: prevStart.toISOString().split('T')[0], end: prevEnd.toISOString().split('T')[0] };
  }, [dateStart.getTime(), dateEnd.getTime()]);

  const { data, loading, isLive, lastUpdate, refresh } = useDashboardData({
    start: startDate, end: endDate, groupBy,
    connection: selectedConnection, agent: agentFilter,
    comparePrevious, prevStart: prevDateRange.start, prevEnd: prevDateRange.end,
  });

  // Convenience aliases — no computation, just naming
  const agentData = data?.agentData ?? [];
  const profiles = data?.profiles ?? [];
  const connections = data?.connectionStats ?? [];
  const timelineData = data?.timeline ?? [];
  const hourlyData = data?.hourlyData ?? [];
  const heatmapGrid = data?.heatmapGrid ?? Array.from({ length: 7 }, () => new Array(24).fill(0));
  const totalTickets = data?.kpis.totalTickets ?? 0;
  const resolvedTickets = data?.kpis.resolvedTickets ?? 0;
  const resolutionRate = data?.kpis.resolutionRate ?? '0.0';
  const avgResponseTime = data?.kpis.avgResponseMinutes ?? 0;
  const avgResolutionTime = data?.kpis.avgResolutionHours ?? 0;
  const slaCompliance = data?.kpis.slaCompliance ?? 0;
  const openCount = data?.realtime.openCount ?? 0;
  const pendingCount = data?.realtime.pendingCount ?? 0;
  const closedCount = data?.realtime.closedCount ?? 0;
  const prevKPIs = data?.prevKpis ?? { resolutionRate: 0, avgResponseMinutes: 0, slaCompliance: 0, totalTickets: 0 };

  // CSAT stats
  const [csatStats, setCsatStats] = useState<{ avg_score: string | null; total_responses: number; total_sent: number } | null>(null);
  useEffect(() => {
    if (!startDate || !endDate) return;
    api.get<any>(`/stats/csat?start=${startDate}&end=${endDate}`)
      .then(d => setCsatStats(d))
      .catch(() => {});
  }, [startDate, endDate]);

  // NPS stats
  const [npsStats, setNpsStats] = useState<{ nps_score: string | null; promoters: number; passives: number; detractors: number; total_responses: number; total_sent: number; avg_score: string | null } | null>(null);
  useEffect(() => {
    if (!startDate || !endDate) return;
    api.get<any>(`/stats/nps?start=${startDate}&end=${endDate}`)
      .then(d => setNpsStats(d))
      .catch(() => {});
  }, [startDate, endDate]);

  // Extra widget data — deferred until after primary render
  const { topContacts } = useTopContacts(widgetsReady);
  const { activities } = useRecentActivity(widgetsReady);
  const { birthdays } = useUpcomingBirthdays(widgetsReady);

  // Birthday "Enviar parabéns" dialog state
  const [bdayDialogOpen, setBdayDialogOpen] = useState(false);
  const [bdayContact, setBdayContact] = useState<BirthdayContact | null>(null);
  const [bdayMessage, setBdayMessage] = useState("");
  const [bdayConnections, setBdayConnections] = useState<{ id: string; instance_name: string }[]>([]);
  const [bdaySelectedConn, setBdaySelectedConn] = useState("");
  const [bdaySending, setBdaySending] = useState(false);

  const openBdayDialog = (c: BirthdayContact) => {
    setBdayContact(c);
    setBdayMessage(`🎂 Feliz aniversário, ${c.name || c.phone}! Que seu dia seja especial! Da equipe MSX CRM`);
    setBdaySelectedConn("");
    setBdayDialogOpen(true);
    db.from("evolution_connections").select("id, instance_name").then(({ data }) => {
      setBdayConnections((data || []) as { id: string; instance_name: string }[]);
    });
  };

  const handleSendBdayMessage = async () => {
    if (!bdayContact || !bdaySelectedConn || !bdayMessage.trim()) return;
    setBdaySending(true);
    try {
      const { error } = await db.functions.invoke("evolution-api", {
        body: { action: "send_message", instanceName: bdaySelectedConn, data: { phone: bdayContact.phone, message: bdayMessage } },
      });
      if (error) throw new Error(error.message);
      toast.success("Mensagem de aniversário enviada!");
      setBdayDialogOpen(false);
    } catch (err: any) {
      toast.error("Erro ao enviar mensagem: " + (err?.message || "Tente novamente"));
    } finally {
      setBdaySending(false);
    }
  };

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuário";

  useEffect(() => {
    if (!datePreset) return;
    const [s, e] = getDateRange(datePreset);
    setStartDate(s.toISOString().split("T")[0]);
    setEndDate(e.toISOString().split("T")[0]);
  }, [datePreset]);

  const getComparisonText = (current: number, previous: number) => {
    if (!comparePrevious) return "";
    if (previous === 0 && current === 0) return "→ 0% vs anterior";
    if (previous === 0) return "→ +100% vs anterior";
    const diff = ((current - previous) / previous * 100).toFixed(1);
    const sign = Number(diff) >= 0 ? "+" : "";
    return `→ ${sign}${diff}% vs anterior`;
  };

  const selectedProfile = useMemo(() => {
    if (selectedOperator === "self") return profiles.find(p => p.id === user?.id) || profiles[0];
    return profiles.find(p => p.id === selectedOperator) || profiles[0];
  }, [selectedOperator, profiles, user]);

  const alerts = useMemo(() => {
    const list: { title: string; desc: string; severity: "warning" | "danger"; value: number; limit: number; action: string; time: string }[] = [];
    if (pendingCount > 0) {
      list.push({ title: "SLA Próximo do Vencimento", desc: `${pendingCount} ticket(s) próximos de vencer o SLA`, severity: "warning", value: pendingCount, limit: 20, action: "Priorizar atendimento destes tickets", time: formatDistanceToNow(new Date(), { addSuffix: false, locale: ptBR }) });
    }
    const overloadedCount = profiles.filter(() => openCount > 10).length;
    if (overloadedCount > 0) {
      list.push({ title: "Atendentes Sobrecarregados", desc: `${overloadedCount} atendente(s) com mais de 10 tickets abertos`, severity: "warning", value: overloadedCount, limit: 10, action: "Redistribuir tickets ou adicionar mais atendentes", time: formatDistanceToNow(new Date(), { addSuffix: false, locale: ptBR }) });
    }
    if (pendingCount > 5) {
      list.push({ title: "Tickets Sem Atendente", desc: `${pendingCount} ticket(s) aguardando distribuição`, severity: "warning", value: pendingCount, limit: 0, action: "Atribuir tickets aos atendentes disponíveis", time: formatDistanceToNow(new Date(), { addSuffix: false, locale: ptBR }) });
    }
    return list;
  }, [pendingCount, openCount, profiles]);

  const operatorReportData = useMemo(() => {
    const totalResHours = avgResolutionTime * resolvedTickets;
    return {
      convos: totalTickets,
      msgs: data?.kpis.sentMessages ?? 0,
      totalResTime: formatHoursMin(totalResHours),
      avgWait: formatMinSec(avgResponseTime),
    };
  }, [data, avgResolutionTime, resolvedTickets, totalTickets, avgResponseTime]);

  const now = new Date();
  const updatedAt = `Dashboard atualizado em ${formatDate(now)} ${now.toLocaleTimeString("pt-BR")}`;

  // ── Export functions ──
  const handleExportDashboard = useCallback(() => {
    const rows = timelineData.map(d => ({
      Período: d.name,
      "Tickets Criados": d.Criados,
      "Tickets Resolvidos": d.Resolvidos,
      "Tickets Pendentes": d.Pendentes,
    }));
    rows.push({
      Período: "TOTAL",
      "Tickets Criados": totalTickets,
      "Tickets Resolvidos": resolvedTickets,
      "Tickets Pendentes": pendingCount,
    });
    downloadCSV(rows, `dashboard_${startDate}_${endDate}`);
  }, [timelineData, totalTickets, resolvedTickets, pendingCount, startDate, endDate]);

  const handleExportOperatorReport = useCallback(() => {
    const opName = selectedProfile?.full_name || selectedProfile?.email || userName;
    const rows = [{
      Operador: opName,
      "Conversas Atendidas": operatorReportData.convos,
      "Mensagens Enviadas": operatorReportData.msgs,
      "Tempo Total Resolução": operatorReportData.totalResTime,
      "Tempo Médio Espera": operatorReportData.avgWait,
      "Taxa Resolução": `${resolutionRate}%`,
      Período: `${formatDate(dateStart)} - ${formatDate(dateEnd)}`,
    }];
    downloadCSV(rows, `relatorio_operador_${opName.replace(/\s/g, "_")}`);
  }, [selectedProfile, operatorReportData, resolutionRate, dateStart, dateEnd, userName]);

  const handleExportPDF = useCallback(() => {
    const periodLabel = `${formatDate(dateStart)} - ${formatDate(dateEnd)}`;
    const generatedAt = new Date().toLocaleString("pt-BR");

    const channelRows = connections.map(conn => {
      return `<tr><td>${conn.label || conn.instance_name}</td><td>${conn.created}</td><td>${conn.resolved}</td><td>${conn.sent}</td><td>${conn.received}</td></tr>`;
    }).join("") || `<tr><td colspan="5" style="text-align:center;color:#999;">Nenhuma conexão</td></tr>`;

    const agentRows = agentData.map(a =>
      `<tr><td>${a.name}</td><td>${a.total}</td><td>${a.resolved}</td><td>${a.rate}%</td><td>${a.avgTime}</td></tr>`
    ).join("") || `<tr><td colspan="5" style="text-align:center;color:#999;">Sem dados</td></tr>`;

    const timelineRows = timelineData.map(t =>
      `<tr><td>${t.name}</td><td>${t.Criados}</td><td>${t.Resolvidos}</td><td>${t.Pendentes}</td></tr>`
    ).join("") || `<tr><td colspan="4" style="text-align:center;color:#999;">Sem dados</td></tr>`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>Relatório CRM MSX</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #333; margin: 20px; }
  h1 { color: #7C3AED; font-size: 20px; margin-bottom: 4px; }
  h2 { color: #444; font-size: 14px; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  p.meta { color: #666; font-size: 11px; margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th { background: #f0f0f0; padding: 8px; text-align: left; border: 1px solid #ddd; font-size: 11px; }
  td { padding: 8px; border: 1px solid #ddd; font-size: 11px; }
  tr:nth-child(even) td { background: #fafafa; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; }
  .kpi-box { border: 1px solid #ddd; padding: 12px; border-radius: 8px; background: #fff; }
  .kpi-label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .kpi-value { font-size: 24px; font-weight: bold; color: #7C3AED; }
  .kpi-sub { font-size: 10px; color: #aaa; margin-top: 2px; }
  .print-btn { display: inline-block; margin-bottom: 16px; padding: 8px 20px; background: #7C3AED; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; }
  @media print {
    .print-btn { display: none; }
    body { margin: 0; }
    h2 { page-break-before: auto; }
    table { page-break-inside: avoid; }
  }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Imprimir / Salvar PDF</button>
<h1>Relatório de Atendimentos — CRM MSX</h1>
<p class="meta">Período: ${periodLabel}</p>
<p class="meta">Gerado em: ${generatedAt}</p>

<h2>Indicadores Principais (KPIs)</h2>
<div class="kpi-grid">
  <div class="kpi-box">
    <div class="kpi-label">Total de Tickets</div>
    <div class="kpi-value">${totalTickets}</div>
    <div class="kpi-sub">Criados no período</div>
  </div>
  <div class="kpi-box">
    <div class="kpi-label">Tickets Resolvidos</div>
    <div class="kpi-value">${resolvedTickets}</div>
    <div class="kpi-sub">Fechados com sucesso</div>
  </div>
  <div class="kpi-box">
    <div class="kpi-label">Taxa de Resolução</div>
    <div class="kpi-value">${resolutionRate}%</div>
    <div class="kpi-sub">Resolvidos vs total</div>
  </div>
  <div class="kpi-box">
    <div class="kpi-label">TMA (Tempo Médio)</div>
    <div class="kpi-value">${avgResponseTime.toFixed(0)} min</div>
    <div class="kpi-sub">Primeira resposta</div>
  </div>
</div>

<h2>Estatísticas por Canal</h2>
<table>
  <thead><tr><th>Canal</th><th>Criados</th><th>Resolvidos</th><th>Enviadas</th><th>Recebidas</th></tr></thead>
  <tbody>${channelRows}</tbody>
</table>

<h2>Performance por Agente</h2>
<table>
  <thead><tr><th>Agente</th><th>Conversas</th><th>Resolvidas</th><th>Taxa</th><th>TMA</th></tr></thead>
  <tbody>${agentRows}</tbody>
</table>

<h2>Linha do Tempo de Tickets</h2>
<table>
  <thead><tr><th>Período</th><th>Criados</th><th>Resolvidos</th><th>Pendentes</th></tr></thead>
  <tbody>${timelineRows}</tbody>
</table>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) { toast.error("Popup bloqueado. Permita popups e tente novamente."); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); }, 600);
  }, [dateStart, dateEnd, totalTickets, resolvedTickets, resolutionRate, avgResponseTime, connections, agentData, timelineData]);

  // ── Filter actions ──
  const handleApplyFilters = useCallback(() => {
    setDatePreset(""); // clear preset since we're using custom dates
    setFiltersOpen(false);
    toast.success("Filtros aplicados com sucesso!");
  }, []);

  const handleClearFilters = useCallback(() => {
    setDatePreset("7days");
    setSelectedConnection("all");
    setAgentFilter("all");
    setGroupBy("day");
    setComparePrevious(false);
    toast.info("Filtros limpos");
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }


  return (
    <div className="flex-1 overflow-y-auto">

      {/* Header */}
      <div className="mx-6 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Estatísticas e Informações
            {isLive && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-2 py-0.5 rounded-full">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Ao vivo
              </span>
            )}
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">Análise completa de performance e atendimento</p>
            {lastUpdate && (
              <p className="text-xs text-muted-foreground">
                Última atualização: {lastUpdate.toLocaleTimeString("pt-BR")}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportDashboard}>
            <Download className="h-4 w-4" /> Exportar XLSX
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setCustomizeOpen(true)}>
            <Settings2 className="h-4 w-4" /> Personalizar Dashboard
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => { refresh(); toast.success("Dashboard atualizado!"); }}>
            <RefreshCw className="h-4 w-4" /> ATUALIZAR
          </Button>
        </div>
      </div>

      {/* ── Dashboard Customization Drawer ── */}
      {customizeOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCustomizeOpen(false)} />
          <div className="relative w-[360px] bg-card border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" /> Personalizar Dashboard
              </h2>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCustomizeOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-2">
              {[...widgetLayout].sort((a, b) => a.order - b.order).map((wl) => {
                const meta = AVAILABLE_WIDGETS.find(w => w.id === wl.id);
                if (!meta) return null;
                const sortedLayout = [...widgetLayout].sort((a, b) => a.order - b.order);
                const idx = sortedLayout.findIndex(w => w.id === wl.id);
                return (
                  <div key={wl.id} className={`flex items-center gap-3 p-3 rounded-xl border ${wl.visible ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border'}`}>
                    <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{meta.title}</p>
                      <p className="text-xs text-muted-foreground">{meta.description}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={idx === 0}
                        onClick={() => moveWidget(wl.id, -1)}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={idx === sortedLayout.length - 1}
                        onClick={() => moveWidget(wl.id, 1)}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                      <Switch
                        checked={wl.visible}
                        onCheckedChange={() => toggleWidget(wl.id)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-4 border-t border-border">
              <Button variant="outline" size="sm" className="w-full gap-2" onClick={resetWidgetLayout}>
                <RefreshCw className="h-4 w-4" /> Restaurar padrão
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* ── Advanced Filters (always visible) ── */}
        <div>
        <Card className="p-5">
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="flex items-center justify-between w-full text-left"
          >
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Filter className="h-4 w-4" /> Filtros Avançados
            </h3>
            {filtersOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>

          {filtersOpen && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "today", label: "Hoje" },
                  { id: "yesterday", label: "Ontem" },
                  { id: "7days", label: "Últimos 7 dias" },
                  { id: "30days", label: "Últimos 30 dias" },
                  { id: "thisMonth", label: "Este mês" },
                  { id: "lastMonth", label: "Mês passado" },
                ].map(p => (
                  <Button
                    key={p.id}
                    variant={datePreset === p.id ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5 text-xs rounded-full"
                    onClick={() => setDatePreset(p.id)}
                  >
                    <Calendar className="h-3.5 w-3.5" /> {p.label}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FloatingInput
                  type="date"
                  label="Data Inicial"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setDatePreset(""); }}
                />
                <FloatingInput
                  type="date"
                  label="Data Final"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setDatePreset(""); }}
                />
                <FloatingSelectWrapper label="Agrupar por" hasValue={true}>
                  <Select value={groupBy} onValueChange={setGroupBy}>
                    <SelectTrigger className="h-9 pt-3 pb-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="day">Dia</SelectItem>
                      <SelectItem value="week">Semana</SelectItem>
                      <SelectItem value="month">Mês</SelectItem>
                    </SelectContent>
                  </Select>
                </FloatingSelectWrapper>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={comparePrevious} onCheckedChange={setComparePrevious} />
                  <span className="text-sm text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" /> Comparar com período anterior
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs uppercase font-semibold rounded-md" onClick={handleClearFilters}>
                    <Eraser className="h-3.5 w-3.5" /> Limpar
                  </Button>
                  <Button size="sm" className="gap-1.5 text-xs uppercase font-semibold rounded-md" onClick={handleApplyFilters}>
                    <Filter className="h-3.5 w-3.5" /> Aplicar Filtros
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
        </div>

        {/* ── Widget-based content ── */}
        {visibleWidgets.map((wl, wIdx) => {

        if (wl.id === 'realtime_indicator') return (
        <div key={wl.id}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Clock className="h-5 w-5" /> Status dos Atendimentos em Tempo Real
            </h2>
            <div className="flex items-center gap-2">
              <FloatingSelectWrapper label="Filtrar por Agente" hasValue={true}>
                <Select value={agentFilter} onValueChange={setAgentFilter}>
                  <SelectTrigger className="w-[200px] h-9 text-xs pt-3 pb-1">
                    <SelectValue placeholder="Todos os agentes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os agentes</SelectItem>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email || "Agente"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FloatingSelectWrapper>
              <FloatingSelectWrapper label="Filtrar por Conexão" hasValue={true}>
                <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                  <SelectTrigger className="w-[200px] h-9 text-xs pt-3 pb-1">
                    <SelectValue placeholder="Todas as Conexões" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as Conexões</SelectItem>
                    {connections.map(conn => (
                      <SelectItem key={conn.id} value={conn.instance_name || conn.label}>
                        {conn.label || conn.instance_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FloatingSelectWrapper>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Atendendo */}
            <div className="rounded-xl border border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900/40 px-6 py-8">
              <div className="p-3 rounded-xl bg-green-500 shadow-sm w-fit mb-6">
                <Phone className="h-6 w-6 text-white" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                <span className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Atendendo</span>
              </div>
              <p className="text-5xl font-bold text-foreground mb-2">{openCount - pendingCount}</p>
              <p className="text-sm text-muted-foreground">Tickets em atendimento ativo (status: open)</p>
            </div>
            {/* Aguardando */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/40 px-6 py-8">
              <div className="p-3 rounded-xl bg-amber-500 shadow-sm w-fit mb-6">
                <Clock className="h-6 w-6 text-white" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Aguardando</span>
              </div>
              <p className="text-5xl font-bold text-foreground mb-2">{pendingCount}</p>
              <p className="text-sm text-muted-foreground">Tickets aguardando atendimento (status: pending)</p>
            </div>
            {/* Fechados */}
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900/40 px-6 py-8">
              <div className="p-3 rounded-xl bg-primary shadow-sm w-fit mb-6">
                <CheckCircle2 className="h-6 w-6 text-white" />
              </div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/40" />
                <span className="text-xs font-bold text-muted-foreground tracking-wider uppercase">Fechados</span>
              </div>
              <p className="text-5xl font-bold text-foreground mb-2">{closedCount}</p>
              <p className="text-sm text-muted-foreground">Tickets finalizados (status: closed)</p>
            </div>
          </div>
        </div>
        ); // end realtime_indicator

        if (wl.id === 'stats_cards') return (
        <div key={wl.id}>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5" /> Indicadores Chave de Performance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "TAXA DE RESOLUÇÃO", value: resolutionRate, unit: "%", sub: "Tickets resolvidos vs total", bgClass: "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800", iconBg: "bg-green-100 dark:bg-green-900/40", iconColor: "text-green-500", icon: CheckCircle2, comparison: getComparisonText(parseFloat(resolutionRate), prevKPIs.resolutionRate) },
              { label: "TEMPO MÉDIO DE RESPOSTA", value: avgResponseTime.toFixed(1), unit: " min", sub: "Primeira mensagem do agente", bgClass: "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800", iconBg: "bg-blue-100 dark:bg-blue-900/40", iconColor: "text-blue-500", icon: Timer, comparison: getComparisonText(avgResponseTime, prevKPIs.avgResponseMinutes ?? 0) },
              { label: "NPS SCORE", value: "0.0", unit: " /100", sub: "Satisfação do cliente", bgClass: "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800", iconBg: "bg-amber-100 dark:bg-amber-900/40", iconColor: "text-amber-500", icon: Star, comparison: comparePrevious ? "→ Sem dados anteriores" : "" },
              { label: "CONFORMIDADE SLA", value: slaCompliance, unit: " %", sub: "Tickets resolvidos em <24h", bgClass: "bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800", iconBg: "bg-purple-100 dark:bg-purple-900/40", iconColor: "text-purple-500", icon: TrendingUp, comparison: getComparisonText(slaCompliance, prevKPIs.slaCompliance ?? 0) },
            ].map((kpi) => (
              <div key={kpi.label} className={`rounded-xl border ${kpi.bgClass} px-5 py-6 relative`}>
                <div className={`absolute top-5 right-5 p-2.5 rounded-xl ${kpi.iconBg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.iconColor}`} />
                </div>
                <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase mb-3">{kpi.label}</p>
                <p className="text-4xl font-bold text-foreground">
                  {kpi.value}<span className="text-lg font-medium text-muted-foreground">{kpi.unit}</span>
                </p>
                {kpi.comparison && <p className="text-xs text-muted-foreground mt-2">{kpi.comparison}</p>}
                <p className="text-[10px] text-muted-foreground">{kpi.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
            {[
              { label: "TOTAL DE TICKETS", value: String(totalTickets), unit: "", sub: "Criados no período", bgClass: "bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800", iconBg: "bg-indigo-100 dark:bg-indigo-900/40", iconColor: "text-indigo-500", icon: BarChart3, comparison: getComparisonText(totalTickets, prevKPIs.totalTickets ?? 0) },
              { label: "PROTOCOLOS RESOLVIDOS", value: String(resolvedTickets), unit: "", sub: "Fechados com sucesso", bgClass: "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800", iconBg: "bg-green-100 dark:bg-green-900/40", iconColor: "text-green-500", icon: CheckCircle2 },
              { label: "TEMPO DE RESOLUÇÃO", value: avgResolutionTime.toFixed(1), unit: " h", sub: "Média de resolução", bgClass: "bg-orange-50/60 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800", iconBg: "bg-orange-100 dark:bg-orange-900/40", iconColor: "text-orange-500", icon: Clock },
              { label: "PRIMEIRA RESPOSTA", value: String(avgResponseTime.toFixed(0)), unit: " min", sub: "Tempo médio inicial", bgClass: "bg-teal-50/60 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800", iconBg: "bg-teal-100 dark:bg-teal-900/40", iconColor: "text-teal-500", icon: MessageCircle },
            ].map((kpi) => (
              <div key={kpi.label} className={`rounded-xl border ${kpi.bgClass} px-5 py-6 relative`}>
                <div className={`absolute top-5 right-5 p-2.5 rounded-xl ${kpi.iconBg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.iconColor}`} />
                </div>
                <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase mb-3">{kpi.label}</p>
                <p className="text-4xl font-bold text-foreground">
                  {kpi.value}<span className="text-lg font-medium text-muted-foreground">{kpi.unit}</span>
                </p>
                {"comparison" in kpi && kpi.comparison && <p className="text-xs text-muted-foreground mt-2">{kpi.comparison}</p>}
                <p className="text-[10px] text-muted-foreground mt-1">{kpi.sub}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-slate-50/60 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800 px-5 py-6 relative">
              <div className="absolute top-5 right-5 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/40">
                <FileText className="h-5 w-5 text-slate-500" />
              </div>
              <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase mb-3">TOTAL DE CONTATOS</p>
              <p className="text-4xl font-bold text-foreground">{data?.kpis.totalContacts ?? 0}</p>
              <p className="text-[10px] text-muted-foreground mt-2">Contatos na plataforma</p>
            </div>

            {/* CSAT Card */}
            <div className="rounded-xl border bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800 px-5 py-6 relative">
              <div className="absolute top-5 right-5 p-2.5 rounded-xl bg-yellow-100 dark:bg-yellow-900/40">
                <Star className="h-5 w-5 text-yellow-500" />
              </div>
              <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase mb-3">NOTA MÉDIA CSAT</p>
              <p className="text-4xl font-bold text-foreground">
                {csatStats?.avg_score ? Number(csatStats.avg_score).toFixed(1) : "—"}
                <span className="text-lg font-medium text-muted-foreground"> /5</span>
              </p>
              <p className="text-[10px] text-muted-foreground mt-2">
                {csatStats
                  ? `${csatStats.total_responses} resp. de ${csatStats.total_sent} enviadas${csatStats.total_sent > 0 ? ` (${Math.round((csatStats.total_responses / csatStats.total_sent) * 100)}%)` : ''}`
                  : "Sem dados no período"}
              </p>
            </div>

            {/* NPS Card */}
            {(() => {
              const npsScore = npsStats?.nps_score != null ? Number(npsStats.nps_score) : null;
              const npsColor = npsScore == null ? "border-border bg-card" : npsScore > 50 ? "border-green-200 dark:border-green-800 bg-green-50/60 dark:bg-green-950/20" : npsScore > 0 ? "border-yellow-200 dark:border-yellow-800 bg-yellow-50/60 dark:bg-yellow-950/20" : "border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/20";
              const npsIconColor = npsScore == null ? "bg-muted" : npsScore > 50 ? "bg-green-100 dark:bg-green-900/40" : npsScore > 0 ? "bg-yellow-100 dark:bg-yellow-900/40" : "bg-red-100 dark:bg-red-900/40";
              const npsTextColor = npsScore == null ? "text-foreground" : npsScore > 50 ? "text-green-600 dark:text-green-400" : npsScore > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";
              const total = (npsStats?.promoters ?? 0) + (npsStats?.passives ?? 0) + (npsStats?.detractors ?? 0);
              return (
                <div className={`rounded-xl border ${npsColor} px-5 py-6 relative`}>
                  <div className={`absolute top-5 right-5 p-2.5 rounded-xl ${npsIconColor}`}>
                    <TrendingUp className="h-5 w-5 text-primary" />
                  </div>
                  <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase mb-3">NPS</p>
                  <p className={`text-4xl font-bold ${npsTextColor}`}>
                    {npsScore != null ? (npsScore > 0 ? `+${npsScore}` : `${npsScore}`) : "—"}
                  </p>
                  {total > 0 && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${Math.round(((npsStats?.promoters ?? 0) / total) * 100)}%`, minWidth: 4, maxWidth: '60%' }} />
                        <span className="text-[10px] text-muted-foreground">{npsStats?.promoters} prom.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 rounded-full bg-yellow-400" style={{ width: `${Math.round(((npsStats?.passives ?? 0) / total) * 100)}%`, minWidth: 4, maxWidth: '60%' }} />
                        <span className="text-[10px] text-muted-foreground">{npsStats?.passives} pass.</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 rounded-full bg-red-500" style={{ width: `${Math.round(((npsStats?.detractors ?? 0) / total) * 100)}%`, minWidth: 4, maxWidth: '60%' }} />
                        <span className="text-[10px] text-muted-foreground">{npsStats?.detractors} detr.</span>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2">
                    {npsStats?.total_responses ? `${npsStats.total_responses} respostas` : "Sem dados no período"}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
        ); // end stats_cards

        if (wl.id === 'conversations_chart') return (
        <div key={wl.id} className="rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Linha do Tempo de Tickets</h3>
            <Badge variant="outline" className="text-[10px]">Agrupado por: {groupBy === "day" ? "Dia" : groupBy === "week" ? "Semana" : "Mês"}</Badge>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={timelineData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border) / 0.15)" vertical={true} horizontal={true} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
                dy={8}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
              />
              <Area
                type="natural"
                dataKey="Criados"
                stroke="hsl(217 91% 60%)"
                fill="hsl(217 91% 60% / 0.45)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, fill: "hsl(217 91% 60%)", strokeWidth: 2, stroke: "#fff" }}
              />
              <Area
                type="natural"
                dataKey="Resolvidos"
                stroke="hsl(142 71% 45%)"
                fill="hsl(142 71% 45% / 0.45)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, fill: "hsl(142 71% 45%)", strokeWidth: 2, stroke: "#fff" }}
              />
              <Area
                type="natural"
                dataKey="Pendentes"
                stroke="hsl(36 100% 50%)"
                fill="hsl(36 100% 50% / 0.45)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 6, fill: "hsl(36 100% 50%)", strokeWidth: 2, stroke: "#fff" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        ); // end conversations_chart

        if (wl.id === 'heatmap') {
          const heatmapMax = Math.max(1, ...heatmapGrid.flat());
          const dayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
          const getCellClass = (count: number) => {
            if (count === 0) return "bg-muted";
            const pct = count / heatmapMax;
            if (pct <= 0.25) return "bg-primary/20";
            if (pct <= 0.50) return "bg-primary/50";
            if (pct <= 0.75) return "bg-primary/75";
            return "bg-primary";
          };
          return (
            <div key={wl.id}>
              <Card className="p-6">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" /> Heatmap de Atividade
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">Mensagens por hora e dia da semana</p>
                <div className="flex gap-1 mb-1 ml-10">
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} className="w-5 text-[9px] text-center text-muted-foreground shrink-0">
                      {h % 3 === 0 ? `${h}` : ""}
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  {dayLabels.map((day, di) => (
                    <div key={day} className="flex items-center gap-1">
                      <span className="w-9 text-[10px] text-right text-muted-foreground shrink-0 pr-1">{day}</span>
                      {heatmapGrid[di].map((count, h) => (
                        <div
                          key={h}
                          className={`w-5 h-5 rounded-sm shrink-0 cursor-default transition-opacity hover:opacity-80 ${getCellClass(count)}`}
                          title={`${day} ${h}h: ${count} ${count !== 1 ? "mensagens" : "mensagem"}`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-[10px] text-muted-foreground">Baixo</span>
                  {["bg-muted", "bg-primary/20", "bg-primary/50", "bg-primary/75", "bg-primary"].map((cls, i) => (
                    <div key={i} className={`w-5 h-5 rounded-sm ${cls}`} />
                  ))}
                  <span className="text-[10px] text-muted-foreground">Alto</span>
                </div>
              </Card>
            </div>
          );
        }

        if (wl.id === 'agent_performance') return (
        <div key={wl.id} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Alerts */}
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Alertas Ativos
              {alerts.length > 0 && (
                <Badge variant="destructive" className="text-[10px] px-2 py-0.5 rounded-full">{alerts.length}</Badge>
              )}
            </h3>
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
                <p className="text-sm font-medium text-foreground">Tudo certo!</p>
                <p className="text-xs text-muted-foreground">Nenhum alerta ativo no momento</p>
              </div>
            ) : (
              <div className="space-y-3">
                {alerts.map((alert, i) => (
                  <div key={i} className="border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 shrink-0">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{alert.title}</span>
                          <Badge className="bg-amber-500 text-white text-[9px] px-2 rounded-full">ATENÇÃO</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{alert.desc}</p>
                        <div className="flex gap-2 mt-2">
                          <Badge variant="outline" className="text-[10px] rounded-full">Valor: {alert.value}</Badge>
                          {alert.limit > 0 && <Badge variant="outline" className="text-[10px] rounded-full">Limite: {alert.limit}</Badge>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Agent Ranking */}
          <div className="rounded-xl border bg-card p-6">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
              <Star className="h-4 w-4 text-amber-500" /> Ranking de Agentes
            </h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">#</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Agente</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Conversas</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Resolvidas</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">TMA</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Taxa</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground text-sm py-10">Sem dados de agentes</TableCell>
                    </TableRow>
                  ) : (() => {
                    const maxRate = Math.max(...agentData.map(a => parseFloat(a.rate)));
                    return agentData.map((agent, i) => {
                      const isTop = parseFloat(agent.rate) === maxRate && maxRate > 0;
                      return (
                        <TableRow key={i} className={isTop ? "bg-green-50/60 dark:bg-green-950/20 hover:bg-green-100/40" : "hover:bg-muted/30"}>
                          <TableCell className="text-xs font-bold text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2.5">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className={`text-[10px] font-bold ${isTop ? "bg-green-100 text-green-700" : "bg-primary/10 text-primary"}`}>{agent.initials}</AvatarFallback>
                              </Avatar>
                              <div>
                                <span className="text-xs font-semibold text-foreground block flex items-center gap-1">
                                  {agent.name}
                                  {isTop && <Star className="h-3 w-3 text-amber-400 inline-block ml-1" />}
                                </span>
                                <span className="text-[10px] text-muted-foreground">{agent.email}</span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-foreground font-medium">{agent.total}</TableCell>
                          <TableCell>
                            <span className="text-xs font-bold text-green-600">{agent.resolved}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{agent.avgTime}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] font-semibold rounded-full ${isTop ? "border-green-400 text-green-700 bg-green-50" : ""}`}>{agent.rate}%</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-2.5 h-2.5 rounded-full ${agent.online ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                              <span className="text-[10px] text-muted-foreground">{agent.online ? "Online" : "Offline"}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
        ); // end agent_performance

        // Channel Stats & Per-Agent Table are always visible (not in widget registry)
        if (wl.id === 'sales_goals') return (
        <>{myGoals.length > 0 && (
        <div key={wl.id} className="rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Metas do Mês
            </h3>
            <Link to="/metas" className="text-xs text-primary hover:underline flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> Ver todas
            </Link>
          </div>
          <div className="space-y-3">
            {myGoals.slice(0, 4).map((goal: any) => {
              const cfg = GOAL_TYPE_CONFIG[goal.goal_type];
              if (!cfg) return null;
              const cur = myGoalCurrentVals[goal.goal_type] ?? 0;
              const pct = goal.target_value > 0 ? Math.min(100, (cur / goal.target_value) * 100) : 0;
              const barColor = pct >= 100 ? "bg-green-500" : pct >= 70 ? "bg-blue-500" : pct >= 40 ? "bg-yellow-500" : "bg-red-500";
              return (
                <div key={goal.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                      {cfg.icon} {cfg.label}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {cfg.formatter(cur)} / {cfg.formatter(goal.target_value)} — <span className={pct >= 100 ? "text-green-600" : "text-primary"}>{pct.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}</>
        ); // end sales_goals

        if (wl.id === 'top_contacts') return (
        <div key={wl.id} className="rounded-xl border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <Users className="h-4 w-4 text-primary" /> Top Contatos (últimos 30 dias)
          </h3>
          {topContacts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum dado disponível</p>
          ) : (
            <div className="space-y-2">
              {topContacts.map((c, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                  <span className="text-lg font-bold text-muted-foreground w-6 text-center">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">{c.name || c.phone}</p>
                    <p className="text-xs text-muted-foreground">{c.phone}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{c.count} msgs</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
        ); // end top_contacts

        if (wl.id === 'recent_activity') return (
        <div key={wl.id} className="rounded-xl border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-primary" /> Atividade Recente
          </h3>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma atividade registrada</p>
          ) : (
            <div className="space-y-2">
              {activities.map((a: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/30">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{a.description || a.action || 'Ação registrada'}</p>
                    <p className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString('pt-BR')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        ); // end recent_activity

        if (wl.id === 'birthdays') return (
        <div key={wl.id} className="rounded-xl border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <Cake className="h-4 w-4 text-pink-500" />
            <span>🎂 Aniversários (próximos 7 dias)</span>
            {birthdays.length > 0 && (
              <Badge className="bg-pink-100 text-pink-700 border-pink-200 text-xs ml-1">{birthdays.length}</Badge>
            )}
          </h3>
          {birthdays.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum aniversário nos próximos 7 dias</p>
          ) : (
            <div className="space-y-3">
              {birthdays.map((c) => {
                const initials = (c.name || c.phone).substring(0, 2).toUpperCase();
                const bday = new Date(c.birthday);
                const formatted = bday.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                return (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted/30">
                    <div className="h-10 w-10 rounded-full bg-pink-100 flex items-center justify-center text-sm font-bold text-pink-600 shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name || c.phone}</p>
                      <p className="text-xs text-muted-foreground">{c.phone} · {formatted}</p>
                    </div>
                    {c.daysUntil === 0 ? (
                      <Badge className="bg-green-100 text-green-700 border-green-200 text-xs shrink-0">Hoje!</Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs shrink-0">Em {c.daysUntil} dia{c.daysUntil !== 1 ? 's' : ''}</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs gap-1.5 shrink-0 border-pink-300 text-pink-600 hover:bg-pink-50"
                      onClick={() => openBdayDialog(c)}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Parabéns
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        ); // end birthdays

        return null; // unknown widget
        })} {/* end visibleWidgets.map */}

        {/* ── Channel Stats (always visible) ── */}
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Wifi className="h-5 w-5" /> Estatísticas por Canal
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {connections.length === 0 ? (
              <div className="col-span-full rounded-xl border bg-card p-10 text-center">
                <div className="p-3 rounded-full bg-muted mx-auto w-fit mb-3">
                  <Wifi className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">Nenhuma conexão</p>
                <p className="text-xs text-muted-foreground">Adicione uma conexão para ver estatísticas</p>
              </div>
            ) : (
              connections.map((conn: any) => {
                const isConnected = conn.status === "open" || conn.connected;
                return (
                  <div key={conn.id} className="rounded-xl border bg-card p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                          <Smartphone className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <span className="text-sm font-semibold text-foreground block">{conn.label || conn.instance_name}</span>
                          <span className="text-[10px] text-muted-foreground">{conn.type || "whatsapp"}</span>
                        </div>
                      </div>
                      <Badge className={`text-[10px] rounded-full ${isConnected ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full mr-1 inline-block ${isConnected ? "bg-white" : "bg-muted-foreground"}`} />
                        {isConnected ? "Conectado" : conn.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs mb-4">
                      <div className="rounded-lg bg-blue-50/60 dark:bg-blue-950/20 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <ArrowUpFromLine className="h-3 w-3 text-green-500" />
                          <span className="text-muted-foreground text-[10px]">Enviadas</span>
                        </div>
                        <p className="font-bold text-foreground text-lg">{conn.sent}</p>
                      </div>
                      <div className="rounded-lg bg-green-50/60 dark:bg-green-950/20 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <ArrowDownToLine className="h-3 w-3 text-blue-500" />
                          <span className="text-muted-foreground text-[10px]">Recebidas</span>
                        </div>
                        <p className="font-bold text-foreground text-lg">{conn.received}</p>
                      </div>
                      <div className="rounded-lg bg-indigo-50/60 dark:bg-indigo-950/20 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <MessageSquare className="h-3 w-3 text-indigo-500" />
                          <span className="text-muted-foreground text-[10px]">Criados</span>
                        </div>
                        <p className="font-bold text-foreground text-lg">{conn.created}</p>
                      </div>
                      <div className="rounded-lg bg-amber-50/60 dark:bg-amber-950/20 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <TrendingUp className="h-3 w-3 text-green-500" />
                          <span className="text-muted-foreground text-[10px]">Resolvidos</span>
                        </div>
                        <p className="font-bold text-foreground text-lg">{conn.resolved}</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                        <span>Uptime</span><span className="text-green-600 font-bold">100.0%</span>
                      </div>
                      <Progress value={100} className="h-2 rounded-full" />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ── Per-Agent Performance Table ── */}
        <div className="rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Performance por Agente
            </h3>
            {agentFilter !== "all" && (
              <Badge variant="outline" className="text-xs">
                Filtrado: {profiles.find(p => p.id === agentFilter)?.full_name || "Agente"}
              </Badge>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Agente</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Conversas</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Resolvidas</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">Taxa</TableHead>
                  <TableHead className="text-[10px] font-bold uppercase tracking-wider">TMA</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-sm py-8">
                      Nenhum agente encontrado
                    </TableCell>
                  </TableRow>
                ) : (() => {
                  const maxRate = Math.max(...agentData.map(a => parseFloat(a.rate)));
                  const displayAgents = agentFilter === "all"
                    ? agentData
                    : agentData.filter(a => a.id === agentFilter);
                  return displayAgents.map((agent) => {
                    const isTop = parseFloat(agent.rate) === maxRate && maxRate > 0 && agentFilter === "all";
                    return (
                      <TableRow key={agent.id} className={isTop ? "bg-green-50/60 dark:bg-green-950/20 hover:bg-green-100/40" : "hover:bg-muted/30"}>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className={`text-[10px] font-bold ${isTop ? "bg-green-100 text-green-700" : "bg-primary/10 text-primary"}`}>{agent.initials}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-semibold text-foreground">
                              {agent.name}
                              {isTop && <Star className="h-3 w-3 text-amber-400 inline-block ml-1" />}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground">{agent.total}</TableCell>
                        <TableCell>
                          <span className="text-xs font-bold text-green-600">{agent.resolved}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] font-semibold rounded-full ${isTop ? "border-green-400 text-green-700 bg-green-50 dark:bg-green-950/30" : ""}`}>
                            {agent.rate}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{agent.avgTime}</TableCell>
                      </TableRow>
                    );
                  });
                })()}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ── Detailed Reports ── */}
        <div className="rounded-xl border bg-card p-6">
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-primary" /> Relatórios Detalhados
          </h3>
          <Tabs value={reportTab} onValueChange={setReportTab}>
            <TabsList className="w-full">
              <TabsTrigger value="operator" className="flex-1 gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" /> RELATÓRIO POR OPERADOR
              </TabsTrigger>
              <TabsTrigger value="period" className="flex-1 gap-1.5 text-xs">
                <Calendar className="h-3.5 w-3.5" /> RELATÓRIO POR PERÍODO
              </TabsTrigger>
            </TabsList>
            <TabsContent value="operator" className="mt-5 space-y-5">
              {/* Operator selector */}
              <div>
                <label className="text-xs text-muted-foreground mb-1.5 block font-medium">Selecionar Operador</label>
                <Select value={selectedOperator} onValueChange={setSelectedOperator}>
                  <SelectTrigger className="w-full max-w-sm h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="self">
                      {userName} (Você)
                    </SelectItem>
                    {profiles.filter(p => p.id !== user?.id).map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name || p.email || "Agente"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Operator report card */}
              <div className="bg-gradient-to-r from-primary to-blue-700 rounded-xl p-6 text-white">
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14 border-2 border-white/30">
                    <AvatarFallback className="bg-white/20 text-white text-lg font-bold">
                      {(selectedProfile?.full_name || selectedProfile?.email || "U").substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-xs opacity-80 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Relatório de Atendimento</p>
                    <p className="text-lg font-bold mt-0.5">{selectedProfile?.full_name || selectedProfile?.email?.split("@")[0] || userName}</p>
                    <p className="text-xs opacity-70">{selectedProfile?.email || user?.email}</p>
                  </div>
                  <div className="text-xs flex items-center gap-1.5 bg-white/15 rounded-full px-4 py-2">
                    <Clock className="h-3 w-3" /> {formatDate(dateStart)} - {formatDate(dateEnd)}
                  </div>
                </div>
              </div>

              {/* Performance data */}
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-primary" /> Dados de desempenho
                </h4>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { refresh(); toast.success("Dados atualizados!"); }}><RefreshCw className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={handleExportOperatorReport}><Download className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Conversas atendidas", value: String(operatorReportData.convos), icon: FileText, bgClass: "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800", iconBg: "bg-blue-100 dark:bg-blue-900/40", iconColor: "text-blue-600" },
                  { label: "Mensagens enviadas", value: String(operatorReportData.msgs), icon: MessageSquare, bgClass: "bg-orange-50/60 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800", iconBg: "bg-orange-100 dark:bg-orange-900/40", iconColor: "text-orange-600" },
                  { label: "Tempo total de resolução", value: operatorReportData.totalResTime, icon: Clock, bgClass: "bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-800", iconBg: "bg-red-100 dark:bg-red-900/40", iconColor: "text-red-600" },
                  { label: "Tempo médio de espera", value: operatorReportData.avgWait, icon: Timer, bgClass: "bg-teal-50/60 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800", iconBg: "bg-teal-100 dark:bg-teal-900/40", iconColor: "text-teal-600" },
                ].map(item => (
                  <div key={item.label} className={`rounded-xl border ${item.bgClass} p-4`}>
                    <div className={`h-10 w-10 rounded-xl ${item.iconBg} flex items-center justify-center mb-3`}>
                      <item.icon className={`h-4.5 w-4.5 ${item.iconColor}`} />
                    </div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">{item.label}</p>
                    <p className="text-3xl font-bold text-foreground mt-1">{item.value}</p>
                  </div>
                ))}
              </div>

              {/* Resolution time & rating */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-blue-50/40 dark:bg-blue-950/10 border-blue-200 dark:border-blue-800 p-5">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                    <Clock className="h-4 w-4 text-primary" /> Tempo Médio de Resolução
                  </h4>
                  <p className="text-4xl font-bold text-primary">{formatHoursMin(data?.kpis.avgResolutionHours ?? 0)}</p>
                  <p className="text-xs text-muted-foreground mt-2">Tempo médio para finalizar um protocolo</p>
                </div>
                <div className="rounded-xl border bg-amber-50/40 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800 p-5">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
                    <Star className="h-4 w-4 text-amber-500" /> Avaliação Média
                  </h4>
                  <div className="flex items-center justify-center py-4">
                    <p className="text-sm text-muted-foreground">Sem avaliações no período</p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="period" className="mt-5">
              <div className="rounded-xl border bg-muted/30 p-5">
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-4">
                  <BarChart3 className="h-4 w-4 text-primary" /> Distribuição por Horário
                </h4>
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={hourlyData}>
                    <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border) / 0.15)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="natural" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.45)" strokeWidth={2} dot={false} activeDot={{ r: 6, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "#fff" }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Metas now handled by widget system */}

        {/* ── Export ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button className="gap-2 rounded-lg" size="sm" onClick={handleExportDashboard}>
              <Download className="h-4 w-4" /> Exportar para Excel
            </Button>
            <Button variant="outline" className="gap-2 rounded-lg" size="sm" onClick={handleExportPDF}>
              <Printer className="h-4 w-4" /> Exportar PDF
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{updatedAt}</p>
        </div>
      </div>

      {/* ── Birthday "Enviar Parabéns" Dialog ── */}
      <Dialog open={bdayDialogOpen} onOpenChange={setBdayDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>🎂</span> Enviar parabéns para {bdayContact?.name || bdayContact?.phone}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Mensagem</label>
              <Textarea
                value={bdayMessage}
                onChange={(e) => setBdayMessage(e.target.value)}
                rows={4}
                className="text-sm resize-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Conexão WhatsApp</label>
              <Select value={bdaySelectedConn} onValueChange={setBdaySelectedConn}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione a conexão..." />
                </SelectTrigger>
                <SelectContent>
                  {bdayConnections.map(c => (
                    <SelectItem key={c.id} value={c.instance_name}>{c.instance_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBdayDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSendBdayMessage}
              disabled={bdaySending || !bdaySelectedConn || !bdayMessage.trim()}
              className="gap-2 bg-pink-600 hover:bg-pink-700 text-white"
            >
              {bdaySending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
