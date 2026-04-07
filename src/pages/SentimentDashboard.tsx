import { useState, useEffect, useCallback } from "react";
import { TrendingUp, AlertCircle, ThumbsUp, ThumbsDown, Minus, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import api from "@/lib/api";
import { useNavigate } from "react-router-dom";

interface SentimentOverall {
  positive: string;
  negative: string;
  neutral: string;
  total_analyzed: string;
}

interface SentimentByAgent {
  agent_name: string;
  positive: string;
  negative: string;
  neutral: string;
  total: string;
}

interface SentimentTrend {
  date: string;
  positive: string;
  negative: string;
  neutral: string;
}

interface SentimentAlert {
  id: string;
  contact_name: string;
  created_at: string;
  agent_name: string | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

export default function SentimentDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [overall, setOverall] = useState<SentimentOverall | null>(null);
  const [byAgent, setByAgent] = useState<SentimentByAgent[]>([]);
  const [trend, setTrend] = useState<SentimentTrend[]>([]);
  const [alerts, setAlerts] = useState<SentimentAlert[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [agentId, setAgentId] = useState("all");

  useEffect(() => {
    api.get<Profile[]>('/users').then((data) => setProfiles(data || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        start: startDate,
        end: endDate + "T23:59:59Z",
      };
      if (agentId !== "all") params.agent_id = agentId;
      const qs = new URLSearchParams(params).toString();
      const data = await api.get<any>(`/stats/sentiment?${qs}`);
      setOverall(data?.overall ?? null);
      setByAgent(data?.byAgent || []);
      setTrend(data?.trend || []);
      setAlerts(data?.alerts || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, agentId]);

  useEffect(() => { load(); }, [load]);

  const total = parseInt(overall?.total_analyzed || "0");
  const pct = (val: string) => total > 0 ? Math.round((parseInt(val || "0") / total) * 100) : 0;

  const trendData = trend.map(t => ({
    date: new Date(t.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    Positivo: parseInt(t.positive || "0"),
    Negativo: parseInt(t.negative || "0"),
    Neutro: parseInt(t.neutral || "0"),
  }));

  const sentimentScore = (positive: string, negative: string, total: string) => {
    const t = parseInt(total || "0");
    if (!t) return 0;
    return Math.round(((parseInt(positive || "0") - parseInt(negative || "0")) / t) * 100);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <TrendingUp className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Análise de Sentimento</h1>
          <p className="text-sm text-muted-foreground">Visão geral do sentimento das conversas</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Data inicial</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Data final</label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36" />
          </div>
          <div className="space-y-1 min-w-[160px]">
            <label className="text-xs font-medium text-muted-foreground">Agente</label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os agentes</SelectItem>
                {profiles.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={load} disabled={loading}>
            {loading ? "Carregando..." : "Atualizar"}
          </Button>
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 border-l-4 border-l-green-500">
          <div className="flex items-center gap-2 mb-1">
            <ThumbsUp className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-700">Positivo</span>
          </div>
          <p className="text-3xl font-bold text-green-600">{pct(overall?.positive || "0")}%</p>
          <p className="text-xs text-muted-foreground mt-1">{overall?.positive || 0} conversas</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-red-500">
          <div className="flex items-center gap-2 mb-1">
            <ThumbsDown className="h-4 w-4 text-red-600" />
            <span className="text-sm font-medium text-red-700">Negativo</span>
          </div>
          <p className="text-3xl font-bold text-red-600">{pct(overall?.negative || "0")}%</p>
          <p className="text-xs text-muted-foreground mt-1">{overall?.negative || 0} conversas</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-gray-400">
          <div className="flex items-center gap-2 mb-1">
            <Minus className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-600">Neutro</span>
          </div>
          <p className="text-3xl font-bold text-gray-600">{pct(overall?.neutral || "0")}%</p>
          <p className="text-xs text-muted-foreground mt-1">{overall?.neutral || 0} conversas</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-primary">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Analisadas</span>
          </div>
          <p className="text-3xl font-bold text-foreground">{overall?.total_analyzed || 0}</p>
          <p className="text-xs text-muted-foreground mt-1">total no período</p>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-foreground mb-4">Tendência de Sentimento</h2>
        {trendData.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Sem dados para exibir no período selecionado
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="colorNeu" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#9ca3af" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="Positivo" stroke="#22c55e" fill="url(#colorPos)" strokeWidth={2} />
              <Area type="monotone" dataKey="Negativo" stroke="#ef4444" fill="url(#colorNeg)" strokeWidth={2} />
              <Area type="monotone" dataKey="Neutro" stroke="#9ca3af" fill="url(#colorNeu)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* By Agent Table */}
      {byAgent.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground mb-4">Por Agente</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="pb-2 font-medium text-muted-foreground">Agente</th>
                  <th className="pb-2 font-medium text-green-600 text-right">Positivos</th>
                  <th className="pb-2 font-medium text-red-600 text-right">Negativos</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Neutros</th>
                  <th className="pb-2 font-medium text-muted-foreground text-right">Total</th>
                  <th className="pb-2 font-medium text-muted-foreground">Score</th>
                </tr>
              </thead>
              <tbody>
                {byAgent.map((a, i) => {
                  const score = sentimentScore(a.positive, a.negative, a.total);
                  const scoreColor = score > 20 ? "bg-green-500" : score < -10 ? "bg-red-500" : "bg-gray-400";
                  const scoreWidth = Math.abs(score);
                  return (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2.5 font-medium">{a.agent_name}</td>
                      <td className="py-2.5 text-right text-green-600">{a.positive}</td>
                      <td className="py-2.5 text-right text-red-600">{a.negative}</td>
                      <td className="py-2.5 text-right text-gray-500">{a.neutral}</td>
                      <td className="py-2.5 text-right text-muted-foreground">{a.total}</td>
                      <td className="py-2.5 w-32">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${scoreColor}`}
                              style={{ width: `${Math.min(scoreWidth, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">{score}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Alerts: Open Negative Conversations */}
      {alerts.length > 0 && (
        <Card className="p-4 border border-red-200 dark:border-red-900/50">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <h2 className="text-sm font-semibold text-red-700 dark:text-red-400">
              Alertas: Conversas Negativas Abertas ({alerts.length})
            </h2>
          </div>
          <div className="space-y-2">
            {alerts.map(a => (
              <div
                key={a.id}
                className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{a.contact_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.agent_name ? `Agente: ${a.agent_name} · ` : ""}
                    {new Date(a.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-red-300 text-red-700 hover:bg-red-100"
                  onClick={() => navigate(`/inbox?conversation=${a.id}`)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Abrir
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
