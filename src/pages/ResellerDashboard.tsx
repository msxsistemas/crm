import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Smartphone, BarChart3, Palette } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ResellerDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [account, setAccount] = useState<any>(null);
  const [subUsers, setSubUsers] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    const { data: acc } = await supabase.from("reseller_accounts").select("*").eq("user_id", user!.id).single();
    setAccount(acc);
    if (acc?.plan_id) {
      const { data: p } = await supabase.from("reseller_plans").select("*").eq("id", acc.plan_id).single();
      setPlan(p);
    }
    const { data: subs } = await supabase.from("reseller_sub_users").select("*").eq("reseller_id", user!.id);
    setSubUsers(subs || []);
    const { data: conns } = await supabase.from("evolution_connections").select("*").eq("user_id", user!.id);
    setConnections(conns || []);
    setLoading(false);
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><p className="text-muted-foreground">Carregando...</p></div>;

  if (!account) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-6 space-y-4">
            <p className="text-lg font-medium">Conta de revendedor não encontrada</p>
            <p className="text-muted-foreground">Sua conta ainda não foi configurada. Entre em contato com o administrador.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const cards = [
    { label: "Sub-usuários", value: `${subUsers.length}${plan ? `/${plan.max_users}` : ""}`, icon: Users, color: "text-primary", bg: "bg-primary/10", route: "/revenda/subusuarios" },
    { label: "Conexões", value: `${connections.length}${plan ? `/${plan.max_connections}` : ""}`, icon: Smartphone, color: "text-green-500", bg: "bg-green-500/10", route: "/revenda/conexoes" },
    { label: "Plano", value: plan?.name || "Nenhum", icon: BarChart3, color: "text-blue-500", bg: "bg-blue-500/10", route: "/revenda" },
    { label: "Status", value: account.is_active ? "Ativo" : "Inativo", icon: Palette, color: "text-amber-500", bg: "bg-amber-500/10", route: "/revenda/marca" },
  ];

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Painel do Revendedor</h1>
        <p className="text-muted-foreground">{account.company_name || "Sua revenda"}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
    </div>
  );
};

export default ResellerDashboard;
