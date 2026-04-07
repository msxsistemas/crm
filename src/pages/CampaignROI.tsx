import { useState, useEffect, useCallback } from "react";
import { Send, MessageCircle, TrendingUp, CreditCard, DollarSign, Download, RefreshCw, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import api from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Campaign {
  id: string;
  name: string;
  status: string;
  created_at: string;
}

interface CampaignROIData {
  campaign_id: string;
  campaign_name: string;
  sent_count: number;
  response_count: number;
  response_rate: number;
  conversations_opened: number;
  pix_charges_count: number;
  pix_revenue: number;
  period: { start: string; end: string };
}

interface CampaignSummaryRow {
  campaign_id: string;
  campaign_name: string;
  sent_at: string;
  sent_count: number;
  response_count: number;
  response_rate: number;
  pix_charges_count: number;
  pix_revenue: number;
}

const fmt = (n: number) => n.toLocaleString("pt-BR");
const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("pt-BR");

const FUNNEL_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#22c55e"];

export default function CampaignROI() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string>("__all");
  const [roiData, setRoiData] = useState<CampaignROIData | null>(null);
  const [summary, setSummary] = useState<CampaignSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    api.get<Campaign[]>("/campaigns").then((data) => setCampaigns(data || [])).catch(() => {});
    loadSummary();
  }, []);

  const loadSummary = async () => {
    setSummaryLoading(true);
    try {
      const rows = await api.get<CampaignSummaryRow[]>("/stats/campaigns-roi-summary?days=30");
      setSummary(rows || []);
    } catch {
      toast.error("Erro ao carregar resumo de campanhas");
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadROI = useCallback(async (id: string) => {
    if (!id || id === "__all") { setRoiData(null); return; }
    setLoading(true);
    try {
      const data = await api.get<CampaignROIData>(`/stats/campaign-roi/${id}`);
      setRoiData(data);
    } catch {
      toast.error("Erro ao carregar ROI da campanha");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    loadROI(id);
  };

  const funnelData = roiData
    ? [
        { name: "Enviados", value: roiData.sent_count },
        { name: "Responderam", value: roiData.response_count },
        { name: "Conversas", value: roiData.conversations_opened },
        { name: "Pix Gerado", value: roiData.pix_charges_count },
        { name: "Receita (R$)", value: Math.round(roiData.pix_revenue) },
      ]
    : [];

  const exportCSV = () => {
    if (summary.length === 0) { toast.error("Sem dados para exportar"); return; }
    const headers = ["Campanha", "Enviados", "Responderam", "Taxa (%)", "Cobranças Pix", "Receita (R$)", "Data"];
    const rows = summary.map(r => [
      `"${r.campaign_name}"`,
      r.sent_count,
      r.response_count,
      r.response_rate,
      r.pix_charges_count,
      r.pix_revenue.toFixed(2),
      fmtDate(r.sent_at),
    ].join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `roi-campanhas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-6 border-b border-border">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">ROI de Campanhas</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Taxa de resposta, conversas e receita gerada por campanha</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadSummary}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Atualizar
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Exportar CSV
            </Button>
          </div>
        </div>

        <div className="mt-4 max-w-sm">
          <Select value={selectedId} onValueChange={handleSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar campanha..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">— Todas as campanhas —</SelectItem>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Cards métricas da campanha selecionada */}
        {selectedId !== "__all" && (
          loading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Carregando métricas...</div>
          ) : roiData ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <MetricCard icon={<Send className="h-4 w-4" />} label="Enviados" value={fmt(roiData.sent_count)} color="blue" />
                <MetricCard icon={<MessageCircle className="h-4 w-4" />} label="Responderam" value={fmt(roiData.response_count)} color="violet" />
                <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Taxa de Resposta" value={`${roiData.response_rate}%`} color="green" />
                <MetricCard icon={<MessageCircle className="h-4 w-4" />} label="Conversas Abertas" value={fmt(roiData.conversations_opened)} color="orange" />
                <MetricCard icon={<CreditCard className="h-4 w-4" />} label="Cobranças Pix" value={fmt(roiData.pix_charges_count)} color="pink" />
                <MetricCard icon={<DollarSign className="h-4 w-4" />} label="Receita Gerada" value={fmtBRL(roiData.pix_revenue)} color="emerald" />
              </div>

              {/* Funil */}
              <div className="border border-border rounded-xl p-4 bg-card">
                <h2 className="text-sm font-semibold mb-4">Funil de Conversão</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  {funnelData.map((item, i) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div className="text-center">
                        <div
                          className="rounded-lg px-4 py-3 text-white font-semibold text-sm min-w-[90px]"
                          style={{ backgroundColor: FUNNEL_COLORS[i] }}
                        >
                          {fmt(item.value)}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">{item.name}</p>
                      </div>
                      {i < funnelData.length - 1 && (
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null
        )}

        {/* Tabela comparativa últimos 30 dias */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold">Campanhas dos últimos 30 dias</h2>
            {summaryLoading && <span className="text-xs text-muted-foreground">Carregando...</span>}
          </div>
          {summary.length === 0 && !summaryLoading ? (
            <p className="text-sm text-muted-foreground p-6 text-center">Nenhuma campanha encontrada nos últimos 30 dias.</p>
          ) : (
            <>
              {/* Chart */}
              {summary.length > 0 && (
                <div className="p-4 border-b border-border">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={summary.slice(0, 10)} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="campaign_name" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(0, 12)} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(value: number, name: string) => [fmt(value), name]}
                        labelFormatter={l => `Campanha: ${l}`}
                      />
                      <Bar dataKey="sent_count" name="Enviados" fill="#6366f1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="response_count" name="Responderam" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Campanha</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Enviados</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Responderam</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Taxa</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Pix</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Receita</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((row, i) => (
                      <tr
                        key={row.campaign_id}
                        className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${row.campaign_id === selectedId ? "bg-primary/5" : ""}`}
                        onClick={() => handleSelect(row.campaign_id)}
                      >
                        <td className="px-4 py-2.5 font-medium text-foreground">{row.campaign_name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.sent_count)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.response_count)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
                            row.response_rate >= 20 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" :
                            row.response_rate >= 5 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" :
                            "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          }`}>
                            {row.response_rate}%
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.pix_charges_count)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium text-green-700 dark:text-green-400">
                          {fmtBRL(row.pix_revenue)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtDate(row.sent_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}

const COLOR_MAP: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  pink: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

function MetricCard({ icon, label, value, color }: MetricCardProps) {
  return (
    <div className="border border-border rounded-xl p-3 bg-card flex flex-col gap-2">
      <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ${COLOR_MAP[color] || ""}`}>
        {icon}
      </div>
      <div>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-base font-bold text-foreground mt-0.5">{value}</p>
      </div>
    </div>
  );
}
