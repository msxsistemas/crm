import { useState, useEffect, useCallback } from "react";
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from "recharts";
import { Download, TrendingUp, TrendingDown, Minus, AlertCircle, Star, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import api from "@/lib/api";

interface IntentRow {
  intent_category: string;
  count: number;
  percentage: number;
  avg_csat: number | null;
  avg_handle_time_min: number | null;
  prev_count: number;
  change_pct: number | null;
}

interface DailyRow {
  day: string;
  intent_category: string;
  count: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  duvida: "Dúvida",
  reclamacao: "Reclamação",
  venda: "Venda",
  suporte_tecnico: "Suporte Técnico",
  cobranca: "Cobrança",
  agendamento: "Agendamento",
  cancelamento: "Cancelamento",
  elogio: "Elogio",
  outro: "Outro",
};

const COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#6b7280",
];

export default function IntentReport() {
  const [data, setData] = useState<IntentRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [total, setTotal] = useState(0);
  const [days, setDays] = useState("30");
  const [channel, setChannel] = useState("all");
  const [connections, setConnections] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConnections = useCallback(async () => {
    try {
      const rows = await api.get<any[]>('/connections');
      setConnections((rows || []).map((r: any) => r.instance_name || r.name).filter(Boolean));
    } catch { /* silent */ }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days });
      if (channel !== "all") params.set("channel", channel);
      const json = await api.get<any>(`/stats/intent-report?${params}`);
      setData(json?.data || []);
      setDaily(json?.daily || []);
      setTotal(json?.total || 0);
    } catch (e: any) {
      setError(e.message || "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [days, channel]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Prepare daily data as grouped by date
  const allDays = [...new Set(daily.map(r => r.day))].sort();
  const allCategories = [...new Set(daily.map(r => r.intent_category))];
  const dailyGrouped = allDays.map(day => {
    const entry: Record<string, any> = { day };
    for (const cat of allCategories) {
      const found = daily.find(r => r.day === day && r.intent_category === cat);
      entry[cat] = found ? parseInt(String(found.count)) : 0;
    }
    return entry;
  });

  // Highlights
  const mostFrequent = data[0];
  const worstCsat = [...data].filter(r => r.avg_csat !== null).sort((a, b) => (a.avg_csat! - b.avg_csat!));
  const longestHandle = [...data].filter(r => r.avg_handle_time_min !== null).sort((a, b) => (b.avg_handle_time_min! - a.avg_handle_time_min!));

  const exportCsv = () => {
    const header = ["Categoria", "Volume", "%", "CSAT Médio", "Tempo Médio (min)", "Período Anterior", "Variação %"];
    const rows = data.map(r => [
      CATEGORY_LABELS[r.intent_category] || r.intent_category,
      r.count,
      r.percentage,
      r.avg_csat ?? "",
      r.avg_handle_time_min ?? "",
      r.prev_count,
      r.change_pct ?? "",
    ]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-intencoes-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full overflow-auto p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Relatório por Intenção</h1>
          <p className="text-sm text-muted-foreground">Classificação automática de conversas por IA</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="15">15 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="60">60 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os canais</SelectItem>
              {connections.map(c => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data.length}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-sm">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* Cards destaque */}
      {data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Mais frequente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold">{CATEGORY_LABELS[mostFrequent?.intent_category] || mostFrequent?.intent_category || "—"}</p>
              <p className="text-sm text-muted-foreground">{mostFrequent?.count} conversas ({mostFrequent?.percentage}%)</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-yellow-500" /> Pior CSAT
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold">{CATEGORY_LABELS[worstCsat[0]?.intent_category] || worstCsat[0]?.intent_category || "—"}</p>
              <p className="text-sm text-muted-foreground">Média: {worstCsat[0]?.avg_csat?.toFixed(1) ?? "sem dados"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Maior tempo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold">{CATEGORY_LABELS[longestHandle[0]?.intent_category] || longestHandle[0]?.intent_category || "—"}</p>
              <p className="text-sm text-muted-foreground">{longestHandle[0]?.avg_handle_time_min?.toFixed(0) ?? "—"} min em média</p>
            </CardContent>
          </Card>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          Carregando dados...
        </div>
      )}

      {!loading && data.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground space-y-2">
          <AlertCircle className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhuma conversa classificada ainda.</p>
          <p className="text-xs opacity-70">A IA classifica conversas automaticamente ao serem fechadas (requer ANTHROPIC_API_KEY).</p>
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Gráfico de pizza */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Distribuição por Intenção</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="count"
                    nameKey="intent_category"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ intent_category, percentage }) =>
                      `${CATEGORY_LABELS[intent_category] || intent_category} ${percentage}%`
                    }
                    labelLine={false}
                  >
                    {data.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <ReTooltip formatter={(value, name) => [value, CATEGORY_LABELS[String(name)] || name]} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Gráfico de barras por dia */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Volume por Dia</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={dailyGrouped} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <ReTooltip
                    formatter={(value, name) => [value, CATEGORY_LABELS[String(name)] || name]}
                  />
                  {allCategories.map((cat, i) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[i % COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabela */}
      {!loading && data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Detalhamento por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Categoria</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Volume</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">%</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">CSAT Médio</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Tempo Médio</th>
                    <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">vs Período Ant.</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={row.intent_category} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: COLORS[i % COLORS.length] }}
                        />
                        {CATEGORY_LABELS[row.intent_category] || row.intent_category}
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium">{row.count}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{row.percentage}%</td>
                      <td className="px-4 py-2.5 text-right">
                        {row.avg_csat != null ? (
                          <span className={row.avg_csat >= 4 ? "text-green-600" : row.avg_csat >= 3 ? "text-yellow-600" : "text-red-600"}>
                            {row.avg_csat.toFixed(1)} ⭐
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {row.avg_handle_time_min != null ? `${row.avg_handle_time_min.toFixed(0)} min` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {row.change_pct == null ? (
                          <span className="text-muted-foreground flex items-center justify-end gap-1">
                            <Minus className="h-3 w-3" /> —
                          </span>
                        ) : row.change_pct > 0 ? (
                          <span className="text-green-600 flex items-center justify-end gap-1">
                            <TrendingUp className="h-3 w-3" /> +{row.change_pct}%
                          </span>
                        ) : row.change_pct < 0 ? (
                          <span className="text-red-600 flex items-center justify-end gap-1">
                            <TrendingDown className="h-3 w-3" /> {row.change_pct}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground flex items-center justify-end gap-1">
                            <Minus className="h-3 w-3" /> 0%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/20">
                    <td className="px-4 py-2.5 font-semibold">Total</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{total}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">100%</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
