import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Users, TrendingUp, Package, CreditCard, Smartphone, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart, Legend } from "recharts";

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ resellers: 0, active: 0, plans: 0, revenue: 0, connections: 0, users: 0 });
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [growthData, setGrowthData] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const [r, p, t, evo, prof] = await Promise.all([
        supabase.from("reseller_accounts").select("id, is_active, created_at"),
        supabase.from("reseller_plans").select("id"),
        supabase.from("reseller_transactions").select("amount, status, created_at"),
        supabase.from("evolution_connections").select("id"),
        supabase.from("profiles").select("id, created_at"),
      ]);

      const resellers = (r.data as any[]) || [];
      const transactions = (t.data as any[]) || [];
      const profiles = (prof.data as any[]) || [];
      const revenue = transactions.filter(x => x.status === "paid").reduce((s, x) => s + Number(x.amount), 0);

      setStats({
        resellers: resellers.length,
        active: resellers.filter(x => x.is_active).length,
        plans: (p.data || []).length,
        revenue,
        connections: (evo.data || []).length,
        users: profiles.length,
      });

      // Build monthly revenue chart data (last 6 months)
      const months = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
        const monthRevenue = transactions
          .filter(tx => tx.status === "paid" && tx.created_at?.startsWith(key))
          .reduce((s, tx) => s + Number(tx.amount), 0);
        const monthResellers = resellers.filter(re => re.created_at?.startsWith(key)).length;
        const monthUsers = profiles.filter(pr => pr.created_at?.startsWith(key)).length;
        months.push({ name: label, receita: monthRevenue, revendedores: monthResellers, usuarios: monthUsers });
      }
      setRevenueData(months);
      
      // Cumulative growth
      let cumResellers = 0;
      let cumUsers = 0;
      const growth = months.map(m => {
        cumResellers += m.revendedores;
        cumUsers += m.usuarios;
        return { name: m.name, revendedores: cumResellers, usuarios: cumUsers };
      });
      setGrowthData(growth);
    };
    load();
  }, []);

  const cards = [
    { label: "Revendedores", value: stats.resellers, icon: Users, color: "text-primary", bg: "bg-primary/10", route: "/admin/revendedores" },
    { label: "Ativos", value: stats.active, icon: TrendingUp, color: "text-green-500", bg: "bg-green-500/10", route: "/admin/revendedores" },
    { label: "Planos", value: stats.plans, icon: Package, color: "text-blue-500", bg: "bg-blue-500/10", route: "/admin/planos" },
    { label: "Receita Total", value: `R$ ${stats.revenue.toFixed(2)}`, icon: CreditCard, color: "text-amber-500", bg: "bg-amber-500/10", route: "/admin/financeiro" },
    { label: "Conexões", value: stats.connections, icon: Smartphone, color: "text-purple-500", bg: "bg-purple-500/10", route: "/admin/conexoes" },
    { label: "Usuários", value: stats.users, icon: ShieldCheck, color: "text-cyan-500", bg: "bg-cyan-500/10", route: "/admin/usuarios" },
  ];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border bg-card p-3 shadow-md">
        <p className="text-sm font-medium text-foreground mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs text-muted-foreground">
            {p.name}: <span className="font-medium text-foreground">{typeof p.value === "number" && p.name === "receita" ? `R$ ${p.value.toFixed(2)}` : p.value}</span>
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Painel Administrativo</h1>
        <p className="text-muted-foreground">Visão geral do sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map(c => (
          <Card key={c.label} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate(c.route)}>
            <CardContent className="pt-6 flex items-center gap-4">
              <div className={`p-3 rounded-xl ${c.bg}`}><c.icon className={`h-6 w-6 ${c.color}`} /></div>
              <div>
                <p className="text-sm text-muted-foreground">{c.label}</p>
                <p className="text-2xl font-bold">{c.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Receita Mensal</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenueData}>
                <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border) / 0.15)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="natural" dataKey="receita" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.45)" strokeWidth={2} dot={false} activeDot={{ r: 6, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "#fff" }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">Crescimento Acumulado</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={growthData}>
                <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border) / 0.15)" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" axisLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
                <Area type="natural" dataKey="revendedores" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.45)" strokeWidth={2} dot={false} activeDot={{ r: 6, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "#fff" }} name="Revendedores" />
                <Area type="natural" dataKey="usuarios" stroke="hsl(142 71% 45%)" fill="hsl(142 71% 45% / 0.45)" strokeWidth={2} dot={false} activeDot={{ r: 6, fill: "hsl(142 71% 45%)", strokeWidth: 2, stroke: "#fff" }} name="Usuários" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdminDashboard;
