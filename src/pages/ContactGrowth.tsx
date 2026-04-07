import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Users, ArrowUp, ArrowDown, Zap, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GrowthDataPoint {
  date: string;
  new_contacts: number;
  total_contacts: number;
}

interface GrowthSummary {
  total_contacts: number;
  new_in_period: number;
  growth_rate: number;
  previous_period_count: number;
  peak: { date: string; new_contacts: number } | null;
  period: number;
  group_by: string;
}

interface GrowthResponse {
  data: GrowthDataPoint[];
  summary: GrowthSummary;
}

function formatDate(dateStr: string, groupBy: string) {
  const d = new Date(dateStr);
  if (groupBy === "month") {
    return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
  }
  if (groupBy === "week") {
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function ContactGrowth() {
  const [period, setPeriod] = useState("30");
  const [groupBy, setGroupBy] = useState("day");

  const { data, isLoading } = useQuery<GrowthResponse>({
    queryKey: ["contact-growth", period, groupBy],
    queryFn: async () => {
      return await api.get(`/stats/contact-growth?period=${period}&group_by=${groupBy}`) as GrowthResponse;
    },
    staleTime: 5 * 60_000,
  });

  const chartData = useMemo(() => (data?.data || []).map(row => ({
    ...row,
    label: formatDate(row.date, groupBy),
  })), [data?.data, groupBy]);

  const summary = data?.summary;

  const exportCSV = useCallback(() => {
    if (!chartData.length) return;
    const headers = ["Data", "Novos Contatos", "Total Acumulado"];
    const rows = chartData.map(r => [r.label, r.new_contacts, r.total_contacts]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crescimento-contatos-${period}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [chartData, period]);

  const growthPositive = (summary?.growth_rate ?? 0) >= 0;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              Crescimento de Contatos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Analise o ritmo de crescimento da sua base de contatos.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
                <SelectItem value="180">Últimos 180 dias</SelectItem>
                <SelectItem value="365">Último ano</SelectItem>
              </SelectContent>
            </Select>
            <Select value={groupBy} onValueChange={setGroupBy}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Por dia</SelectItem>
                <SelectItem value="week">Por semana</SelectItem>
                <SelectItem value="month">Por mês</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV} disabled={!chartData.length}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Total de Contatos</p>
              <p className="text-2xl font-bold text-foreground">
                {isLoading ? "..." : (summary?.total_contacts ?? 0).toLocaleString("pt-BR")}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Users className="h-3 w-3" /> base atual
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Novos no Período</p>
              <p className="text-2xl font-bold text-foreground">
                {isLoading ? "..." : (summary?.new_in_period ?? 0).toLocaleString("pt-BR")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">últimos {period} dias</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Taxa de Crescimento</p>
              <p className={`text-2xl font-bold ${growthPositive ? "text-green-600" : "text-red-500"}`}>
                {isLoading ? "..." : `${summary?.growth_rate ?? 0}%`}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                {growthPositive ? (
                  <ArrowUp className="h-3 w-3 text-green-500" />
                ) : (
                  <ArrowDown className="h-3 w-3 text-red-500" />
                )}
                vs. período anterior
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">Pico de Crescimento</p>
              <p className="text-2xl font-bold text-foreground">
                {isLoading ? "..." : summary?.peak ? summary.peak.new_contacts.toLocaleString("pt-BR") : "—"}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                <Zap className="h-3 w-3 text-yellow-500" />
                {summary?.peak ? formatDate(summary.peak.date, groupBy) : "no período"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Line Chart: New contacts */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Novos Contatos por {groupBy === "day" ? "Dia" : groupBy === "week" ? "Semana" : "Mês"}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
            ) : chartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value: number) => [value.toLocaleString("pt-BR"), "Novos contatos"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="new_contacts"
                    name="Novos contatos"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Area Chart: Cumulative total */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Total Acumulado de Contatos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Carregando...</div>
            ) : chartData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Sem dados no período</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="totalGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value: number) => [value.toLocaleString("pt-BR"), "Total de contatos"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="total_contacts"
                    name="Total acumulado"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#totalGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Data Table */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Dados Detalhados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="text-left py-2 px-3 font-medium">Período</th>
                    <th className="text-right py-2 px-3 font-medium">Novos</th>
                    <th className="text-right py-2 px-3 font-medium">Total Acumulado</th>
                    <th className="text-right py-2 px-3 font-medium">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row, idx) => {
                    const prev = idx > 0 ? chartData[idx - 1].new_contacts : null;
                    const delta = prev !== null ? row.new_contacts - prev : null;
                    return (
                      <tr key={idx} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-1.5 px-3 text-xs">{row.label}</td>
                        <td className="py-1.5 px-3 text-right text-xs font-medium">{row.new_contacts.toLocaleString("pt-BR")}</td>
                        <td className="py-1.5 px-3 text-right text-xs">{row.total_contacts.toLocaleString("pt-BR")}</td>
                        <td className="py-1.5 px-3 text-right text-xs">
                          {delta !== null ? (
                            <span className={delta >= 0 ? "text-green-600" : "text-red-500"}>
                              {delta >= 0 ? "+" : ""}{delta}
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  {chartData.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center text-muted-foreground py-6 text-xs">
                        {isLoading ? "Carregando..." : "Sem dados no período"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
