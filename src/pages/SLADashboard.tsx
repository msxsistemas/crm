import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { Timer, AlertTriangle, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SLATeamRow {
  team_name: string;
  team_id: string;
  total: string;
  within_sla: string;
  breached: string;
  active_breaches: string;
  avg_response_min: string;
}

function getSemaforo(total: number, breached: number): "green" | "yellow" | "red" {
  if (total === 0) return "green";
  const pct = (breached / total) * 100;
  if (pct > 20) return "red";
  if (pct > 5) return "yellow";
  return "green";
}

const semaforoClass: Record<string, string> = {
  green: "bg-green-500",
  yellow: "bg-yellow-400",
  red: "bg-red-500",
};

const semaforoLabel: Record<string, string> = {
  green: "OK",
  yellow: "Atenção",
  red: "Crítico",
};

export default function SLADashboard() {
  const [rows, setRows] = useState<SLATeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.get<SLATeamRow[]>("/stats/sla-by-team");
      setRows(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Aggregate totals
  const totals = rows.reduce(
    (acc, r) => ({
      total: acc.total + Number(r.total || 0),
      within_sla: acc.within_sla + Number(r.within_sla || 0),
      breached: acc.breached + Number(r.breached || 0),
      active_breaches: acc.active_breaches + Number(r.active_breaches || 0),
    }),
    { total: 0, within_sla: 0, breached: 0, active_breaches: 0 }
  );

  const slaPercent =
    totals.total > 0 ? ((totals.within_sla / totals.total) * 100).toFixed(1) : "—";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer className="h-6 w-6 text-blue-500" />
          <h1 className="text-2xl font-bold">Painel de SLA por Equipe</h1>
        </div>
        {lastUpdated && (
          <span className="text-xs text-muted-foreground">
            Atualizado às {lastUpdated.toLocaleTimeString("pt-BR")} · Atualiza a cada 30s
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-4 w-4" /> Total Conversas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totals.total}</p>
            <p className="text-xs text-muted-foreground mt-1">últimos 30 dias</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-green-500" /> Dentro do SLA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">{slaPercent}%</p>
            <p className="text-xs text-muted-foreground mt-1">{totals.within_sla} de {totals.total}</p>
          </CardContent>
        </Card>

        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-red-500" /> Violações Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">{totals.active_breaches}</p>
            <p className="text-xs text-muted-foreground mt-1">conversas em breach agora</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
              <Clock className="h-4 w-4" /> Total Violações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totals.breached}</p>
            <p className="text-xs text-muted-foreground mt-1">no período</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Desempenho por Equipe</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Timer className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>Nenhuma equipe encontrada ou sem dados de SLA.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Equipe</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Dentro SLA</TableHead>
                  <TableHead className="text-right">Violações</TableHead>
                  <TableHead className="text-right">Breach Ativas</TableHead>
                  <TableHead className="text-right">Tempo Resp. Médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => {
                  const total = Number(row.total || 0);
                  const breached = Number(row.breached || 0);
                  const withinSla = Number(row.within_sla || 0);
                  const activeBreach = Number(row.active_breaches || 0);
                  const semaforo = getSemaforo(total, breached);
                  const withinPct = total > 0 ? ((withinSla / total) * 100).toFixed(0) : "—";
                  const avgMin = row.avg_response_min
                    ? `${parseFloat(row.avg_response_min).toFixed(1)} min`
                    : "—";

                  return (
                    <TableRow key={row.team_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`h-3 w-3 rounded-full ${semaforoClass[semaforo]}`} />
                          <span className="text-xs text-muted-foreground">{semaforoLabel[semaforo]}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{row.team_name}</TableCell>
                      <TableCell className="text-right">{total}</TableCell>
                      <TableCell className="text-right">
                        <span className="text-green-600 font-medium">{withinSla}</span>
                        <span className="text-muted-foreground text-xs ml-1">({withinPct}%)</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {breached > 0 ? (
                          <Badge variant="destructive">{breached}</Badge>
                        ) : (
                          <span className="text-green-600">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {activeBreach > 0 ? (
                          <Badge variant="destructive" className="animate-pulse">{activeBreach}</Badge>
                        ) : (
                          <span className="text-green-600">0</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{avgMin}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Active breaches section */}
      {totals.active_breaches > 0 && (
        <Card className="border-red-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Alertas Ativos — Violações de SLA em Andamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rows
                .filter(r => Number(r.active_breaches) > 0)
                .map(r => (
                  <div
                    key={r.team_id}
                    className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="font-medium">{r.team_name}</span>
                    </div>
                    <Badge variant="destructive" className="text-sm">
                      {r.active_breaches} conversa(s) em violação agora
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
