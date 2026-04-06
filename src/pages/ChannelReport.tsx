import { useState, useEffect, useCallback } from "react";
import { Radio, Download, RefreshCw, BarChart2, MessageSquare, Users, Clock, Star, FileSpreadsheet } from "lucide-react";
import { exportToExcel } from "@/lib/exportXlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ChannelRow {
  channel: string;
  total_conversations: number;
  closed: number;
  open: number;
  avg_csat: number | null;
  avg_response_min: number | null;
  unique_contacts: number;
  total_messages: number;
}

const CHANNEL_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
];

const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("pt-BR");
};

const fmtMin = (min: number | null | undefined) => {
  if (min === null || min === undefined) return "—";
  const m = Math.floor(Number(min));
  const s = Math.round((Number(min) - m) * 60);
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}min ${s}s` : `${m}min`;
};

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);

export default function ChannelReport() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [startDate, setStartDate] = useState(toDateInput(thirtyDaysAgo));
  const [endDate, setEndDate] = useState(toDateInput(now));
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<ChannelRow[]>(
        `/stats/by-channel?start=${startDate}T00:00:00Z&end=${endDate}T23:59:59Z`
      );
      setRows(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Erro ao carregar relatório por canal");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  const totals = rows.reduce(
    (acc, r) => ({
      conversations: acc.conversations + Number(r.total_conversations),
      messages: acc.messages + Number(r.total_messages),
      contacts: acc.contacts + Number(r.unique_contacts),
    }),
    { conversations: 0, messages: 0, contacts: 0 }
  );

  const avgCsat =
    rows.filter((r) => r.avg_csat !== null).length > 0
      ? (
          rows
            .filter((r) => r.avg_csat !== null)
            .reduce((s, r) => s + Number(r.avg_csat), 0) /
          rows.filter((r) => r.avg_csat !== null).length
        ).toFixed(2)
      : "—";

  const avgResp =
    rows.filter((r) => r.avg_response_min !== null).length > 0
      ? rows
          .filter((r) => r.avg_response_min !== null)
          .reduce((s, r) => s + Number(r.avg_response_min), 0) /
        rows.filter((r) => r.avg_response_min !== null).length
      : null;

  const exportXLSX = () => {
    const data = rows.map((r) => ({
      Canal: r.channel,
      Conversas: r.total_conversations,
      Fechadas: r.closed,
      Abertas: r.open,
      "Contatos Únicos": r.unique_contacts,
      Mensagens: r.total_messages,
      "CSAT Médio": r.avg_csat ?? "",
      "Tempo Resposta (min)": r.avg_response_min ?? "",
    }));
    exportToExcel(data, `relatorio-canal-${startDate}-${endDate}`);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
          <Radio className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Relatório por Canal</h1>
          <p className="text-sm text-muted-foreground">
            Métricas de atendimento agrupadas por conexão/canal
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data inicial</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data final</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={load} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" onClick={exportXLSX} className="gap-2 ml-auto">
            <FileSpreadsheet className="h-4 w-4" />
            Exportar XLSX
          </Button>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <BarChart2 className="h-4 w-4" />
            Total Conversas
          </div>
          <p className="text-2xl font-bold text-foreground">{fmt(totals.conversations)}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <MessageSquare className="h-4 w-4" />
            Total Mensagens
          </div>
          <p className="text-2xl font-bold text-foreground">{fmt(totals.messages)}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Star className="h-4 w-4" />
            CSAT Médio
          </div>
          <p className="text-2xl font-bold text-foreground">{avgCsat}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Clock className="h-4 w-4" />
            Tempo Resposta Médio
          </div>
          <p className="text-2xl font-bold text-foreground">{fmtMin(avgResp)}</p>
        </Card>
      </div>

      {/* Chart */}
      {rows.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4">Conversas por Canal</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rows} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="channel"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => (v.length > 12 ? v.slice(0, 12) + "…" : v)}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                formatter={(val) => [fmt(val as number), "Conversas"]}
              />
              <Bar dataKey="total_conversations" radius={[4, 4, 0, 0]}>
                {rows.map((_, i) => (
                  <Cell key={i} fill={CHANNEL_COLORS[i % CHANNEL_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {[
                  "Canal",
                  "Conversas",
                  "Fechadas",
                  "Abertas",
                  "Contatos Únicos",
                  "Mensagens",
                  "CSAT",
                  "Tempo Resposta",
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">
                    Nenhum dado para o período selecionado.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.channel} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }}
                      />
                      <span className="font-medium text-foreground">{r.channel}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground font-semibold">{fmt(r.total_conversations)}</td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-green-700 bg-green-100 border-green-200 text-xs">
                      {fmt(r.closed)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary" className="text-blue-700 bg-blue-100 border-blue-200 text-xs">
                      {fmt(r.open)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      {fmt(r.unique_contacts)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground">{fmt(r.total_messages)}</td>
                  <td className="px-4 py-3 text-foreground">
                    {r.avg_csat !== null ? (
                      <div className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 text-yellow-500" />
                        {Number(r.avg_csat).toFixed(2)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {fmtMin(r.avg_response_min)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
