import { useState } from "react";
import {
  ArrowLeft, Users, Zap, CheckCircle, Target, BarChart3, TrendingUp,
  Clock, Activity, AlertCircle, RotateCw, Filter, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface KanbanContact {
  id: string;
  name: string;
  phone: string;
  status: string;
  [key: string]: any;
}

interface KanbanColumn {
  id: string;
  name: string;
  color: string;
  isFinalized?: boolean;
  contacts: KanbanContact[];
}

interface Board {
  id: string;
  name: string;
  columns: KanbanColumn[];
}

interface Props {
  board: Board;
  unassigned: KanbanContact[];
  onBack: () => void;
}

const KanbanDashboard = ({ board, unassigned, onBack }: Props) => {
  const [period, setPeriod] = useState("Todo período");

  const totalContacts = board.columns.reduce((s, c) => s + c.contacts.length, 0) + unassigned.length;
  const activeContacts = board.columns
    .filter((c) => !c.isFinalized)
    .reduce((s, c) => s + c.contacts.length, 0);
  const finalized = board.columns
    .filter((c) => c.isFinalized)
    .reduce((s, c) => s + c.contacts.length, 0);
  const conversionRate = totalContacts > 0 ? Math.round((finalized / totalContacts) * 100) : 0;

  const pieData = board.columns
    .filter((c) => c.contacts.length > 0)
    .map((c) => ({ name: c.name, value: c.contacts.length, color: c.color }));

  if (pieData.length === 0) {
    pieData.push({ name: "Vazio", value: 1, color: "#333" });
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Dashboard do Kanban
            </h1>
            <p className="text-sm text-muted-foreground">Métricas e análises do funil</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                Todos os boards
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Todos os boards</DropdownMenuItem>
              <DropdownMenuItem>{board.name}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                📅 {period}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {["Hoje", "Últimos 7 dias", "Últimos 30 dias", "Últimos 90 dias", "Todo período"].map((p) => (
                <DropdownMenuItem key={p} onClick={() => setPeriod(p)}>
                  {p}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="icon" variant="ghost">
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Metric cards */}
        <div className="grid grid-cols-4 gap-4">
          <MetricCard icon={Users} label="Total de Contatos" value={totalContacts} sub="Em todas as colunas" color="text-primary" />
          <MetricCard icon={Zap} label="Em Andamento" value={activeContacts} sub="Contatos ativos no funil" color="text-warning" />
          <MetricCard icon={CheckCircle} label="Finalizados" value={finalized} sub="Chegaram ao final" color="text-[hsl(var(--success))]" />
          <MetricCard icon={Target} label="Taxa de Conversão" value={`${conversionRate}%`} sub="Total finalizado / Total" color="text-primary" />
        </div>

        {/* Unassigned alert */}
        {unassigned.length > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-warning/10 border border-warning/20 px-5 py-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-warning" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  {unassigned.length} contatos sem coluna definida
                </p>
                <p className="text-xs text-muted-foreground">
                  Organize esses contatos no Kanban para melhor acompanhamento
                </p>
              </div>
            </div>
            <Button onClick={onBack} className="bg-destructive hover:bg-destructive/90">
              Organizar
            </Button>
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-5 gap-4">
          {/* Distribution */}
          <Card className="col-span-3 p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-primary" />
              Distribuição por Coluna
            </h3>
            <div className="space-y-3">
              {board.columns.map((col) => {
                const pct = totalContacts > 0 ? Math.round((col.contacts.length / totalContacts) * 100) : 0;
                return (
                  <div key={col.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-foreground flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                        {col.name}
                        {col.isFinalized && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">Finalizado</Badge>
                        )}
                      </span>
                      <span className="text-sm text-foreground">
                        {col.contacts.length} <span className="text-muted-foreground text-xs">({pct}%)</span>
                      </span>
                    </div>
                    {pct > 0 && (
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: col.color }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Donut chart */}
          <Card className="col-span-2 p-5 flex flex-col items-center">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4 self-start">
              <TrendingUp className="h-4 w-4 text-primary" />
              Visão Geral
            </h3>
            <div className="relative w-40 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold text-foreground">{totalContacts}</span>
                <span className="text-xs text-muted-foreground">Contatos</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-4 text-xs">
              {board.columns.map((col) => (
                <span key={col.id} className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                  {col.name}
                </span>
              ))}
            </div>
          </Card>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Funnel */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <Target className="h-4 w-4 text-primary" />
              Funil de Conversão
            </h3>
            <div className="space-y-2">
              {board.columns.filter((c) => !c.isFinalized).map((col) => (
                <div key={col.id} className="flex items-center justify-between py-1">
                  <span className="text-sm text-foreground flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                    {col.name}
                  </span>
                  <span className="text-sm font-medium text-foreground">{col.contacts.length}</span>
                </div>
              ))}
              {board.columns.filter((c) => !c.isFinalized).length > 1 && (
                <p className="text-xs text-muted-foreground text-center py-1">↓ {conversionRate}% conversão</p>
              )}
              <div className="border-t border-border pt-2 mt-2">
                <p className="text-xs text-muted-foreground mb-2">⊙ Estados Finalizados</p>
                {board.columns.filter((c) => c.isFinalized).map((col) => (
                  <div key={col.id} className="flex items-center justify-between py-1">
                    <span className="text-sm text-foreground flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
                      {col.name}
                    </span>
                    <span className="text-sm font-medium text-foreground">{col.contacts.length}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Recent movements */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-primary" />
              Movimentações Recentes
            </h3>
            <div className="space-y-3">
              {board.columns
                .filter((c) => c.contacts.length > 0)
                .flatMap((col) =>
                  col.contacts.map((contact) => ({
                    contact,
                    column: col,
                  }))
                )
                .slice(0, 5)
                .map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                      {item.contact.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {item.contact.name} movido para{" "}
                        <Badge className="text-[10px] px-1.5 py-0" style={{ backgroundColor: item.column.color, color: "#fff" }}>
                          {item.column.name}
                        </Badge>
                      </p>
                      <p className="text-xs text-muted-foreground">há cerca de 1 hora</p>
                    </div>
                  </div>
                ))}
              {board.columns.every((c) => c.contacts.length === 0) && (
                <p className="text-sm text-muted-foreground">Nenhuma movimentação recente</p>
              )}
            </div>
          </Card>
        </div>

        {/* Bottom stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Movimentações (7 dias)</p>
              <p className="text-xl font-bold text-foreground">{totalContacts}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[hsl(var(--success))]/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-[hsl(var(--success))]" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Colunas Ativas</p>
              <p className="text-xl font-bold text-foreground">{board.columns.length}</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Média por Coluna</p>
              <p className="text-xl font-bold text-foreground">
                {board.columns.length > 0 ? Math.round(totalContacts / board.columns.length) : 0}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

// --- Metric Card ---

interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub: string;
  color: string;
}

const MetricCard = ({ icon: Icon, label, value, sub, color }: MetricCardProps) => (
  <Card className="p-4 flex items-center justify-between">
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
    <div className={`h-10 w-10 rounded-full bg-muted flex items-center justify-center ${color}`}>
      <Icon className="h-5 w-5" />
    </div>
  </Card>
);

export default KanbanDashboard;
