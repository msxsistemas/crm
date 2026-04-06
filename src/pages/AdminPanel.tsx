import { useState, useEffect, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Shield, Users, MessageSquare, Smartphone, Server,
  RefreshCw, ExternalLink, Clock, Activity, Database,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import { toast } from "sonner";

interface AdminStats {
  users: {
    total: string;
    online: string;
    agents: string;
    admins: string;
    new_this_week: string;
  };
  conversations: {
    total: string;
    open: string;
    closed: string;
    today: string;
    this_week: string;
  };
  messages: {
    total: string;
    today: string;
  };
  connections: {
    total: string;
    connected: string;
  };
  migrations: {
    count: string;
  };
  uptime: number;
  node_version: string;
  timestamp: string;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const AdminPanel = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Guard: redirect if not admin
  useEffect(() => {
    if (user && (user as any).role !== "admin") {
      navigate("/");
    }
  }, [user, navigate]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.get<AdminStats>("/stats/admin-panel");
      setStats(data);
      setLastRefresh(new Date());
    } catch (e: any) {
      toast.error("Erro ao carregar estatísticas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Painel de Controle</h1>
            <p className="text-sm text-muted-foreground">
              Atualizado em {lastRefresh.toLocaleTimeString("pt-BR")}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={fetchStats}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </Button>
      </div>

      {/* Users */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" /> Usuários
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats?.users.total} color="blue" />
          <StatCard label="Online agora" value={stats?.users.online} color="green" />
          <StatCard label="Agentes" value={stats?.users.agents} color="purple" />
          <StatCard label="Admins" value={stats?.users.admins} color="orange" />
          <StatCard label="Novos esta semana" value={stats?.users.new_this_week} color="cyan" />
        </div>
      </div>

      {/* Conversations */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <MessageSquare className="h-4 w-4" /> Conversas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total" value={stats?.conversations.total} color="blue" />
          <StatCard label="Abertas" value={stats?.conversations.open} color="green" />
          <StatCard label="Fechadas" value={stats?.conversations.closed} color="gray" />
          <StatCard label="Hoje" value={stats?.conversations.today} color="orange" />
          <StatCard label="Esta semana" value={stats?.conversations.this_week} color="purple" />
        </div>
      </div>

      {/* Messages */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4" /> Mensagens
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total de mensagens" value={stats?.messages.total} color="blue" />
          <StatCard label="Mensagens hoje" value={stats?.messages.today} color="green" />
        </div>
      </div>

      {/* Connections */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Smartphone className="h-4 w-4" /> Conexões WhatsApp
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Total de conexões" value={stats?.connections.total} color="blue" />
          <StatCard label="Ativas" value={stats?.connections.connected} color="green" />
        </div>
      </div>

      {/* System */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
          <Server className="h-4 w-4" /> Sistema
        </h2>
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Uptime do servidor</p>
                <p className="text-lg font-mono font-semibold text-foreground">
                  {stats ? formatUptime(stats.uptime) : "--:--:--"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Versão do Node.js</p>
                <p className="text-lg font-mono font-semibold text-foreground">
                  {stats?.node_version || "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Migrations aplicadas</p>
                <Badge variant="secondary" className="text-sm font-mono">
                  {stats?.migrations.count ?? "—"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="border-t border-border pt-4 flex flex-wrap gap-3">
            <Link to="/auditoria">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="h-3.5 w-3.5" />
                Log de Auditoria
              </Button>
            </Link>
            <Link to="/configuracoes">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="h-3.5 w-3.5" />
                Configurações
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};

interface StatCardProps {
  label: string;
  value?: string;
  color: "blue" | "green" | "purple" | "orange" | "cyan" | "gray";
}

const colorMap: Record<string, string> = {
  blue: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
  green: "text-green-600 bg-green-50 dark:bg-green-950/30",
  purple: "text-purple-600 bg-purple-50 dark:bg-purple-950/30",
  orange: "text-orange-600 bg-orange-50 dark:bg-orange-950/30",
  cyan: "text-cyan-600 bg-cyan-50 dark:bg-cyan-950/30",
  gray: "text-gray-600 bg-gray-50 dark:bg-gray-950/30",
};

const StatCard = ({ label, value, color }: StatCardProps) => (
  <Card className="p-4">
    <p className="text-xs text-muted-foreground mb-1">{label}</p>
    <p className={`text-2xl font-bold ${colorMap[color]?.split(" ")[0] || "text-foreground"}`}>
      {value ?? "—"}
    </p>
  </Card>
);

export default AdminPanel;
