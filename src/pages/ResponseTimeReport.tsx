import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Download, TrendingDown, TrendingUp, Users } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface AgentRow {
  name: string;
  total: number;
  avg_handling_min: number | null;
  avg_first_response_min: number | null;
  min_handling_min?: number | null;
  max_handling_min?: number | null;
}

interface ChannelRow {
  name: string;
  total: number;
  avg_handling_min: number | null;
}

interface TrendRow {
  week: string;
  avg_handling_min: number | null;
  count: number;
}

interface ReportData {
  byAgent: AgentRow[];
  byTeam: AgentRow[];
  byChannel: ChannelRow[];
  trend: TrendRow[];
}

const fmtMin = (v: number | null) => {
  if (v === null || v === undefined) return "—";
  const m = Math.floor(Number(v));
  const s = Math.round((Number(v) - m) * 60);
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}min ${s}s` : `${m}min`;
};

const ColorBar = ({ value, max }: { value: number | null; max: number }) => {
  if (value === null || value === undefined || max === 0) return <div className="h-1.5 w-full bg-muted rounded-full" />;
  const pct = Math.min((Number(value) / max) * 100, 100);
  const hue = Math.round(120 - (pct * 1.2)); // green=120 to red=0
  return (
    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${pct}%`, background: `hsl(${hue}, 70%, 50%)` }}
      />
    </div>
  );
};

const defaultStart = () => {
  const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};
const defaultEnd = () => new Date().toISOString().slice(0, 10);

const TABS = ["Por Agente", "Por Time", "Por Canal"] as const;
type Tab = typeof TABS[number];

