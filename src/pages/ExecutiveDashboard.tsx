import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Minus, Printer, RefreshCw, DollarSign, MessageSquare, Star, ShieldCheck } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";

interface DashboardData {
  period: { days: number; since: string; until: string };
  revenue: { total: number; paid_count: number; total_charges: number; avg_ticket: number };
  conversations: { total: number; closed: number; open: number; pending: number; resolution_rate: number };
  satisfaction: {
    avg_csat: number; csat_responses: number;
    csat_distribution: Record<string, number>;
    avg_nps: number; nps_responses: number; nps_index: number;
  };
  sla: { compliance_pct: number | null; within_sla: number; breached: number; total_with_sla: number; avg_response_min: number };
  top_agents: Array<{ id: string; name: string; avatar_url: string | null; closed_count: number; avg_csat: number | null }>;
  channels: Array<{ channel: string; total: number; closed: number }>;
  daily_volume: Array<{ date: string; opened: number; closed: number }>;
  growth: { revenue: number; conversations_closed: number; avg_csat: number; sla_compliance: number | null };
}

const PERIOD_OPTIONS = [
  { label: "7 dias", value: 7 },
  { label: "30 dias", value: 30 },
  { label: "90 dias", value: 90 },
];

const CHANNEL_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const fmtCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtNum = (v: number) => new Intl.NumberFormat("pt-BR").format(v);

function GrowthBadge({ pct, suffix = "%" }: { pct: number | null; suffix?: string }) {
  if (pct === null || pct === undefined) return <span className="text-muted-foreground text-xs">—</span>;
  if (pct > 0) return (
    <span className="flex items-center gap-1 text-emerald-500 text-sm font-semibold">
      <TrendingUp className="h-3.5 w-3.5" />+{pct}{suffix}
    </span>
  );
  if (pct < 0) return (
    <span className="flex items-center gap-1 text-red-500 text-sm font-semibold">
      <TrendingDown className="h-3.5 w-3.5" />{pct}{suffix}
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-sm">
      <Minus className="h-3.5 w-3.5" />0{suffix}
    </span>
  );
}

function KpiCard({
  icon: Icon,
  iconClass,
  label,
  value,
  sub,
  growth,
}: {
  icon: React.ElementType;
  iconClass?: string;
  label: string;
  value: string;
  sub?: string;
  growth?: number | null;
}) {
  return (
    <Card className="p-5 flex flex-col gap-3 bg-card border border-border shadow-sm">
      <div className="flex items-center justify-between">
        <div className={`rounded-xl p-2.5 ${iconClass || "bg-primary/10"}`}>
          <Icon className={`h-5 w-5 ${iconClass ? "text-white" : "text-primary"}`} />
        </div>
        {growth !== undefined && <GrowthBadge pct={growth} />}
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </Card>
  );
}

