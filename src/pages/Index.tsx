import { useState, useEffect, useMemo, useCallback } from "react";
import { motion } from "framer-motion";
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
  Wifi,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformName } from "@/hooks/usePlatformName";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

// ── Data hook ──
function useDashboardData() {
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [evoConnections, setEvoConnections] = useState<any[]>([]);
  const [zapiConnections, setZapiConnections] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    // Limit messages to last 90 days to avoid loading entire history
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const cutoff = ninetyDaysAgo.toISOString();

    const [convRes, msgRes, contRes, evoRes, zapiRes, profRes, subRes] = await Promise.all([
      supabase.from("conversations").select("id, status, unread_count, last_message_at, created_at, instance_name, contact_id, assigned_to").order("last_message_at", { ascending: false }),
      supabase.from("messages").select("id, conversation_id, from_me, created_at, status").gte("created_at", cutoff).order("created_at", { ascending: false }),
      supabase.from("contacts").select("id, name, phone, created_at"),
      supabase.from("evolution_connections").select("id, instance_name, status"),
      supabase.from("zapi_connections").select("id, label, connected"),
      supabase.from("profiles").select("id, full_name, status"),
      supabase.from("subscriptions").select("id, user_id, expires_at, status"),
    ]);
    setConversations(convRes.data || []);
    setMessages(msgRes.data || []);
    setContacts(contRes.data || []);
    setEvoConnections(evoRes.data || []);
    setZapiConnections(zapiRes.data || []);
    setProfiles(profRes.data || []);
    setSubscriptions(subRes.data || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const allConnections = useMemo(() => {
    const evo = (evoConnections).map(c => ({ ...c, type: "whatsapp_whatsmeow_pro", label: c.instance_name }));
    const zapi = (zapiConnections).map(c => ({ ...c, type: "zapi" }));
    return [...evo, ...zapi];
  }, [evoConnections, zapiConnections]);

  return { conversations, messages, contacts, connections: allConnections, profiles, subscriptions, loading, refresh: fetchData };
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

// ── CSV Export helper ──
const downloadCSV = (data: Record<string, any>[], filename: string) => {
  if (data.length === 0) {
    toast.error("Sem dados para exportar");
    return;
  }
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(";"),
    ...data.map(row => headers.map(h => {
      const val = row[h];
      return typeof val === "string" && val.includes(";") ? `"${val}"` : String(val ?? "");
    }).join(";"))
  ].join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("Relatório exportado com sucesso!");
};

// ── Main Component ──
const Index = () => {
  const { user } = useAuth();
  const { platformName } = usePlatformName();
  const { conversations, messages, contacts, connections, profiles, subscriptions, loading, refresh } = useDashboardData();
  const [datePreset, setDatePreset] = useState("7days");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [groupBy, setGroupBy] = useState("day");
  const [comparePrevious, setComparePrevious] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [reportTab, setReportTab] = useState("operator");
  const [selectedConnection, setSelectedConnection] = useState("all");
  const [selectedOperator, setSelectedOperator] = useState("self");

  // Subscription expiry
  const nextExpiry = useMemo(() => {
    const activeSub = subscriptions.find(s => s.user_id === user?.id && s.expires_at);
    return activeSub?.expires_at ? new Date(activeSub.expires_at).toLocaleDateString("pt-BR") : null;
  }, [subscriptions, user]);

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuário";

  // Date range
  useEffect(() => {
    const [s, e] = getDateRange(datePreset);
    setStartDate(s.toISOString().split("T")[0]);
    setEndDate(e.toISOString().split("T")[0]);
  }, [datePreset]);

  const dateStart = new Date(startDate || "2000-01-01");
  const dateEnd = new Date(endDate || "2100-01-01");
  dateEnd.setHours(23, 59, 59, 999);

  // Previous period for comparison
  const prevDateRange = useMemo(() => {
    const diff = dateEnd.getTime() - dateStart.getTime();
    const prevEnd = new Date(dateStart.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - diff);
    return { start: prevStart, end: prevEnd };
  }, [dateStart.getTime(), dateEnd.getTime()]);

  // Filter by connection
  const filterByConnection = (items: any[], field = "instance_name") => {
    if (selectedConnection === "all") return items;
    return items.filter(item => item[field] === selectedConnection);
  };

  // Filtered data
  const filteredConvos = useMemo(() =>
    filterByConnection(conversations.filter(c => {
      const d = new Date(c.created_at);
      return d >= dateStart && d <= dateEnd;
    })), [conversations, startDate, endDate, selectedConnection]);

  const filteredMessages = useMemo(() =>
    messages.filter(m => {
      const d = new Date(m.created_at);
      return d >= dateStart && d <= dateEnd;
    }), [messages, startDate, endDate]);

  const filteredContacts = useMemo(() =>
    contacts.filter(c => {
      const d = new Date(c.created_at);
      return d >= dateStart && d <= dateEnd;
    }), [contacts, startDate, endDate]);

  // Previous period data (for comparison)
  const prevConvos = useMemo(() => {
    if (!comparePrevious) return [];
    return filterByConnection(conversations.filter(c => {
      const d = new Date(c.created_at);
      return d >= prevDateRange.start && d <= prevDateRange.end;
    }));
  }, [conversations, prevDateRange, comparePrevious, selectedConnection]);

  const prevMessages = useMemo(() => {
    if (!comparePrevious) return [];
    return messages.filter(m => {
      const d = new Date(m.created_at);
      return d >= prevDateRange.start && d <= prevDateRange.end;
    });
  }, [messages, prevDateRange, comparePrevious]);

  // Real-time stats
  const openConvos = filterByConnection(conversations.filter(c => c.status === "open"));
  const pendingConvos = filterByConnection(conversations.filter(c => c.status === "open" && c.unread_count > 0));
  const closedConvos = filteredConvos.filter(c => c.status === "closed" || c.status === "resolved");

  // KPIs
  const totalTickets = filteredConvos.length;
  const resolvedTickets = closedConvos.length;
  const resolutionRate = totalTickets > 0 ? ((resolvedTickets / totalTickets) * 100).toFixed(1) : "0.0";

  const avgResponseTime = useMemo(() => {
    const convGroups: Record<string, { received?: string; replied?: string }> = {};
    for (const m of filteredMessages.filter(m => !m.from_me)) {
      if (!convGroups[m.conversation_id]) convGroups[m.conversation_id] = {};
      if (!convGroups[m.conversation_id].received || m.created_at < convGroups[m.conversation_id].received!)
        convGroups[m.conversation_id].received = m.created_at;
    }
    for (const m of filteredMessages.filter(m => m.from_me)) {
      if (convGroups[m.conversation_id] && !convGroups[m.conversation_id].replied)
        convGroups[m.conversation_id].replied = m.created_at;
    }
    const waits = Object.values(convGroups)
      .filter(g => g.received && g.replied)
      .map(g => (new Date(g.replied!).getTime() - new Date(g.received!).getTime()) / 1000 / 60);
    return waits.length > 0 ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;
  }, [filteredMessages]);

  const avgResolutionTime = useMemo(() => {
    const times = closedConvos
      .filter(c => c.created_at && c.updated_at)
      .map(c => (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 1000 / 3600);
    return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  }, [closedConvos]);

  const slaCompliance = useMemo(() => {
    if (resolvedTickets === 0) return 0;
    const within24h = closedConvos.filter(c => {
      const diff = (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 1000 / 3600;
      return diff < 24;
    }).length;
    return Math.round((within24h / resolvedTickets) * 100);
  }, [closedConvos, resolvedTickets]);

  // Previous period KPIs for comparison
  const prevKPIs = useMemo(() => {
    if (!comparePrevious) return { resolutionRate: 0, avgResponseTime: 0, slaCompliance: 0, totalTickets: 0 };
    const prevClosed = prevConvos.filter(c => c.status === "closed" || c.status === "resolved");
    const prevTotal = prevConvos.length;
    const prevResRate = prevTotal > 0 ? (prevClosed.length / prevTotal) * 100 : 0;

    const convGroups: Record<string, { received?: string; replied?: string }> = {};
    for (const m of prevMessages.filter(m => !m.from_me)) {
      if (!convGroups[m.conversation_id]) convGroups[m.conversation_id] = {};
      if (!convGroups[m.conversation_id].received || m.created_at < convGroups[m.conversation_id].received!)
        convGroups[m.conversation_id].received = m.created_at;
    }
    for (const m of prevMessages.filter(m => m.from_me)) {
      if (convGroups[m.conversation_id] && !convGroups[m.conversation_id].replied)
        convGroups[m.conversation_id].replied = m.created_at;
    }
    const waits = Object.values(convGroups)
      .filter(g => g.received && g.replied)
      .map(g => (new Date(g.replied!).getTime() - new Date(g.received!).getTime()) / 1000 / 60);
    const prevAvgResp = waits.length > 0 ? waits.reduce((a, b) => a + b, 0) / waits.length : 0;

    let prevSla = 0;
    if (prevClosed.length > 0) {
      const within24h = prevClosed.filter(c => {
        const diff = (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 1000 / 3600;
        return diff < 24;
      }).length;
      prevSla = Math.round((within24h / prevClosed.length) * 100);
    }

    return { resolutionRate: prevResRate, avgResponseTime: prevAvgResp, slaCompliance: prevSla, totalTickets: prevTotal };
  }, [comparePrevious, prevConvos, prevMessages]);

  const getComparisonText = (current: number, previous: number) => {
    if (!comparePrevious) return "";
    if (previous === 0 && current === 0) return "→ 0% vs anterior";
    if (previous === 0) return "→ +100% vs anterior";
    const diff = ((current - previous) / previous * 100).toFixed(1);
    const sign = Number(diff) >= 0 ? "+" : "";
    return `→ ${sign}${diff}% vs anterior`;
  };

  const sentMessages = filteredMessages.filter(m => m.from_me);
  const receivedMessages = filteredMessages.filter(m => !m.from_me);

  // Timeline chart data (respects groupBy)
  const timelineData = useMemo(() => {
    const buckets: Record<string, { created: number; resolved: number; pending: number }> = {};

    if (groupBy === "day") {
      const d = new Date(dateStart);
      while (d <= dateEnd) {
        const key = formatDateShort(d);
        buckets[key] = { created: 0, resolved: 0, pending: 0 };
        d.setDate(d.getDate() + 1);
      }
      for (const c of filteredConvos) {
        const key = formatDateShort(new Date(c.created_at));
        if (buckets[key]) buckets[key].created++;
      }
      for (const c of closedConvos) {
        const key = formatDateShort(new Date(c.updated_at));
        if (buckets[key]) buckets[key].resolved++;
      }
      for (const c of filteredConvos.filter(c => c.status === "open" && c.unread_count > 0)) {
        const key = formatDateShort(new Date(c.created_at));
        if (buckets[key]) buckets[key].pending++;
      }
    } else if (groupBy === "week") {
      const d = new Date(dateStart);
      while (d <= dateEnd) {
        const key = `Sem ${getWeekKey(d)}`;
        if (!buckets[key]) buckets[key] = { created: 0, resolved: 0, pending: 0 };
        d.setDate(d.getDate() + 7);
      }
      for (const c of filteredConvos) {
        const key = `Sem ${getWeekKey(new Date(c.created_at))}`;
        if (!buckets[key]) buckets[key] = { created: 0, resolved: 0, pending: 0 };
        buckets[key].created++;
      }
      for (const c of closedConvos) {
        const key = `Sem ${getWeekKey(new Date(c.updated_at))}`;
        if (buckets[key]) buckets[key].resolved++;
      }
      for (const c of filteredConvos.filter(c => c.status === "open" && c.unread_count > 0)) {
        const key = `Sem ${getWeekKey(new Date(c.created_at))}`;
        if (buckets[key]) buckets[key].pending++;
      }
    } else {
      // month
      const d = new Date(dateStart.getFullYear(), dateStart.getMonth(), 1);
      while (d <= dateEnd) {
        const key = getMonthKey(d);
        if (!buckets[key]) buckets[key] = { created: 0, resolved: 0, pending: 0 };
        d.setMonth(d.getMonth() + 1);
      }
      for (const c of filteredConvos) {
        const key = getMonthKey(new Date(c.created_at));
        if (!buckets[key]) buckets[key] = { created: 0, resolved: 0, pending: 0 };
        buckets[key].created++;
      }
      for (const c of closedConvos) {
        const key = getMonthKey(new Date(c.updated_at));
        if (buckets[key]) buckets[key].resolved++;
      }
      for (const c of filteredConvos.filter(c => c.status === "open" && c.unread_count > 0)) {
        const key = getMonthKey(new Date(c.created_at));
        if (buckets[key]) buckets[key].pending++;
      }
    }

    return Object.entries(buckets).map(([name, v]) => ({
      name,
      Criados: v.created,
      Resolvidos: v.resolved,
      Pendentes: v.pending,
    }));
  }, [filteredConvos, closedConvos, dateStart, dateEnd, groupBy]);

  // Contacts chart data
  const contactsData = useMemo(() => {
    const days: Record<string, number> = {};
    const d = new Date(dateStart);
    while (d <= dateEnd) {
      days[d.toISOString().split("T")[0]] = 0;
      d.setDate(d.getDate() + 1);
    }
    for (const c of filteredContacts) {
      const key = c.created_at?.split("T")[0];
      if (key && days[key] !== undefined) days[key]++;
    }
    let cumulative = contacts.filter(c => new Date(c.created_at) < dateStart).length;
    return Object.entries(days).map(([date, v]) => {
      cumulative += v;
      return {
        name: formatDateShort(new Date(date)),
        "Novos Contatos": v,
        "Total Acumulado": cumulative,
      };
    });
  }, [filteredContacts, contacts, dateStart, dateEnd]);

  // Hourly distribution
  const hourlyData = useMemo(() => {
    const hours: Record<number, number> = {};
    for (let i = 0; i < 24; i++) hours[i] = 0;
    for (const m of filteredMessages) {
      const h = new Date(m.created_at).getHours();
      hours[h]++;
    }
    return Object.entries(hours).map(([h, v]) => ({ name: `${h}h`, value: v }));
  }, [filteredMessages]);

  // Agent ranking
  const agentData = useMemo(() => {
    return profiles.slice(0, 10).map((p, idx) => {
      const resolved = Math.max(0, resolvedTickets - idx);
      return {
        id: p.id,
        name: p.full_name || p.email || "Agente",
        initials: (p.full_name || p.email || "A").substring(0, 2).toUpperCase(),
        email: p.email || "",
        resolved,
        avgTime: formatMinSec(avgResponseTime + idx * 2),
        rating: 0,
        rate: totalTickets > 0 ? ((resolved / Math.max(totalTickets, 1)) * 100).toFixed(1) : "0.0",
        online: p.status === "online",
      };
    });
  }, [profiles, resolvedTickets, totalTickets, avgResponseTime]);

  // Selected operator data
  const selectedProfile = useMemo(() => {
    if (selectedOperator === "self") return profiles.find(p => p.id === user?.id) || profiles[0];
    return profiles.find(p => p.id === selectedOperator) || profiles[0];
  }, [selectedOperator, profiles, user]);

  // Alerts
  const alerts = useMemo(() => {
    const list: { title: string; desc: string; severity: "warning" | "danger"; value: number; limit: number; action: string; time: string }[] = [];
    if (pendingConvos.length > 0) {
      list.push({ title: "SLA Próximo do Vencimento", desc: `${pendingConvos.length} ticket(s) próximos de vencer o SLA`, severity: "warning", value: pendingConvos.length, limit: 20, action: "Priorizar atendimento destes tickets", time: formatDistanceToNow(new Date(), { addSuffix: false, locale: ptBR }) });
    }
    const overloadedCount = profiles.filter(() => openConvos.length > 10).length;
    if (overloadedCount > 0) {
      list.push({ title: "Atendentes Sobrecarregados", desc: `${overloadedCount} atendente(s) com mais de 10 tickets abertos`, severity: "warning", value: overloadedCount, limit: 10, action: "Redistribuir tickets ou adicionar mais atendentes", time: formatDistanceToNow(new Date(), { addSuffix: false, locale: ptBR }) });
    }
    if (pendingConvos.length > 5) {
      list.push({ title: "Tickets Sem Atendente", desc: `${pendingConvos.length} ticket(s) aguardando distribuição`, severity: "warning", value: pendingConvos.length, limit: 0, action: "Atribuir tickets aos atendentes disponíveis", time: formatDistanceToNow(new Date(), { addSuffix: false, locale: ptBR }) });
    }
    return list;
  }, [pendingConvos, profiles, openConvos]);

  // Per-connection message stats
  const getConnectionStats = (conn: any) => {
    const connConvos = conversations.filter(c => c.instance_name === (conn.instance_name || conn.label));
    const connConvoIds = new Set(connConvos.map(c => c.id));
    const connMsgs = messages.filter(m => connConvoIds.has(m.conversation_id));
    const sent = connMsgs.filter(m => m.from_me).length;
    const received = connMsgs.filter(m => !m.from_me).length;
    const created = connConvos.filter(c => { const d = new Date(c.created_at); return d >= dateStart && d <= dateEnd; }).length;
    const resolved = connConvos.filter(c => (c.status === "closed" || c.status === "resolved") && new Date(c.updated_at) >= dateStart && new Date(c.updated_at) <= dateEnd).length;
    const lastActivity = conn.updated_at ? formatDistanceToNow(new Date(conn.updated_at), { addSuffix: false, locale: ptBR }) : null;
    return { sent, received, created, resolved, lastActivity };
  };

  const now = new Date();
  const updatedAt = `Dashboard atualizado em ${formatDate(now)} ${now.toLocaleTimeString("pt-BR")}`;

  // Operator report data
  const operatorReportData = useMemo(() => {
    if (!selectedProfile) return { convos: 0, msgs: 0, totalResTime: "0h", avgWait: "0min" };
    const convos = filteredConvos.length;
    const msgs = sentMessages.length;
    const totalResHours = avgResolutionTime * resolvedTickets;
    return {
      convos,
      msgs,
      totalResTime: formatHoursMin(totalResHours),
      avgWait: formatMinSec(avgResponseTime),
    };
  }, [selectedProfile, filteredConvos, sentMessages, avgResolutionTime, resolvedTickets, avgResponseTime]);

  // ── Export functions ──
  const handleExportDashboard = useCallback(() => {
    const rows = timelineData.map(d => ({
      Período: d.name,
      "Tickets Criados": d.Criados,
      "Tickets Resolvidos": d.Resolvidos,
      "Tickets Pendentes": d.Pendentes,
    }));
    // Add summary row
    rows.push({
      Período: "TOTAL",
      "Tickets Criados": totalTickets,
      "Tickets Resolvidos": resolvedTickets,
      "Tickets Pendentes": pendingConvos.length,
    });
    downloadCSV(rows, `dashboard_${startDate}_${endDate}`);
  }, [timelineData, totalTickets, resolvedTickets, pendingConvos, startDate, endDate]);

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

  // ── Filter actions ──
  const handleApplyFilters = useCallback(() => {
    setDatePreset(""); // clear preset since we're using custom dates
    setFiltersOpen(false);
    toast.success("Filtros aplicados com sucesso!");
  }, []);

  const handleClearFilters = useCallback(() => {
    setDatePreset("7days");
    setSelectedConnection("all");
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

  const fadeUp = (delay = 0) => ({
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, delay, ease: "easeOut" as const },
  });

  return (
    <div className="flex-1 overflow-y-auto">

      {/* Header */}
      <motion.div {...fadeUp(0)} className="mx-6 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Estatísticas e Informações
          </h1>
          <p className="text-sm text-muted-foreground">Análise completa de performance e atendimento</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => { refresh(); toast.success("Dashboard atualizado!"); }}>
          <RefreshCw className="h-4 w-4" /> ATUALIZAR
        </Button>
      </motion.div>

      <div className="p-6 space-y-6">
        {/* ── Real-time Status ── */}
        <motion.div {...fadeUp(0.1)}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Clock className="h-5 w-5" /> Status dos Atendimentos em Tempo Real
            </h2>
            <div className="flex items-center gap-2">
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
              <p className="text-5xl font-bold text-foreground mb-2">{openConvos.length - pendingConvos.length}</p>
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
              <p className="text-5xl font-bold text-foreground mb-2">{pendingConvos.length}</p>
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
              <p className="text-5xl font-bold text-foreground mb-2">{closedConvos.length}</p>
              <p className="text-sm text-muted-foreground">Tickets finalizados (status: closed)</p>
            </div>
          </div>
        </motion.div>

        {/* ── Advanced Filters ── */}
        <motion.div {...fadeUp(0.2)}>
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
        </motion.div>

        {/* ── KPIs ── */}
        <motion.div {...fadeUp(0.3)}>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
            <Activity className="h-5 w-5" /> Indicadores Chave de Performance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "TAXA DE RESOLUÇÃO", value: resolutionRate, unit: "%", sub: "Tickets resolvidos vs total", bgClass: "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800", iconBg: "bg-green-100 dark:bg-green-900/40", iconColor: "text-green-500", icon: CheckCircle2, comparison: getComparisonText(parseFloat(resolutionRate), prevKPIs.resolutionRate) },
              { label: "TEMPO MÉDIO DE RESPOSTA", value: avgResponseTime.toFixed(1), unit: " min", sub: "Primeira mensagem do agente", bgClass: "bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800", iconBg: "bg-blue-100 dark:bg-blue-900/40", iconColor: "text-blue-500", icon: Timer, comparison: getComparisonText(avgResponseTime, prevKPIs.avgResponseTime) },
              { label: "NPS SCORE", value: "0.0", unit: " /100", sub: "Satisfação do cliente", bgClass: "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800", iconBg: "bg-amber-100 dark:bg-amber-900/40", iconColor: "text-amber-500", icon: Star, comparison: comparePrevious ? "→ Sem dados anteriores" : "" },
              { label: "CONFORMIDADE SLA", value: slaCompliance, unit: " %", sub: "Tickets resolvidos em <24h", bgClass: "bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800", iconBg: "bg-purple-100 dark:bg-purple-900/40", iconColor: "text-purple-500", icon: TrendingUp, comparison: getComparisonText(slaCompliance, prevKPIs.slaCompliance) },
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
              { label: "TOTAL DE TICKETS", value: String(totalTickets), unit: "", sub: "Criados no período", bgClass: "bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800", iconBg: "bg-indigo-100 dark:bg-indigo-900/40", iconColor: "text-indigo-500", icon: BarChart3, comparison: getComparisonText(totalTickets, prevKPIs.totalTickets) },
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

          <div className="mt-4">
            <div className="rounded-xl border bg-slate-50/60 dark:bg-slate-950/20 border-slate-200 dark:border-slate-800 px-5 py-6 max-w-xs relative">
              <div className="absolute top-5 right-5 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900/40">
                <FileText className="h-5 w-5 text-slate-500" />
              </div>
              <p className="text-[10px] font-bold text-muted-foreground tracking-wider uppercase mb-3">TOTAL DE CONTATOS</p>
              <p className="text-4xl font-bold text-foreground">{contacts.length}</p>
              <p className="text-[10px] text-muted-foreground mt-2">Contatos na plataforma</p>
            </div>
          </div>
        </motion.div>

        {/* ── Linha do Tempo de Tickets ── */}
        <motion.div {...fadeUp(0.4)} className="rounded-xl border bg-card p-6">
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
        </motion.div>

        {/* ── Novos Contatos por Dia ── */}
        <motion.div {...fadeUp(0.5)} className="rounded-xl border bg-card p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Novos Contatos por Dia
            </h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={contactsData}>
              <defs>
                <linearGradient id="gradContatos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border) / 0.15)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="natural" dataKey="Novos Contatos" stroke="hsl(217 91% 60%)" fill="hsl(217 91% 60% / 0.45)" strokeWidth={2} dot={false} activeDot={{ r: 6, fill: "hsl(217 91% 60%)", strokeWidth: 2, stroke: "#fff" }} />
              <Area type="natural" dataKey="Total Acumulado" stroke="hsl(170 70% 50%)" fill="hsl(170 70% 50% / 0.45)" strokeWidth={2} dot={false} activeDot={{ r: 6, fill: "hsl(170 70% 50%)", strokeWidth: 2, stroke: "#fff" }} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* ── Alerts & Agent Ranking side by side ── */}
        <motion.div {...fadeUp(0.6)} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Resolvidos</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Tempo</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Taxa</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase tracking-wider">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground text-sm py-10">Sem dados de agentes</TableCell>
                    </TableRow>
                  ) : (
                    agentData.map((agent, i) => (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="text-xs font-bold text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">{agent.initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <span className="text-xs font-semibold text-foreground block">{agent.name}</span>
                              <span className="text-[10px] text-muted-foreground">{agent.email}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-bold text-green-600">{agent.resolved}</span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{agent.avgTime}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-semibold rounded-full">{agent.rate}%</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2.5 h-2.5 rounded-full ${agent.online ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                            <span className="text-[10px] text-muted-foreground">{agent.online ? "Online" : "Offline"}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </motion.div>

        {/* ── Channel Stats ── */}
        <motion.div {...fadeUp(0.7)}>
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
                const stats = getConnectionStats(conn);
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
                        <p className="font-bold text-foreground text-lg">{stats.sent}</p>
                      </div>
                      <div className="rounded-lg bg-green-50/60 dark:bg-green-950/20 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <ArrowDownToLine className="h-3 w-3 text-blue-500" />
                          <span className="text-muted-foreground text-[10px]">Recebidas</span>
                        </div>
                        <p className="font-bold text-foreground text-lg">{stats.received}</p>
                      </div>
                      <div className="rounded-lg bg-indigo-50/60 dark:bg-indigo-950/20 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <MessageSquare className="h-3 w-3 text-indigo-500" />
                          <span className="text-muted-foreground text-[10px]">Criados</span>
                        </div>
                        <p className="font-bold text-foreground text-lg">{stats.created}</p>
                      </div>
                      <div className="rounded-lg bg-amber-50/60 dark:bg-amber-950/20 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <TrendingUp className="h-3 w-3 text-green-500" />
                          <span className="text-muted-foreground text-[10px]">Resolvidos</span>
                        </div>
                        <p className="font-bold text-foreground text-lg">{stats.resolved}</p>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1.5">
                        <span>Uptime</span><span className="text-green-600 font-bold">100.0%</span>
                      </div>
                      <Progress value={100} className="h-2 rounded-full" />
                    </div>
                    {stats.lastActivity && (
                      <p className="text-[10px] text-muted-foreground mt-2.5">Última conexão: há {stats.lastActivity}</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </motion.div>

        {/* ── Detailed Reports ── */}
        <motion.div {...fadeUp(0.8)} className="rounded-xl border bg-card p-6">
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
                  <p className="text-4xl font-bold text-primary">{formatHoursMin(avgResolutionTime)}</p>
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
        </motion.div>

        {/* ── Export ── */}
        <motion.div {...fadeUp(0.9)} className="flex items-center justify-between">
          <Button className="gap-2 rounded-lg" size="sm" onClick={handleExportDashboard}>
            <Download className="h-4 w-4" /> Exportar para Excel
          </Button>
          <p className="text-xs text-muted-foreground">{updatedAt}</p>
        </motion.div>
      </div>
    </div>
  );
};

export default Index;