export default function ResponseTimeReport() {
  const [start, setStart] = useState(defaultStart());
  const [end, setEnd] = useState(defaultEnd());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("Por Agente");

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.get<ReportData>(
        `/stats/response-time?start=${start}T00:00:00Z&end=${end}T23:59:59Z`
      );
      setData(result);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const exportCsv = () => {
    if (!data) return;
    const rows = tab === "Por Agente" ? data.byAgent :
                 tab === "Por Time"  ? data.byTeam  : data.byChannel;
    const header = tab === "Por Canal"
      ? "Canal,Total,Tempo Médio (min)"
      : "Nome,Total,Tempo Médio (min),Primeiro Contato (min)" + (tab === "Por Agente" ? ",Mín (min),Máx (min)" : "");
    const lines = (rows as any[]).map(r =>
      tab === "Por Canal"
        ? `${r.name},${r.total},${r.avg_handling_min ?? ""}`
        : `${r.name},${r.total},${r.avg_handling_min ?? ""},${r.avg_first_response_min ?? ""}` +
          (tab === "Por Agente" ? `,${(r as AgentRow).min_handling_min ?? ""},${(r as AgentRow).max_handling_min ?? ""}` : "")
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tempo-atendimento-${tab.toLowerCase().replace(/ /g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Summary cards
  const allAgents = data?.byAgent ?? [];
  const avgGeral =
    allAgents.length > 0
      ? allAgents.reduce((s, r) => s + Number(r.avg_handling_min ?? 0), 0) / allAgents.filter(r => r.avg_handling_min !== null).length
      : null;
  const bestAgent = allAgents.length > 0 ? allAgents[0] : null;
  const worstAgent = allAgents.length > 0 ? allAgents[allAgents.length - 1] : null;
  const avgFirst =
    allAgents.length > 0
      ? allAgents.filter(r => r.avg_first_response_min !== null).reduce((s, r) => s + Number(r.avg_first_response_min ?? 0), 0) /
        (allAgents.filter(r => r.avg_first_response_min !== null).length || 1)
      : null;

  const trendData = (data?.trend ?? []).map(r => ({
    name: r.week ? new Date(r.week).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "",
    "Tempo Médio": Number(r.avg_handling_min ?? 0),
    Conversas: Number(r.count),
  }));

  const getRows = (): any[] => {
    if (!data) return [];
    if (tab === "Por Agente") return data.byAgent;
    if (tab === "Por Time") return data.byTeam;
    return data.byChannel;
  };

  const maxVal = getRows().reduce((m, r) => Math.max(m, Number(r.avg_handling_min ?? 0)), 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Clock className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Tempo de Atendimento</h1>
            <p className="text-sm text-muted-foreground">Análise de tempos de resolução e primeiro contato</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={start}
            onChange={e => setStart(e.target.value)}
            className="border border-border rounded-md px-3 py-1.5 text-sm bg-background text-foreground"
          />
          <span className="text-muted-foreground text-sm">até</span>
          <input
            type="date"
            value={end}
            onChange={e => setEnd(e.target.value)}
            className="border border-border rounded-md px-3 py-1.5 text-sm bg-background text-foreground"
          />
          <Button onClick={load} disabled={loading} size="sm">
            {loading ? "Carregando..." : "Aplicar"}
          </Button>
          <Button onClick={exportCsv} variant="outline" size="sm" className="gap-1">
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Tempo Médio Geral</p>
          <p className="text-2xl font-bold text-foreground">{fmtMin(avgGeral)}</p>
          <p className="text-xs text-muted-foreground">por atendimento</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingDown className="h-3 w-3 text-green-500" /> Melhor Agente
          </p>
          <p className="text-lg font-bold text-foreground truncate">{bestAgent?.name ?? "—"}</p>
          <p className="text-xs text-green-600">{fmtMin(bestAgent?.avg_handling_min ?? null)}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-red-500" /> Pior Agente
          </p>
          <p className="text-lg font-bold text-foreground truncate">{worstAgent?.name ?? "—"}</p>
          <p className="text-xs text-red-600">{fmtMin(worstAgent?.avg_handling_min ?? null)}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="h-3 w-3 text-primary" /> Primeiro Contato Médio
          </p>
          <p className="text-2xl font-bold text-foreground">{fmtMin(avgFirst)}</p>
          <p className="text-xs text-muted-foreground">tempo até 1ª resposta</p>
        </Card>
      </div>

      {/* Tabs + Table */}
      <Card className="p-4 space-y-4">
        <div className="flex gap-1 border-b border-border pb-2">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm font-medium rounded-t transition-colors ${
                tab === t
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-2 font-semibold text-muted-foreground">Nome</th>
                <th className="pb-2 font-semibold text-muted-foreground text-right">Total</th>
                <th className="pb-2 font-semibold text-muted-foreground text-right">Tempo Médio</th>
                {tab !== "Por Canal" && (
                  <th className="pb-2 font-semibold text-muted-foreground text-right">Primeiro Contato</th>
                )}
                {tab === "Por Agente" && (
                  <>
                    <th className="pb-2 font-semibold text-muted-foreground text-right">Mín</th>
                    <th className="pb-2 font-semibold text-muted-foreground text-right">Máx</th>
                  </>
                )}
                <th className="pb-2 font-semibold text-muted-foreground w-32">Performance</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">Carregando...</td>
                </tr>
              ) : getRows().length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum dado no período selecionado</td>
                </tr>
              ) : (
                getRows().map((row, i) => (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2 font-medium text-foreground">{row.name}</td>
                    <td className="py-2 text-right text-muted-foreground">{row.total}</td>
                    <td className="py-2 text-right font-semibold text-foreground">{fmtMin(row.avg_handling_min)}</td>
                    {tab !== "Por Canal" && (
                      <td className="py-2 text-right text-muted-foreground">{fmtMin(row.avg_first_response_min)}</td>
                    )}
                    {tab === "Por Agente" && (
                      <>
                        <td className="py-2 text-right text-green-600">{fmtMin(row.min_handling_min)}</td>
                        <td className="py-2 text-right text-red-600">{fmtMin(row.max_handling_min)}</td>
                      </>
                    )}
                    <td className="py-2 pr-2">
                      <ColorBar value={row.avg_handling_min} max={maxVal} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Weekly trend chart */}
      {trendData.length > 0 && (
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold text-foreground">Tendência Semanal</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit=" min" />
              <Tooltip
                formatter={(v: number, name: string) =>
                  name === "Tempo Médio" ? [`${v} min`, name] : [v, name]
                }
              />
              <Line
                type="monotone"
                dataKey="Tempo Médio"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}
