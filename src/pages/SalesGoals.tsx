import { useState, useEffect, useCallback } from "react";
import {
  Target, TrendingUp, Users, DollarSign, Plus, RefreshCw,
  Trophy, MessageSquare, CheckCircle, Star
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db";

interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

interface SalesGoal {
  id: string;
  agent_id: string;
  period_month: number;
  period_year: number;
  goal_type: "conversations" | "revenue" | "conversions" | "nps";
  target_value: number;
  current_value: number;
}

interface AgentGoals {
  profile: Profile;
  goals: Record<string, SalesGoal | undefined>;
  currentValues: Record<string, number>;
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

function getAchievementColor(pct: number) {
  if (pct >= 100) return "bg-green-500";
  if (pct >= 70) return "bg-blue-500";
  if (pct >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function getAchievementBg(pct: number) {
  if (pct >= 100) return "border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800";
  if (pct >= 70) return "border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800";
  if (pct >= 40) return "border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-800";
  return "border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800";
}

const SalesGoals = () => {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [goals, setGoals] = useState<SalesGoal[]>([]);
  const [currentValues, setCurrentValues] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Dialog form state
  const [formAgent, setFormAgent] = useState("");
  const [formConversations, setFormConversations] = useState("");
  const [formRevenue, setFormRevenue] = useState("");
  const [formConversions, setFormConversions] = useState("");
  const [formNps, setFormNps] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, goalsRes] = await Promise.all([
        db.from("profiles").select("id, full_name, email"),
        db
          .from("sales_goals")
          .select("*")
          .eq("period_month", month)
          .eq("period_year", year),
      ]);

      const fetchedProfiles: Profile[] = profilesRes.data || [];
      const fetchedGoals: SalesGoal[] = (goalsRes.data || []) as SalesGoal[];
      setProfiles(fetchedProfiles);
      setGoals(fetchedGoals);

      // Calculate current values for each agent
      const startDate = new Date(year, month - 1, 1).toISOString();
      const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

      const agentIds = fetchedProfiles.map(p => p.id);
      if (agentIds.length === 0) { setLoading(false); return; }

      const [convRes, oppRes, reviewsRes] = await Promise.all([
        db
          .from("conversations")
          .select("id, assigned_to, created_at")
          .gte("created_at", startDate)
          .lte("created_at", endDate)
          .in("assigned_to", agentIds),
        db
          .from("opportunities")
          .select("id, assigned_to, value, status, created_at")
          .gte("created_at", startDate)
          .lte("created_at", endDate),
        db
          .from("reviews")
          .select("id, agent_id, rating, created_at")
          .gte("created_at", startDate)
          .lte("created_at", endDate),
      ]);

      const convData = convRes.data || [];
      const oppData = oppRes.data || [];
      const reviewData = reviewsRes.data || [];

      const vals: Record<string, Record<string, number>> = {};
      fetchedProfiles.forEach(p => {
        const agentConvs = convData.filter((c: any) => c.assigned_to === p.id);
        const agentOpps = oppData.filter((o: any) => o.assigned_to === p.id);
        const agentWon = agentOpps.filter((o: any) => o.status === "won");
        const agentRevenue = agentOpps.reduce((sum: number, o: any) => sum + (o.value || 0), 0);
        const agentReviews = reviewData.filter((r: any) => r.agent_id === p.id);
        const avgNps = agentReviews.length > 0
          ? agentReviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / agentReviews.length
          : 0;

        vals[p.id] = {
          conversations: agentConvs.length,
          revenue: agentRevenue,
          conversions: agentWon.length,
          nps: parseFloat(avgNps.toFixed(1)),
        };
      });
      setCurrentValues(vals);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar metas");
    }
    setLoading(false);
  }, [month, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openDialog = () => {
    setFormAgent(profiles[0]?.id || "");
    setFormConversations("");
    setFormRevenue("");
    setFormConversions("");
    setFormNps("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formAgent) { toast.error("Selecione um agente"); return; }
    setSaving(true);
    try {
      const entries = [
        { goal_type: "conversations", target_value: parseFloat(formConversations) || 0 },
        { goal_type: "revenue", target_value: parseFloat(formRevenue) || 0 },
        { goal_type: "conversions", target_value: parseFloat(formConversions) || 0 },
        { goal_type: "nps", target_value: parseFloat(formNps) || 0 },
      ];

      for (const entry of entries) {
        if (entry.target_value <= 0) continue;
        const { error } = await db
          .from("sales_goals")
          .upsert({
            agent_id: formAgent,
            period_month: month,
            period_year: year,
            goal_type: entry.goal_type,
            target_value: entry.target_value,
          }, { onConflict: "agent_id,period_month,period_year,goal_type" });
        if (error) throw error;
      }

      toast.success("Metas salvas com sucesso!");
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar metas");
    }
    setSaving(false);
  };

  // Build agent goals map
  const agentGoalsList: AgentGoals[] = profiles.map(profile => {
    const agentGoals = goals.filter(g => g.agent_id === profile.id);
    const goalsMap: Record<string, SalesGoal | undefined> = {};
    agentGoals.forEach(g => { goalsMap[g.goal_type] = g; });
    return {
      profile,
      goals: goalsMap,
      currentValues: currentValues[profile.id] || { conversations: 0, revenue: 0, conversions: 0, nps: 0 },
    };
  }).filter(a => Object.keys(a.goals).length > 0);

  // Team summary
  const totalActiveGoals = goals.length;
  const agentsAboveGoal = agentGoalsList.filter(a => {
    const types = Object.keys(a.goals);
    if (types.length === 0) return false;
    return types.every(type => {
      const goal = a.goals[type];
      if (!goal || goal.target_value === 0) return true;
      const cur = a.currentValues[type] || 0;
      return cur >= goal.target_value;
    });
  }).length;

  const revenueGoals = goals.filter(g => g.goal_type === "revenue");
  const totalRevenueTarget = revenueGoals.reduce((s, g) => s + g.target_value, 0);
  const totalRevenueCurrent = Object.values(currentValues).reduce((s, v) => s + (v.revenue || 0), 0);
  const revenuePercent = totalRevenueTarget > 0 ? Math.min(100, (totalRevenueCurrent / totalRevenueTarget) * 100) : 0;

  const years = [year - 1, year, year + 1];

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="mx-6 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <Target className="h-5 w-5" /> Metas de Vendas
          </h1>
          <p className="text-sm text-muted-foreground">Acompanhe e defina metas de performance por agente</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Month selector */}
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Year selector */}
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-24 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={openDialog} className="gap-1.5">
            <Plus className="h-4 w-4" /> Definir Metas
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Team summary cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                  <Target className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Total de metas ativas</p>
                  <p className="text-2xl font-bold text-foreground">{totalActiveGoals}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-green-100 dark:bg-green-900/30">
                  <Users className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Agentes acima da meta</p>
                  <p className="text-2xl font-bold text-foreground">{agentsAboveGoal}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                  <DollarSign className="h-5 w-5 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Meta de receita da equipe</p>
                  <p className="text-sm font-bold text-foreground">
                    {formatCurrency(totalRevenueCurrent)} / {formatCurrency(totalRevenueTarget)}
                  </p>
                </div>
                <Badge className={`text-xs ${revenuePercent >= 100 ? "bg-green-500" : "bg-blue-500"} text-white`}>
                  {revenuePercent.toFixed(0)}%
                </Badge>
              </div>
              <Progress value={revenuePercent} className="h-2 rounded-full" />
            </CardContent>
          </Card>
        </div>

        {/* Agent grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
            Carregando metas...
          </div>
        ) : agentGoalsList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Target className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-base font-medium text-foreground">Nenhuma meta definida</p>
            <p className="text-sm text-muted-foreground mt-1">
              Clique em "Definir Metas" para criar metas para {MONTH_NAMES[month - 1]}/{year}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {agentGoalsList.map(({ profile, goals: agentGoals, currentValues: agentCurrent }) => {
              const types = Object.keys(agentGoals);
              const overallPcts = types.map(t => {
                const goal = agentGoals[t];
                if (!goal || goal.target_value === 0) return 100;
                return Math.min(100, ((agentCurrent[t] || 0) / goal.target_value) * 100);
              });
              const overallPct = overallPcts.length > 0
                ? overallPcts.reduce((s, v) => s + v, 0) / overallPcts.length
                : 0;
              const achieved = overallPct >= 100;
              const initials = (profile.full_name || profile.email || "U")
                .split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

              const goalRows: Array<{
                type: string;
                icon: React.ReactNode;
                label: string;
                current: number;
                target: number;
                formatter: (v: number) => string;
              }> = [
                {
                  type: "conversations",
                  icon: <MessageSquare className="h-3.5 w-3.5" />,
                  label: "Atendimentos",
                  current: agentCurrent.conversations || 0,
                  target: agentGoals["conversations"]?.target_value || 0,
                  formatter: (v) => String(Math.round(v)),
                },
                {
                  type: "revenue",
                  icon: <DollarSign className="h-3.5 w-3.5" />,
                  label: "Receita",
                  current: agentCurrent.revenue || 0,
                  target: agentGoals["revenue"]?.target_value || 0,
                  formatter: formatCurrency,
                },
                {
                  type: "conversions",
                  icon: <CheckCircle className="h-3.5 w-3.5" />,
                  label: "Conversões",
                  current: agentCurrent.conversions || 0,
                  target: agentGoals["conversions"]?.target_value || 0,
                  formatter: (v) => String(Math.round(v)),
                },
                {
                  type: "nps",
                  icon: <Star className="h-3.5 w-3.5" />,
                  label: "NPS",
                  current: agentCurrent.nps || 0,
                  target: agentGoals["nps"]?.target_value || 0,
                  formatter: (v) => v.toFixed(1),
                },
              ].filter(r => agentGoals[r.type]);

              return (
                <div
                  key={profile.id}
                  className={`rounded-xl border p-5 space-y-4 ${getAchievementBg(overallPct)}`}
                >
                  {/* Agent header */}
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">
                        {profile.full_name || profile.email}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                    </div>
                    {achieved ? (
                      <Badge className="bg-green-500 text-white gap-1 text-xs">
                        <Trophy className="h-3 w-3" /> Meta atingida!
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs font-semibold">
                        {overallPct.toFixed(0)}% concluído
                      </Badge>
                    )}
                  </div>

                  {/* Goal progress bars */}
                  <div className="space-y-3">
                    {goalRows.map(row => {
                      const pct = row.target > 0
                        ? Math.min(100, (row.current / row.target) * 100)
                        : 0;
                      return (
                        <div key={row.type}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                              {row.icon} {row.label}
                            </span>
                            <span className="text-xs font-semibold text-foreground">
                              {row.formatter(row.current)} / {row.formatter(row.target)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${getAchievementColor(pct)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Define Goals Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" /> Definir Metas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Agente</label>
              <Select value={formAgent} onValueChange={setFormAgent}>
                <SelectTrigger className="h-10 text-sm">
                  <SelectValue placeholder="Selecionar agente" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Período: <strong>{MONTH_NAMES[month - 1]} / {year}</strong>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                  <MessageSquare className="h-3.5 w-3.5 inline mr-1" /> Atendimentos
                </label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Ex: 100"
                  value={formConversations}
                  onChange={e => setFormConversations(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                  <DollarSign className="h-3.5 w-3.5 inline mr-1" /> Receita (R$)
                </label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Ex: 10000"
                  value={formRevenue}
                  onChange={e => setFormRevenue(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                  <CheckCircle className="h-3.5 w-3.5 inline mr-1" /> Conversões
                </label>
                <Input
                  type="number"
                  min={0}
                  placeholder="Ex: 20"
                  value={formConversions}
                  onChange={e => setFormConversions(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                  <Star className="h-3.5 w-3.5 inline mr-1" /> NPS (nota média)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  placeholder="Ex: 8.5"
                  value={formNps}
                  onChange={e => setFormNps(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                <TrendingUp className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar Metas"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalesGoals;
