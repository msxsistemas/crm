import { useState, useEffect } from "react";
import { Target, TrendingUp, MessageSquare, Clock, Trophy, Loader2, Save, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ProductivityData {
  today: {
    open_conversations: number;
    closed_conversations: number;
    messages_sent: number;
    avg_response_min: number | null;
  };
  week: {
    open_conversations: number;
    closed_conversations: number;
    messages_sent: number;
    avg_response_min: number | null;
  };
  goal: {
    daily_conversations: number;
    weekly_conversations: number;
  };
  ranking: {
    position: number | null;
    total_closed_month: number;
    total_agents: number;
  };
  history: {
    date: string;
    conversations_closed: number;
    avg_response_min: number | null;
  }[];
}

function RankBadge({ position, total }: { position: number | null; total: number }) {
  if (position === null) return <Badge variant="outline">Sem dados</Badge>;
  if (position === 1) return <span className="text-3xl" title="1º lugar">🥇</span>;
  if (position === 2) return <span className="text-3xl" title="2º lugar">🥈</span>;
  if (position === 3) return <span className="text-3xl" title="3º lugar">🥉</span>;
  return (
    <span className="text-2xl font-bold text-muted-foreground">
      #{position}<span className="text-sm font-normal ml-1">de {total}</span>
    </span>
  );
}

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = pct >= 100 ? "bg-green-500" : pct >= 60 ? "bg-blue-500" : "bg-yellow-500";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {value}/{max} ({pct}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function MyProductivity() {
  const [data, setData] = useState<ProductivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyGoal, setDailyGoal] = useState(10);
  const [weeklyGoal, setWeeklyGoal] = useState(50);
  const [savingGoal, setSavingGoal] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const result = await api.get<ProductivityData>("/stats/my-productivity");
      if (!result) return;
      setData(result);
      if (result.goal) {
        setDailyGoal(result.goal.daily_conversations);
        setWeeklyGoal(result.goal.weekly_conversations);
      }
    } catch {
      toast.error("Erro ao carregar dados de produtividade");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveGoals = async () => {
    setSavingGoal(true);
    try {
      await api.put("/stats/my-productivity/goals", {
        daily_conversations: dailyGoal,
        weekly_conversations: weeklyGoal,
      });
      toast.success("Metas salvas");
      load();
    } catch {
      toast.error("Erro ao salvar metas");
    } finally {
      setSavingGoal(false);
    }
  };

  const formatTime = (min: number | null) => {
    if (min === null || min === undefined) return "—";
    if (min < 1) return `${Math.round(min * 60)}s`;
    if (min < 60) return `${Math.round(min)}min`;
    return `${Math.floor(min / 60)}h ${Math.round(min % 60)}min`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const chartData = data.history.map(h => ({
    date: format(new Date(h.date), "dd/MM", { locale: ptBR }),
    fechadas: h.conversations_closed,
    tempo: h.avg_response_min ?? 0,
  }));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Minha Produtividade</h1>
      </div>

      {/* Cards de Hoje */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Hoje</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 pb-4 text-center">
              <div className="text-3xl font-bold text-blue-600">{data.today.open_conversations}</div>
              <div className="text-sm text-muted-foreground mt-1">Em aberto</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 pb-4 text-center">
              <div className="text-3xl font-bold text-green-600">{data.today.closed_conversations}</div>
              <div className="text-sm text-muted-foreground mt-1">Fechadas hoje</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 pb-4 text-center">
              <div className="text-3xl font-bold text-purple-600">{data.today.messages_sent}</div>
              <div className="text-sm text-muted-foreground mt-1">Mensagens enviadas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 pb-4 text-center">
              <div className="text-3xl font-bold text-orange-600">{formatTime(data.today.avg_response_min)}</div>
              <div className="text-sm text-muted-foreground mt-1">Tempo médio resposta</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Cards da Semana */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Esta Semana (7 dias)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 pb-4 text-center">
              <div className="text-3xl font-bold text-blue-500">{data.week.open_conversations}</div>
              <div className="text-sm text-muted-foreground mt-1">Em aberto</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 pb-4 text-center">
              <div className="text-3xl font-bold text-green-500">{data.week.closed_conversations}</div>
              <div className="text-sm text-muted-foreground mt-1">Fechadas</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 pb-4 text-center">
              <div className="text-3xl font-bold text-purple-500">{data.week.messages_sent}</div>
              <div className="text-sm text-muted-foreground mt-1">Mensagens</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 pb-4 text-center">
              <div className="text-3xl font-bold text-orange-500">{formatTime(data.week.avg_response_min)}</div>
              <div className="text-sm text-muted-foreground mt-1">Tempo médio</div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Progresso vs Metas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" />
              Progresso vs Metas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProgressBar
              value={data.today.closed_conversations}
              max={data.goal.daily_conversations}
              label="Meta diária"
            />
            <ProgressBar
              value={data.week.closed_conversations}
              max={data.goal.weekly_conversations}
              label="Meta semanal"
            />
          </CardContent>
        </Card>

        {/* Ranking */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4" />
              Meu Ranking (mês atual)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-4 gap-3">
            <RankBadge position={data.ranking.position} total={data.ranking.total_agents} />
            <div className="text-sm text-muted-foreground text-center">
              <strong className="text-foreground">{data.ranking.total_closed_month}</strong> conversas fechadas no mês
            </div>
            {data.ranking.position === 1 && (
              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Você está em 1º lugar!</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráfico histórico */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversas Fechadas — Últimos 30 dias</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Sem dados históricos.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  formatter={(val: number, name: string) =>
                    name === "fechadas" ? [val, "Fechadas"] : [val, "Tempo (min)"]
                  }
                />
                <Line
                  type="monotone"
                  dataKey="fechadas"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Minhas Metas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4" />
            Minhas Metas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Meta diária (conversas fechadas)</label>
              <Input
                type="number"
                min={1}
                value={dailyGoal}
                onChange={(e) => setDailyGoal(parseInt(e.target.value) || 1)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Meta semanal (conversas fechadas)</label>
              <Input
                type="number"
                min={1}
                value={weeklyGoal}
                onChange={(e) => setWeeklyGoal(parseInt(e.target.value) || 1)}
              />
            </div>
          </div>
          <Button onClick={saveGoals} disabled={savingGoal}>
            {savingGoal ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Metas
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
