import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Star, Zap, Target, MessageSquare, Clock } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Badge {
  id: string;
  label: string;
  color: string;
}

interface Agent {
  id: string;
  full_name: string;
  avatar_url: string | null;
  points_week: number;
  closed_week: number;
  closed_total: number;
  avg_csat: number | null;
  avg_response_min: number | null;
  badges: Badge[];
  rank: number;
}

const BADGE_COLORS: Record<string, string> = {
  gold: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  silver: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  bronze: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  yellow: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
};

function AgentAvatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return <img src={url} alt={name} className="h-full w-full object-cover rounded-full" />;
  }
  return (
    <span className="font-bold text-white text-lg">
      {name?.charAt(0)?.toUpperCase() || "A"}
    </span>
  );
}

function PodiumCard({ agent, position }: { agent: Agent; position: 1 | 2 | 3 }) {
  const sizeClass = position === 1 ? "pt-0" : position === 2 ? "pt-6" : "pt-10";
  const avatarSize = position === 1 ? "h-20 w-20" : "h-16 w-16";
  const bgClass =
    position === 1
      ? "border-yellow-300 dark:border-yellow-600 bg-gradient-to-b from-yellow-50 to-white dark:from-yellow-900/20 dark:to-gray-800"
      : position === 2
      ? "border-gray-300 dark:border-gray-500 bg-gradient-to-b from-gray-50 to-white dark:from-gray-700/30 dark:to-gray-800"
      : "border-orange-200 dark:border-orange-700 bg-gradient-to-b from-orange-50 to-white dark:from-orange-900/20 dark:to-gray-800";
  const avatarBg =
    position === 1 ? "bg-yellow-500" : position === 2 ? "bg-gray-400" : "bg-orange-400";

  return (
    <div className={`flex flex-col items-center ${sizeClass}`}>
      <div className={`rounded-2xl border-2 ${bgClass} p-5 flex flex-col items-center gap-2 w-full`}>
        <div className="text-2xl">
          {position === 1 ? "🥇" : position === 2 ? "🥈" : "🥉"}
        </div>
        <div className={`${avatarSize} rounded-full ${avatarBg} flex items-center justify-center overflow-hidden shrink-0`}>
          <AgentAvatar name={agent.full_name} url={agent.avatar_url} />
        </div>
        <p className="font-bold text-center text-sm leading-tight">{agent.full_name}</p>
        <p className="text-2xl font-extrabold text-blue-600">{agent.points_week} pts</p>
        <div className="flex flex-wrap gap-1 justify-center">
          {agent.badges.map((b) => (
            <span key={b.id} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${BADGE_COLORS[b.color] || BADGE_COLORS.blue}`}>
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Gamification() {
  const { data: agents = [], isLoading } = useQuery<Agent[]>({
    queryKey: ["gamification"],
    queryFn: () => api.get("/stats/gamification") as Promise<Agent[]>,
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });

  const now = new Date();
  const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), "dd/MM", { locale: ptBR });
  const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), "dd/MM/yyyy", { locale: ptBR });

  const top3 = agents.slice(0, 3);
  const rest = agents.slice(3);

  // Reorder podium: 2nd | 1st | 3rd
  const podiumOrder: (Agent | undefined)[] = [top3[1], top3[0], top3[2]];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Trophy className="h-7 w-7 text-yellow-500" />
        <div>
          <h1 className="text-2xl font-bold">Ranking Semanal 🏆</h1>
          <p className="text-sm text-muted-foreground">{weekStart} – {weekEnd}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Carregando ranking...
        </div>
      ) : agents.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Nenhum agente encontrado
        </div>
      ) : (
        <>
          {/* Podium */}
          {top3.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-center">Top 3 da Semana</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end justify-center gap-4">
                  {podiumOrder.map((agent, idx) => {
                    if (!agent) return <div key={idx} className="w-40" />;
                    const pos = ([2, 1, 3] as const)[idx];
                    return (
                      <div key={agent.id} className="flex-1 max-w-[180px]">
                        <PodiumCard agent={agent} position={pos} />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Full Ranking Table */}
          <Card>
            <CardHeader>
              <CardTitle>Ranking Completo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-left py-2 px-3 w-12">#</th>
                      <th className="text-left py-2 px-3">Agente</th>
                      <th className="text-center py-2 px-3">Pontos</th>
                      <th className="text-center py-2 px-3">Fechadas</th>
                      <th className="text-center py-2 px-3">CSAT</th>
                      <th className="text-center py-2 px-3">T. Resposta</th>
                      <th className="text-left py-2 px-3">Conquistas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((agent) => (
                      <tr key={agent.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="py-3 px-3">
                          <span className="font-bold text-muted-foreground">
                            {agent.rank === 1 ? "🥇" : agent.rank === 2 ? "🥈" : agent.rank === 3 ? "🥉" : `#${agent.rank}`}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center overflow-hidden shrink-0">
                              <AgentAvatar name={agent.full_name} url={agent.avatar_url} />
                            </div>
                            <span className="font-medium truncate max-w-[140px]">{agent.full_name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="font-bold text-blue-600">{agent.points_week}</span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center gap-1">
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                            {agent.closed_week}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {agent.avg_csat != null ? (
                            <span className="inline-flex items-center gap-1 text-yellow-600">
                              <Star className="h-3.5 w-3.5 fill-yellow-400" />
                              {agent.avg_csat}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {agent.avg_response_min != null ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3.5 w-3.5" />
                              {agent.avg_response_min}min
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {agent.badges.map((b) => (
                              <span
                                key={b.id}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${BADGE_COLORS[b.color] || BADGE_COLORS.blue}`}
                              >
                                {b.label}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* How to earn points */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-5 w-5 text-blue-600" />
                Como ganhar pontos esta semana
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                  <MessageSquare className="h-8 w-8 text-blue-500 shrink-0" />
                  <div>
                    <p className="font-bold text-blue-700 dark:text-blue-300 text-lg">+10 pts</p>
                    <p className="text-sm text-blue-600 dark:text-blue-400">Por conversa fechada</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                  <Star className="h-8 w-8 text-yellow-500 shrink-0" />
                  <div>
                    <p className="font-bold text-yellow-700 dark:text-yellow-300 text-lg">+5 pts</p>
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">Por cada estrela de CSAT</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                  <Zap className="h-8 w-8 text-green-500 shrink-0" />
                  <div>
                    <p className="font-bold text-green-700 dark:text-green-300 text-lg">+3 pts</p>
                    <p className="text-sm text-green-600 dark:text-green-400">Resposta em menos de 5 min</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Motivational message */}
          <p className="text-center text-sm text-muted-foreground italic py-2">
            Continue assim! Cada conversa fechada é um cliente satisfeito. 💪
          </p>
        </>
      )}
    </div>
  );
}