function AgentRow({ agent, rank }: { agent: DashboardData["top_agents"][0]; rank: number }) {
  const initials = agent.name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-muted-foreground text-sm w-5 text-center font-mono">{rank}</span>
      {agent.avatar_url ? (
        <img src={agent.avatar_url} alt={agent.name} className="h-8 w-8 rounded-full object-cover" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{agent.name}</p>
        <p className="text-xs text-muted-foreground">{fmtNum(agent.closed_count)} fechadas</p>
      </div>
      {agent.avg_csat !== null ? (
        <Badge variant="secondary" className="gap-1 text-xs">
          <Star className="h-3 w-3 text-yellow-500" />
          {agent.avg_csat.toFixed(1)}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      )}
    </div>
  );
}

export default function ExecutiveDashboard() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<DashboardData>(`/stats/executive-dashboard?days=${days}`);
      setData(res as DashboardData);
    } catch (e: any) {
      toast.error("Erro ao carregar dashboard: " + (e?.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const handlePrint = () => window.print();

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6 print:p-4 print:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard Executivo</h1>
          <p className="text-sm text-muted-foreground">Visão consolidada para gestão</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  days === opt.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
            <Printer className="h-4 w-4" />
            Imprimir
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !data ? null : (
        <>
          {/* Row 1 — KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              icon={DollarSign}
              iconClass="bg-emerald-500"
              label="Receita Total"
              value={fmtCurrency(data.revenue.total)}
              sub={`${fmtNum(data.revenue.paid_count)} cobranças pagas · ticket médio ${fmtCurrency(data.revenue.avg_ticket)}`}
              growth={data.growth.revenue}
            />
            <KpiCard
              icon={MessageSquare}
              iconClass="bg-blue-500"
              label="Conversas Fechadas"
              value={fmtNum(data.conversations.closed)}
              sub={`${data.conversations.resolution_rate}% taxa de resolução · ${fmtNum(data.conversations.open)} abertas`}
              growth={data.growth.conversations_closed}
            />
            <KpiCard
              icon={Star}
              iconClass="bg-yellow-500"
              label="CSAT Médio"
              value={data.satisfaction.avg_csat > 0 ? `${data.satisfaction.avg_csat.toFixed(1)} / 5` : "—"}
              sub={`${fmtNum(data.satisfaction.csat_responses)} avaliações · NPS ${data.satisfaction.avg_nps > 0 ? data.satisfaction.avg_nps.toFixed(1) : "—"}`}
              growth={data.growth.avg_csat}
            />
            <KpiCard
              icon={ShieldCheck}
              iconClass="bg-violet-500"
              label="SLA Compliance"
              value={data.sla.compliance_pct !== null ? `${data.sla.compliance_pct}%` : "—"}
              sub={`${fmtNum(data.sla.within_sla)} no prazo · ${fmtNum(data.sla.breached)} violadas · resp. média ${data.sla.avg_response_min}min`}
              growth={data.growth.sla_compliance}
            />
          </div>

          {/* Row 2 — Volume + Canais */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Area chart */}
            <Card className="lg:col-span-2 p-5">
              <p className="font-semibold mb-4">Volume Diário de Conversas</p>
              {data.daily_volume.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data.daily_volume} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorOpened" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorClosed" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={v => {
                        const d = new Date(v);
                        return `${d.getDate()}/${d.getMonth() + 1}`;
                      }}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(val, name) => [fmtNum(Number(val)), name === "opened" ? "Abertas" : "Fechadas"]}
                      labelFormatter={v => {
                        const d = new Date(v);
                        return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
                      }}
                    />
                    <Legend formatter={v => v === "opened" ? "Abertas" : "Fechadas"} />
                    <Area type="monotone" dataKey="opened" stroke="#6366f1" fill="url(#colorOpened)" strokeWidth={2} dot={false} />
                    <Area type="monotone" dataKey="closed" stroke="#10b981" fill="url(#colorClosed)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Pie chart canais */}
            <Card className="p-5">
              <p className="font-semibold mb-4">Distribuição por Canal</p>
              {data.channels.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={data.channels}
                      dataKey="total"
                      nameKey="channel"
                      cx="50%"
                      cy="45%"
                      outerRadius={75}
                      label={({ channel, percent }) => `${channel} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {data.channels.map((_, i) => (
                        <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val, name) => [fmtNum(Number(val)), name]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Row 3 — Top Agents */}
          <Card className="p-5">
            <p className="font-semibold mb-3">Top 5 Agentes</p>
            {data.top_agents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum agente com conversas fechadas no período</p>
            ) : (
              <div className="divide-y divide-border">
                {data.top_agents.map((agent, i) => (
                  <AgentRow key={agent.id} agent={agent} rank={i + 1} />
                ))}
              </div>
            )}
          </Card>

          {/* Row 4 — Growth Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Crescimento de Receita", value: data.growth.revenue },
              { label: "Conversas Fechadas", value: data.growth.conversations_closed },
              { label: "Variação CSAT", value: data.growth.avg_csat },
              { label: "SLA Compliance (pp)", value: data.growth.sla_compliance },
            ].map(item => (
              <Card key={item.label} className="p-5 flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <div className="text-lg font-bold">
                  <GrowthBadge pct={item.value} />
                </div>
                <p className="text-xs text-muted-foreground">vs. período anterior</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
