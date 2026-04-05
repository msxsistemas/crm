import { useState, useEffect, useCallback } from "react";
import {
  DollarSign, TrendingUp, Target, FileText, Download,
  Filter, RefreshCw, ArrowUpRight, ArrowDownRight,
  BarChart2, Users, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, startOfYear, endOfYear, eachWeekOfInterval, eachMonthOfInterval, endOfWeek, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Types ──────────────────────────────────────────────────────────────────

type Period = "this_month" | "last_month" | "quarter" | "year";

interface Opportunity {
  id: string;
  title: string;
  value: number;
  status: string;
  created_at: string;
  assigned_to: string | null;
  contact_name?: string | null;
}

interface Proposal {
  id: string;
  total: number;
  status: string;
  created_at: string;
}

interface AgentRevenue {
  agentId: string;
  agentName: string;
  total: number;
  percent: number;
}

interface BarData {
  label: string;
  value: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const formatPct = (v: number) => `${v.toFixed(1)}%`;

function getPeriodRange(period: Period): { from: Date; to: Date } {
  const now = new Date();
  switch (period) {
    case "this_month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "last_month": {
      const lm = subMonths(now, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    case "quarter":
      return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case "year":
      return { from: startOfYear(now), to: endOfYear(now) };
  }
}

function buildBarData(period: Period, opps: Opportunity[], range: { from: Date; to: Date }): BarData[] {
  if (period === "this_month" || period === "last_month") {
    // weekly buckets
    const weeks = eachWeekOfInterval({ start: range.from, end: range.to }, { weekStartsOn: 1 });
    return weeks.map((weekStart) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const total = opps
        .filter((o) => {
          const d = new Date(o.created_at);
          return o.status === "won" && d >= weekStart && d <= weekEnd;
        })
        .reduce((s, o) => s + (o.value || 0), 0);
      return { label: `Sem ${format(weekStart, "dd/MM")}`, value: total };
    });
  } else {
    // monthly buckets
    const months = eachMonthOfInterval({ start: range.from, end: range.to });
    return months.map((monthStart) => {
      const monthEnd = endOfMonth(monthStart);
      const total = opps
        .filter((o) => {
          const d = new Date(o.created_at);
          return o.status === "won" && d >= monthStart && d <= monthEnd;
        })
        .reduce((s, o) => s + (o.value || 0), 0);
      return { label: format(monthStart, "MMM/yy", { locale: ptBR }), value: total };
    });
  }
}

// ── Sub-components ────────────────────────────────────────────────────────

function KpiCard({
  icon,
  title,
  value,
  sub,
  positive,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  sub?: string;
  positive?: boolean | null;
}) {
  return (
    <Card className="print:shadow-none">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && (
              <p
                className={`text-xs flex items-center gap-1 ${
                  positive === true
                    ? "text-green-600"
                    : positive === false
                    ? "text-red-500"
                    : "text-muted-foreground"
                }`}
              >
                {positive === true && <ArrowUpRight className="h-3 w-3" />}
                {positive === false && <ArrowDownRight className="h-3 w-3" />}
                {sub}
              </p>
            )}
          </div>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BarChart({ data }: { data: BarData[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-48 w-full">
      {data.map((d, i) => {
        const heightPct = (d.value / max) * 100;
        return (
          <div key={i} className="flex flex-col items-center flex-1 gap-1">
            <span className="text-[10px] text-muted-foreground font-medium">
              {d.value > 0 ? formatCurrency(d.value).replace("R$\u00a0", "") : ""}
            </span>
            <div className="w-full flex items-end" style={{ height: "140px" }}>
              <div
                className="w-full bg-green-500 rounded-t-sm transition-all duration-500 hover:bg-green-400"
                style={{ height: `${Math.max(heightPct, 2)}%` }}
                title={`${d.label}: ${formatCurrency(d.value)}`}
              />
            </div>
            <span className="text-[10px] text-muted-foreground text-center leading-tight">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function AgentChart({ data }: { data: AgentRevenue[] }) {
  const max = Math.max(...data.map((d) => d.total), 1);
  return (
    <div className="space-y-3">
      {data.map((agent, i) => (
        <div key={i} className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground truncate max-w-[180px]">{agent.agentName}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-semibold text-green-600">{formatCurrency(agent.total)}</span>
              <Badge variant="secondary" className="text-xs">{formatPct(agent.percent)}</Badge>
            </div>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${(agent.total / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
      {data.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado disponível</p>
      )}
    </div>
  );
}

function FunnelChart({ stages }: { stages: { label: string; count: number }[] }) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="space-y-2">
      {stages.map((stage, i) => {
        const widthPct = Math.max((stage.count / max) * 100, 8);
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-32 shrink-0 text-right">{stage.label}</span>
            <div className="flex-1 flex justify-center">
              <div
                className="h-8 bg-blue-500 rounded flex items-center justify-center text-white text-xs font-bold transition-all duration-500"
                style={{ width: `${widthPct}%`, minWidth: "40px" }}
              >
                {stage.count}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────

const PERIOD_LABELS: Record<Period, string> = {
  this_month: "Este mês",
  last_month: "Mês anterior",
  quarter: "Trimestre",
  year: "Ano",
};

const FUNNEL_STAGES: { key: string; label: string }[] = [
  { key: "prospecting", label: "Leads" },
  { key: "qualification", label: "Em contato" },
  { key: "proposal", label: "Proposta enviada" },
  { key: "negotiation", label: "Negociação" },
  { key: "won", label: "Ganho" },
];

const FinancialReport = () => {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("this_month");
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [prevOpportunities, setPrevOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStage, setFilterStage] = useState<string>("all");
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [searchTable, setSearchTable] = useState("");

  const range = getPeriodRange(period);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Previous period for comparison
      const prevFrom = subMonths(range.from, 1);
      const prevTo = subMonths(range.to, 1);

      const [oppsRes, prevOppsRes, propsRes] = await Promise.all([
        db
          .from("opportunities")
          .select("id, title, value, status, created_at, assigned_to, contact_id")
          .gte("created_at", range.from.toISOString())
          .lte("created_at", range.to.toISOString()),
        db
          .from("opportunities")
          .select("id, value, status, created_at, assigned_to")
          .gte("created_at", prevFrom.toISOString())
          .lte("created_at", prevTo.toISOString()),
        db
          .from("proposals")
          .select("id, total, status, created_at")
          .gte("created_at", range.from.toISOString())
          .lte("created_at", range.to.toISOString()),
      ]);

      const rawOpps: any[] = oppsRes.data || [];

      // Resolve contact names
      const contactIds = [...new Set(rawOpps.map((o) => o.contact_id).filter(Boolean))];
      let contactMap: Record<string, string> = {};
      if (contactIds.length > 0) {
        const { data: contacts } = await db
          .from("contacts")
          .select("id, name")
          .in("id", contactIds);
        (contacts || []).forEach((c: any) => {
          contactMap[c.id] = c.name;
        });
      }

      // Resolve agent names from profiles
      const agentIds = [...new Set(rawOpps.map((o) => o.assigned_to).filter(Boolean))];
      let agentMap: Record<string, string> = {};
      if (agentIds.length > 0) {
        const { data: profiles } = await db
          .from("profiles")
          .select("id, full_name")
          .in("id", agentIds);
        (profiles || []).forEach((p: any) => {
          agentMap[p.id] = p.full_name || p.id;
        });
      }

      const opps: Opportunity[] = rawOpps.map((o) => ({
        ...o,
        contact_name: contactMap[o.contact_id] || null,
        agent_name: agentMap[o.assigned_to] || o.assigned_to || "—",
      }));

      setOpportunities(opps);
      setPrevOpportunities(prevOppsRes.data || []);
      setProposals(propsRes.data || []);
    } catch (err: any) {
      toast.error("Erro ao carregar dados financeiros");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── KPI calculations ──
  const wonOpps = opportunities.filter((o) => o.status === "won");
  const totalRevenue = wonOpps.reduce((s, o) => s + (o.value || 0), 0);
  const avgTicket = wonOpps.length > 0 ? totalRevenue / wonOpps.length : 0;
  const conversionRate = opportunities.length > 0 ? (wonOpps.length / opportunities.length) * 100 : 0;
  const acceptedProposals = proposals.filter((p) => p.status === "accepted").length;

  // Previous period KPIs
  const prevWon = prevOpportunities.filter((o) => o.status === "won");
  const prevRevenue = prevWon.reduce((s, o) => s + (o.value || 0), 0);
  const revenueDiffPct =
    prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : null;

  // ── Chart 1: revenue by period ──
  const barData = buildBarData(period, opportunities, range);

  // ── Chart 2: revenue by agent ──
  const agentTotals: Record<string, { name: string; total: number }> = {};
  wonOpps.forEach((o) => {
    const key = o.assigned_to || "__none__";
    const name = (o as any).agent_name || "Sem agente";
    if (!agentTotals[key]) agentTotals[key] = { name, total: 0 };
    agentTotals[key].total += o.value || 0;
  });
  const agentData: AgentRevenue[] = Object.entries(agentTotals)
    .map(([agentId, { name, total }]) => ({
      agentId,
      agentName: name,
      total,
      percent: totalRevenue > 0 ? (total / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // ── Chart 3: funnel ──
  const funnelStages = FUNNEL_STAGES.map((s) => ({
    label: s.label,
    count: opportunities.filter((o) => o.status === s.key).length,
  }));

  // ── Table ──
  const allAgentsForFilter = [...new Set(opportunities.map((o) => (o as any).agent_name || "—"))];
  const filteredOpps = opportunities.filter((o) => {
    const matchStage = filterStage === "all" || o.status === filterStage;
    const matchAgent = filterAgent === "all" || (o as any).agent_name === filterAgent;
    const matchSearch =
      !searchTable ||
      o.title?.toLowerCase().includes(searchTable.toLowerCase()) ||
      o.contact_name?.toLowerCase().includes(searchTable.toLowerCase());
    return matchStage && matchAgent && matchSearch;
  });

  // ── CSV Export ──
  const exportCSV = () => {
    const header = ["Contato", "Valor", "Estágio", "Agente", "Data"];
    const rows = filteredOpps.map((o) => [
      o.contact_name || o.title || "—",
      o.value,
      o.status,
      (o as any).agent_name || "—",
      format(new Date(o.created_at), "dd/MM/yyyy"),
    ]);
    const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio_financeiro_${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const STATUS_LABEL: Record<string, string> = {
    prospecting: "Prospecção",
    qualification: "Qualificação",
    proposal: "Proposta",
    negotiation: "Negociação",
    won: "Ganho",
    lost: "Perdido",
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border print:hidden">
        <div>
          <h1 className="text-xl font-bold text-blue-600">Relatório Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            {format(range.from, "dd/MM/yyyy")} – {format(range.to, "dd/MM/yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-44 print:hidden">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PERIOD_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 print:hidden"
            onClick={fetchData}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 print:hidden"
            onClick={() => window.print()}
          >
            <Download className="h-4 w-4" />
            Exportar PDF
          </Button>
        </div>
      </div>

      {/* Print-only header */}
      <div className="hidden print:block px-6 py-4 border-b">
        <h1 className="text-2xl font-bold">Relatório Financeiro — {PERIOD_LABELS[period]}</h1>
        <p className="text-sm text-gray-500">
          {format(range.from, "dd/MM/yyyy")} – {format(range.to, "dd/MM/yyyy")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={<DollarSign className="h-5 w-5" />}
            title="💰 Receita Total"
            value={formatCurrency(totalRevenue)}
            sub={
              revenueDiffPct !== null
                ? `vs mês anterior: ${revenueDiffPct >= 0 ? "+" : ""}${revenueDiffPct.toFixed(1)}% ${revenueDiffPct >= 0 ? "↑" : "↓"}`
                : undefined
            }
            positive={revenueDiffPct !== null ? revenueDiffPct >= 0 : undefined}
          />
          <KpiCard
            icon={<TrendingUp className="h-5 w-5" />}
            title="📈 Ticket Médio"
            value={formatCurrency(avgTicket)}
          />
          <KpiCard
            icon={<Target className="h-5 w-5" />}
            title="🎯 Taxa de Conversão"
            value={formatPct(conversionRate)}
            sub={`${wonOpps.length} ganhos / ${opportunities.length} total`}
          />
          <KpiCard
            icon={<FileText className="h-5 w-5" />}
            title="📋 Propostas Aceitas"
            value={String(acceptedProposals)}
            sub={`de ${proposals.length} propostas no período`}
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Revenue over time */}
          <Card className="print:break-inside-avoid">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-green-500" />
                Receita por Período
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-48 flex items-center justify-center">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <BarChart data={barData} />
              )}
            </CardContent>
          </Card>

          {/* Chart 2: Revenue by agent */}
          <Card className="print:break-inside-avoid">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                Receita por Agente
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-48 flex items-center justify-center">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <AgentChart data={agentData} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chart 3: Funnel */}
        <Card className="print:break-inside-avoid">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Filter className="h-4 w-4 text-orange-500" />
              Funil de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-32 flex items-center justify-center">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <FunnelChart stages={funnelStages} />
            )}
          </CardContent>
        </Card>

        {/* Chart 4: Top opportunities by value */}
        <Card className="print:break-inside-avoid">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              Top Oportunidades por Valor
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...opportunities]
                  .sort((a, b) => (b.value || 0) - (a.value || 0))
                  .slice(0, 5)
                  .map((o, i) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-muted-foreground font-medium">{i + 1}</TableCell>
                      <TableCell className="font-medium">{o.title || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{o.contact_name || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {STATUS_LABEL[o.status] || o.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {formatCurrency(o.value || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                {opportunities.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Nenhuma oportunidade no período
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Opportunities table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-sm font-semibold">Oportunidades do Período</CardTitle>
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <Input
                  placeholder="Pesquisar..."
                  value={searchTable}
                  onChange={(e) => setSearchTable(e.target.value)}
                  className="h-8 w-40 text-sm"
                />
                <Select value={filterStage} onValueChange={setFilterStage}>
                  <SelectTrigger className="h-8 w-40 text-sm">
                    <SelectValue placeholder="Estágio" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos estágios</SelectItem>
                    {Object.entries(STATUS_LABEL).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterAgent} onValueChange={setFilterAgent}>
                  <SelectTrigger className="h-8 w-40 text-sm">
                    <SelectValue placeholder="Agente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos agentes</SelectItem>
                    {allAgentsForFilter.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" className="h-8 gap-2" onClick={exportCSV}>
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contato</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOpps.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-muted-foreground">{o.contact_name || "—"}</TableCell>
                    <TableCell className="font-medium">{o.title || "—"}</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      {formatCurrency(o.value || 0)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={`text-xs ${
                          o.status === "won"
                            ? "bg-green-100 text-green-700"
                            : o.status === "lost"
                            ? "bg-red-100 text-red-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                        variant="secondary"
                      >
                        {STATUS_LABEL[o.status] || o.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{(o as any).agent_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(o.created_at), "dd/MM/yyyy")}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredOpps.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {loading ? "Carregando..." : "Nenhuma oportunidade encontrada"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print\\:hidden { display: none !important; }
          #root, #root * { visibility: visible; }
          #root { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default FinancialReport;
