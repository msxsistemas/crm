import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Repeat, Users, UserCheck, UserX, TrendingUp } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface RetentionSummary {
  total_contacts: string;
  returned: string;
  one_time: string;
  retention_rate: string;
  avg_conversations_per_contact: string;
  avg_days_retained: string;
}

interface CohortRow {
  month: string;
  new_contacts: number;
  returned_contacts: number;
}

interface TopContact {
  name: string;
  phone: string;
  visits: number;
  last_visit: string;
}

interface RetentionData {
  summary: RetentionSummary;
  cohort: CohortRow[];
  topReturning: TopContact[];
}

export default function RetentionReport() {
  const [months, setMonths] = useState("6");

  const { data, isLoading } = useQuery<RetentionData>({
    queryKey: ["retention", months],
    queryFn: () => api.get(`/stats/retention?months=${months}`) as Promise<RetentionData>,
  });

  const summary = data?.summary;
  const cohort = data?.cohort ?? [];
  const topReturning = data?.topReturning ?? [];

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return "-";
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Repeat className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold">Retenção de Clientes</h1>
            <p className="text-sm text-muted-foreground">
              Clientes que abriram mais de 1 conversa são considerados recorrentes
            </p>
          </div>
        </div>
        <Select value={months} onValueChange={setMonths}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Últimos 3 meses</SelectItem>
            <SelectItem value="6">Últimos 6 meses</SelectItem>
            <SelectItem value="12">Últimos 12 meses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Taxa de Retenção
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">
              {isLoading ? "..." : `${summary?.retention_rate ?? 0}%`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-blue-500" />
              Clientes que voltaram
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-blue-600">
              {isLoading ? "..." : summary?.returned ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <UserX className="h-4 w-4 text-orange-500" />
              Visita única
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-orange-500">
              {isLoading ? "..." : summary?.one_time ?? 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              Média conversas/contato
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">
              {isLoading ? "..." : summary?.avg_conversations_per_contact ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cohort Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Coorte Mensal — Novos vs Recorrentes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              Carregando...
            </div>
          ) : cohort.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-muted-foreground">
              Sem dados para o período selecionado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={cohort} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="new_contacts" name="Novos Contatos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="returned_contacts" name="Clientes Recorrentes" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top Returning Contacts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-blue-600" />
            Top 10 Clientes Fiéis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : topReturning.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum cliente fiel encontrado no período</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 px-3">#</th>
                    <th className="text-left py-2 px-3">Nome</th>
                    <th className="text-left py-2 px-3">Telefone</th>
                    <th className="text-center py-2 px-3">Visitas</th>
                    <th className="text-left py-2 px-3">Última visita</th>
                  </tr>
                </thead>
                <tbody>
                  {topReturning.map((c, i) => (
                    <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
                      <td className="py-2 px-3 text-muted-foreground font-medium">{i + 1}</td>
                      <td className="py-2 px-3 font-medium">{c.name || "—"}</td>
                      <td className="py-2 px-3 text-muted-foreground">{c.phone}</td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-flex items-center justify-center bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded-full px-2.5 py-0.5 text-xs font-semibold">
                          {c.visits}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{formatDate(c.last_visit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info */}
      <p className="text-xs text-muted-foreground text-center">
        Clientes que abriram mais de 1 conversa são considerados recorrentes. Período: últimos {months} meses.
      </p>
    </div>
  );
}
