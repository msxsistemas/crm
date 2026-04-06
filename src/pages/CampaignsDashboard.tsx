import { useState, useEffect } from "react";
import { BarChart2, Download, TrendingUp, Send, CheckCircle, BookOpen } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import api from "@/lib/api";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  total_sent: number;
  delivered: number;
  read_count: number;
  replied: number;
}

const pct = (num: number, denom: number): string => {
  if (!denom || denom === 0) return "0%";
  return `${((num / denom) * 100).toFixed(1)}%`;
};

const avg = (arr: number[]): number => {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
};

export default function CampaignsDashboard() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const data = await api.get<CampaignRow[]>("/stats/campaigns");
      setCampaigns(
        (data || []).map((c) => ({
          ...c,
          total_sent: Number(c.total_sent) || 0,
          delivered: Number(c.delivered) || 0,
          read_count: Number(c.read_count) || 0,
          replied: Number(c.replied) || 0,
        }))
      );
    } catch {
      toast.error("Erro ao carregar campanhas");
    } finally {
      setLoading(false);
    }
  };

  const filtered = campaigns.filter((c) => {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - Number(days));
    return new Date(c.created_at) >= daysAgo;
  });

  const totalCampaigns = filtered.length;
  const totalSent = filtered.reduce((s, c) => s + c.total_sent, 0);
  const avgDelivery = avg(
    filtered.filter((c) => c.total_sent > 0).map((c) => (c.delivered / c.total_sent) * 100)
  );
  const avgRead = avg(
    filtered.filter((c) => c.total_sent > 0).map((c) => (c.read_count / c.total_sent) * 100)
  );

  const top5ByRead = [...filtered]
    .filter((c) => c.total_sent > 0)
    .sort((a, b) => b.read_count / b.total_sent - a.read_count / a.total_sent)
    .slice(0, 5)
    .map((c) => ({
      name: c.name.length > 20 ? c.name.slice(0, 20) + "…" : c.name,
      "Taxa Leitura (%)": parseFloat(((c.read_count / c.total_sent) * 100).toFixed(1)),
    }));

  const exportCSV = () => {
    const header = ["Nome", "Status", "Enviadas", "Entregues", "% Entrega", "Lidas", "% Leitura", "Respondidas"];
    const rows = filtered.map((c) => [
      `"${c.name}"`,
      c.status,
      c.total_sent,
      c.delivered,
      pct(c.delivered, c.total_sent),
      c.read_count,
      pct(c.read_count, c.total_sent),
      c.replied,
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campanhas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    {
      label: "Total Campanhas",
      value: totalCampaigns,
      icon: BarChart2,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-950/30",
    },
    {
      label: "Total Enviadas",
      value: totalSent.toLocaleString("pt-BR"),
      icon: Send,
      color: "text-green-500",
      bg: "bg-green-50 dark:bg-green-950/30",
    },
    {
      label: "Taxa Entrega Média",
      value: `${avgDelivery.toFixed(1)}%`,
      icon: CheckCircle,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
    },
    {
      label: "Taxa Leitura Média",
      value: `${avgRead.toFixed(1)}%`,
      icon: BookOpen,
      color: "text-purple-500",
      bg: "bg-purple-50 dark:bg-purple-950/30",
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-auto bg-background p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Métricas de Campanha</h1>
            <p className="text-sm text-muted-foreground">Acompanhe o desempenho das suas campanhas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportCSV} className="gap-2">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label} className={cn("rounded-xl p-4 border border-border/50", card.bg)}>
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={cn("h-4 w-4", card.color)} />
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Chart + Table */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Bar chart top 5 by read rate */}
        <div className="xl:col-span-1 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Top 5 por Taxa de Leitura</h2>
          </div>
          {top5ByRead.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Sem dados
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={top5ByRead} layout="vertical" margin={{ left: 0, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="Taxa Leitura (%)" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Table */}
        <div className="xl:col-span-2 rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Detalhamento de Campanhas</h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              Nenhuma campanha encontrada no período
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Nome</th>
                    <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Enviadas</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Entregues (%)</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Lidas (%)</th>
                    <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Respondidas</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr key={c.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground truncate max-w-[180px]" title={c.name}>
                        {c.name}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5",
                            c.status === "sent" ? "border-green-500 text-green-600" :
                            c.status === "sending" ? "border-yellow-500 text-yellow-600" :
                            "border-border text-muted-foreground"
                          )}
                        >
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">
                        {c.total_sent.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-emerald-600 font-medium">
                          {c.delivered.toLocaleString("pt-BR")}
                        </span>
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({pct(c.delivered, c.total_sent)})
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-purple-600 font-medium">
                          {c.read_count.toLocaleString("pt-BR")}
                        </span>
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({pct(c.read_count, c.total_sent)})
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-blue-600 font-medium">
                        {c.replied.toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
