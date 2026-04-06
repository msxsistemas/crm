import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";

interface AgentStat {
  id: string;
  name: string | null;
  avatar_url: string | null;
  status: string | null;
  conversations_today: number;
  open_now: number;
  closed_today: number;
}

const getInitials = (name: string | null) => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const AgentStatsPanel = () => {
  const [agents, setAgents] = useState<AgentStat[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get<AgentStat[]>("/stats/agents-today");
      setAgents(data);
    } catch {
      // silently fail — panel is optional
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="mt-8 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground">Desempenho hoje</h2>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} className="gap-1.5 h-8 text-xs">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : agents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum dado disponível</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Agente</th>
                <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground">Status</th>
                <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground">Conv. hoje</th>
                <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground">Abertas</th>
                <th className="text-center px-4 py-2.5 font-semibold text-muted-foreground">Fechadas hoje</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {agent.avatar_url ? (
                        <img src={agent.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">
                          {getInitials(agent.name)}
                        </div>
                      )}
                      <span className="font-medium text-foreground">{agent.name || "Agente"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {agent.status === "online" ? (
                      <Badge className="bg-green-100 text-green-700 border-green-300">Online</Badge>
                    ) : (
                      <Badge variant="secondary">Offline</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center font-semibold">{agent.conversations_today ?? 0}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`font-semibold ${(agent.open_now ?? 0) > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                      {agent.open_now ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className="font-semibold text-green-600">{agent.closed_today ?? 0}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AgentStatsPanel;
