import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformName } from "@/hooks/usePlatformName";
import { FloatingInput } from "@/components/ui/floating-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Filter, MessageSquareText, ListOrdered, Monitor, CheckCircle2, Users, ArrowDownToLine, ArrowUpToLine, Clock, Timer, CalendarDays, Star } from "lucide-react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area } from "recharts";

const BLUE = "hsl(var(--primary))";

const DashboardLegacy = () => {
  const { user } = useAuth();
  const { platformName } = usePlatformName();
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [evoConns, setEvoConns] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Date filters
  const today = new Date().toISOString().split("T")[0];
  const [overviewStart, setOverviewStart] = useState(today);
  const [overviewEnd, setOverviewEnd] = useState(today);
  const [userStart, setUserStart] = useState(today);
  const [userEnd, setUserEnd] = useState(today);
  const [groupStart, setGroupStart] = useState(today);
  const [groupEnd, setGroupEnd] = useState(today);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [c, m, ct, evo, pr, sub] = await Promise.all([
        supabase.from("conversations").select("*"),
        supabase.from("messages").select("*"),
        supabase.from("contacts").select("*"),
        supabase.from("evolution_connections").select("*"),
        supabase.from("profiles").select("*"),
        supabase.from("subscriptions").select("*"),
      ]);
      setConversations(c.data || []);
      setMessages(m.data || []);
      setContacts(ct.data || []);
      setEvoConns(evo.data || []);
      setProfiles(pr.data || []);
      setSubscriptions(sub.data || []);
      setLoading(false);
    };
    load();
  }, []);

  // Stats
  const openConvos = conversations.filter(c => c.status === "open");
  const pendingConvos = conversations.filter(c => c.status === "open" && c.unread_count > 0);
  const closedConvos = conversations.filter(c => c.status === "closed" || c.status === "resolved");
  const onlineUsers = profiles.filter(p => p.status === "online");
  const totalConnections = evoConns.length;

  const sentMessages = messages.filter(m => m.from_me);
  const receivedMessages = messages.filter(m => !m.from_me);

  // Average resolution time
  const avgResolution = useMemo(() => {
    const times = closedConvos
      .filter(c => c.created_at && c.updated_at)
      .map(c => (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 1000 / 3600);
    if (times.length === 0) return { h: 0, m: 0 };
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return { h: Math.floor(avg), m: Math.round((avg % 1) * 60) };
  }, [closedConvos]);

  // Average wait time
  const avgWait = useMemo(() => {
    const waits: number[] = [];
    const convGroups: Record<string, { received?: string; replied?: string }> = {};
    for (const m of messages.filter(m => !m.from_me)) {
      if (!convGroups[m.conversation_id]) convGroups[m.conversation_id] = {};
      if (!convGroups[m.conversation_id].received || m.created_at < convGroups[m.conversation_id].received!)
        convGroups[m.conversation_id].received = m.created_at;
    }
    for (const m of messages.filter(m => m.from_me)) {
      if (convGroups[m.conversation_id] && !convGroups[m.conversation_id].replied)
        convGroups[m.conversation_id].replied = m.created_at;
    }
    Object.values(convGroups)
      .filter(g => g.received && g.replied)
      .forEach(g => waits.push((new Date(g.replied!).getTime() - new Date(g.received!).getTime()) / 1000 / 3600));
    if (waits.length === 0) return { h: 0, m: 0 };
    const avg = waits.reduce((a, b) => a + b, 0) / waits.length;
    return { h: Math.floor(avg), m: Math.round((avg % 1) * 60) };
  }, [messages]);

  // Next expiry
  const nextExpiry = useMemo(() => {
    const sub = subscriptions.find(s => s.user_id === user?.id && s.expires_at);
    return sub?.expires_at ? new Date(sub.expires_at).toLocaleDateString("pt-BR") : null;
  }, [subscriptions, user]);

  // Overview chart - group by hour for selected date range
  const overviewChart = useMemo(() => {
    const start = new Date(overviewStart);
    const end = new Date(overviewEnd);
    end.setHours(23, 59, 59, 999);
    const filtered = conversations.filter(c => {
      const d = new Date(c.created_at);
      return d >= start && d <= end;
    });
    // Group by hour ranges
    const hourGroups: Record<string, number> = {};
    for (const c of filtered) {
      const h = new Date(c.created_at).getHours();
      const label = `Das ${String(h).padStart(2, "0")}:00 as ${String(h).padStart(2, "0")}:59`;
      hourGroups[label] = (hourGroups[label] || 0) + 1;
    }
    return Object.entries(hourGroups).map(([name, value]) => ({ name, "Visão Geral": value }));
  }, [conversations, overviewStart, overviewEnd]);

  // Pie chart - grouped view
  const groupedChart = useMemo(() => {
    const start = new Date(groupStart);
    const end = new Date(groupEnd);
    end.setHours(23, 59, 59, 999);
    const filtered = conversations.filter(c => {
      const d = new Date(c.created_at);
      return d >= start && d <= end;
    });
    const hourGroups: Record<string, number> = {};
    for (const c of filtered) {
      const h = new Date(c.created_at).getHours();
      const label = `Das ${String(h).padStart(2, "0")}:00 as ${String(h).padStart(2, "0")}:59`;
      hourGroups[label] = (hourGroups[label] || 0) + 1;
    }
    return Object.entries(hourGroups).map(([name, value]) => ({ name, value }));
  }, [conversations, groupStart, groupEnd]);

  // User stats table
  const userStats = useMemo(() => {
    const start = new Date(userStart);
    const end = new Date(userEnd);
    end.setHours(23, 59, 59, 999);
    return profiles.map(p => {
      const userConvos = conversations.filter(c => {
        const d = new Date(c.created_at);
        return d >= start && d <= end;
      });
      const total = userConvos.length;
      const inProgress = userConvos.filter(c => c.status === "open").length;
      const finished = userConvos.filter(c => c.status === "closed" || c.status === "resolved").length;
      return {
        name: p.full_name || p.email || "Agente",
        rating: 0,
        total,
        inProgress,
        finished,
        waitTime: `${String(avgWait.h).padStart(2, "0")}h ${String(avgWait.m).padStart(2, "0")}m`,
        serviceTime: `${String(avgResolution.h).padStart(2, "0")}h ${String(avgResolution.m).padStart(2, "0")}m`,
        online: p.status === "online",
      };
    });
  }, [profiles, conversations, userStart, userEnd, avgWait, avgResolution]);

  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuário";

  const PIE_COLORS = ["hsl(195 100% 50%)", "hsl(210 100% 56%)", "hsl(240 60% 60%)", "hsl(30 100% 50%)"];

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1 py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statCards = [
    { label: "Atendendo", value: String(openConvos.length - pendingConvos.length), icon: MessageSquareText },
    { label: "Aguardando", value: String(pendingConvos.length), icon: ListOrdered },
    { label: "Online", value: `${onlineUsers.length}/${profiles.length}`, icon: Monitor },
    { label: "Concluídos", value: String(closedConvos.length), icon: CheckCircle2 },
    { label: "Contatos", value: String(contacts.length), icon: Users },
    { label: "Recebidas", value: `${receivedMessages.length}/${messages.length}`, icon: ArrowDownToLine },
  ];

  const statCards2 = [
    { label: "Enviadas", value: `${sentMessages.length}/${messages.length}`, icon: ArrowUpToLine },
    { label: "Média", value: `${String(avgResolution.h).padStart(2, "0")}h ${String(avgResolution.m).padStart(2, "0")}m`, icon: Clock },
    { label: "Espera", value: `${String(avgWait.h).padStart(2, "0")}h ${String(avgWait.m).padStart(2, "0")}m`, icon: Timer },
    { label: "Vencimento", value: nextExpiry || "N/A", icon: CalendarDays },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-card p-3 shadow-md text-xs">
        <p className="font-medium text-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-muted-foreground">
            {p.name}: <span className="font-medium text-foreground">{p.value}</span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Top stat cards row 1 */}
      <div className="p-6 pb-0">
        <div className="flex items-center justify-end mb-4">
          <Button variant="ghost" size="icon"><Filter className="h-5 w-5 text-muted-foreground" /></Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
          {statCards.map(card => (
            <div key={card.label} className="bg-primary text-primary-foreground rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold">{card.label}</span>
                <p className="text-xl font-bold mt-0.5">{card.value}</p>
              </div>
              <card.icon className="h-6 w-6" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="hidden lg:block col-span-2" />
          {statCards2.map(card => (
            <div key={card.label} className="bg-primary text-primary-foreground rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold">{card.label}</span>
                <p className="text-lg font-bold mt-0.5">{card.value}</p>
              </div>
              <card.icon className="h-6 w-6" />
            </div>
          ))}
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Overview Chart */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-lg font-semibold text-primary mb-4">
            Visão Geral do Período ({overviewChart.reduce((s, d) => s + d["Visão Geral"], 0)})
          </h3>
          <div className="flex items-end gap-3 mb-4">
            <FloatingInput type="date" label="Data inicial" value={overviewStart} onChange={e => setOverviewStart(e.target.value)} className="w-40" />
            <FloatingInput type="date" label="Data final" value={overviewEnd} onChange={e => setOverviewEnd(e.target.value)} className="w-40" />
            <Button size="sm" className="uppercase font-semibold text-xs px-5 bg-foreground text-background hover:bg-foreground/90">Filtrar</Button>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={overviewChart}>
              <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border) / 0.15)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="natural" dataKey="Visão Geral" stroke="hsl(217 91% 60%)" fill="hsl(217 91% 60% / 0.45)" strokeWidth={2} dot={false} activeDot={{ r: 6, fill: "hsl(217 91% 60%)", strokeWidth: 2, stroke: "#fff" }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Two columns: User chart + Grouped pie */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Atendimentos por Usuário */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-lg font-semibold text-primary mb-4">Atendimentos por Usuário</h3>
            <div className="flex items-end gap-3 mb-4">
              <FloatingInput type="date" label="Data Inicial" value={userStart} onChange={e => setUserStart(e.target.value)} className="w-36" />
              <FloatingInput type="date" label="Data Final" value={userEnd} onChange={e => setUserEnd(e.target.value)} className="w-36" />
              <Button size="sm" className="uppercase font-semibold text-xs px-5 bg-foreground text-background hover:bg-foreground/90">Filtrar</Button>
            </div>
            <div className="flex items-stretch">
              <div className="flex items-center -mr-2">
                <span className="text-xs text-muted-foreground" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>Atendimentos por Usuário</span>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={userStats.map(u => ({ name: u.name.split(" ")[0], Atendimentos: u.total }))}>
                  <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border) / 0.15)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="natural" dataKey="Atendimentos" stroke="hsl(217 91% 60%)" fill="hsl(217 91% 60% / 0.45)" strokeWidth={2} dot={false} activeDot={{ r: 6, fill: "hsl(217 91% 60%)", strokeWidth: 2, stroke: "#fff" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Visão Agrupada do Período */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-lg font-semibold text-primary mb-4">
              Visão Agrupada do Período ({groupedChart.reduce((s, d) => s + d.value, 0)})
            </h3>
            <div className="flex items-end gap-3 mb-4">
              <FloatingInput type="date" label="Data inicial" value={groupStart} onChange={e => setGroupStart(e.target.value)} className="w-36" />
              <FloatingInput type="date" label="Data final" value={groupEnd} onChange={e => setGroupEnd(e.target.value)} className="w-36" />
              <Button size="sm" className="uppercase font-semibold text-xs px-5 bg-foreground text-background hover:bg-foreground/90">Filtrar</Button>
            </div>
            <div className="flex items-stretch">
              <div className="flex items-center -mr-2">
                <span className="text-xs text-muted-foreground" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>Atendimentos</span>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={groupedChart.length > 0 ? groupedChart : [{ name: "Sem dados", value: 1 }]}
                    cx="50%"
                    cy="55%"
                    outerRadius={90}
                    dataKey="value"
                    label={false}
                  >
                    {(groupedChart.length > 0 ? groupedChart : [{ name: "Sem dados", value: 1 }]).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend verticalAlign="top" align="right" layout="horizontal" iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11, paddingBottom: 8 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* User stats table */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 border-b border-border">
                  <TableHead className="text-xs font-bold text-foreground py-3">Nome</TableHead>
                  <TableHead className="text-xs font-bold text-foreground py-3">Avaliações</TableHead>
                  <TableHead className="text-xs font-bold text-foreground py-3 text-center">Total de Atendimentos</TableHead>
                  <TableHead className="text-xs font-bold text-foreground py-3 text-center">Em Andamento</TableHead>
                  <TableHead className="text-xs font-bold text-foreground py-3 text-center">Finalizados</TableHead>
                  <TableHead className="text-xs font-bold text-foreground py-3">T.M. de Espera</TableHead>
                  <TableHead className="text-xs font-bold text-foreground py-3">T.M. de Atendimento</TableHead>
                  <TableHead className="text-xs font-bold text-foreground py-3 text-center">Status (Atual)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userStats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      Nenhum operador encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  userStats.map((u, i) => (
                    <TableRow key={i} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <TableCell className="text-sm font-medium py-3">{u.name}</TableCell>
                      <TableCell className="py-3">
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map(s => (
                            <Star key={s} className={`h-4 w-4 ${s <= u.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-center py-3">{u.total}</TableCell>
                      <TableCell className="text-sm text-center py-3">{u.inProgress}</TableCell>
                      <TableCell className="text-sm text-center py-3">{u.finished}</TableCell>
                      <TableCell className="text-sm py-3">{u.waitTime}</TableCell>
                      <TableCell className="text-sm py-3">{u.serviceTime}</TableCell>
                      <TableCell className="text-center py-3">
                        {u.online ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500 inline-block" />
                        ) : (
                          <span className="inline-block w-3 h-3 rounded-full bg-muted-foreground/40" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardLegacy;
