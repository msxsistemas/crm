import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart2,
  RefreshCw,
  Printer,
  Filter,
  TrendingUp,
  CheckCircle,
  Clock,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { db } from "@/lib/db";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ---- Types ----
interface DailyCount {
  date: string;
  count: number;
}

interface StatusCount {
  status: string;
  count: number;
}

interface AgentStat {
  agent: string;
  total: number;
  resolved: number;
}

interface HeatmapCell {
  day: number; // 0=Sun
  hour: number;
  count: number;
}

interface Connection {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  full_name: string | null;
}

// ---- Helpers ----
const DAYS_OPTIONS = [
  { label: "Últimos 7 dias", value: "7" },
  { label: "Últimos 15 dias", value: "15" },
  { label: "Últimos 30 dias", value: "30" },
  { label: "Últimos 90 dias", value: "90" },
];

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_CONFIG: Record<string, { label: string; color: string; hex: string }> = {
  waiting: { label: "Aguardando", color: "text-yellow-600", hex: "#eab308" },
  pending: { label: "Aguardando", color: "text-yellow-600", hex: "#eab308" },
  open: { label: "Atendendo", color: "text-blue-600", hex: "#3b82f6" },
  attending: { label: "Atendendo", color: "text-blue-600", hex: "#3b82f6" },
  resolved: { label: "Encerradas", color: "text-green-600", hex: "#22c55e" },
  closed: { label: "Encerradas", color: "text-green-600", hex: "#22c55e" },
};

const formatDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const getDateFrom = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days + 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

// ---- Bar Chart ----
interface BarChartProps {
  data: DailyCount[];
  width?: number;
  height?: number;
}

const BarChartSVG = ({ data, width = 600, height = 200 }: BarChartProps) => {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; label: string; value: number } | null>(null);
  const paddingLeft = 36;
  const paddingBottom = 30;
  const paddingTop = 12;
  const paddingRight = 8;
  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingBottom - paddingTop;

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width, height }}>
        <p className="text-muted-foreground text-sm">Sem dados</p>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const barWidth = Math.max(4, chartW / data.length - 4);

  // Y-axis ticks
  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) =>
    Math.round((maxVal * i) / ticks)
  );

  return (
    <div className="relative" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        className="overflow-visible"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Y axis ticks */}
        {tickValues.map((tick) => {
          const y = paddingTop + chartH - (tick / maxVal) * chartH;
          return (
            <g key={tick}>
              <line
                x1={paddingLeft}
                x2={paddingLeft + chartW}
                y1={y}
                y2={y}
                stroke="#e5e7eb"
                strokeWidth={1}
              />
              <text
                x={paddingLeft - 4}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill="#9ca3af"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const barH = (d.count / maxVal) * chartH;
          const x = paddingLeft + (i / data.length) * chartW + (chartW / data.length - barWidth) / 2;
          const y = paddingTop + chartH - barH;

          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barH, 2)}
                fill="#3b82f6"
                rx={3}
                className="hover:fill-blue-400 transition-colors cursor-pointer"
                onMouseEnter={(e) => {
                  const svgRect = (e.currentTarget.closest("svg") as SVGSVGElement).getBoundingClientRect();
                  setTooltip({
                    x: e.clientX - svgRect.left,
                    y: e.clientY - svgRect.top - 32,
                    label: formatDate(d.date),
                    value: d.count,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              />
              {/* X-axis label — show every N labels to avoid clutter */}
              {data.length <= 30 || i % Math.ceil(data.length / 15) === 0 ? (
                <text
                  x={x + barWidth / 2}
                  y={paddingTop + chartH + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fill="#9ca3af"
                >
                  {formatDate(d.date)}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Axes */}
        <line
          x1={paddingLeft}
          x2={paddingLeft}
          y1={paddingTop}
          y2={paddingTop + chartH}
          stroke="#d1d5db"
          strokeWidth={1}
        />
        <line
          x1={paddingLeft}
          x2={paddingLeft + chartW}
          y1={paddingTop + chartH}
          y2={paddingTop + chartH}
          stroke="#d1d5db"
          strokeWidth={1}
        />
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute pointer-events-none bg-gray-900 text-white text-xs rounded px-2 py-1 shadow-lg whitespace-nowrap z-10"
          style={{ left: tooltip.x + 8, top: tooltip.y }}
        >
          <span className="font-semibold">{tooltip.label}</span>: {tooltip.value} conversa
          {tooltip.value !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
};

// ---- Donut Chart ----
interface DonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
}

const DonutChart = ({ data, size = 200 }: DonutChartProps) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = data.reduce((a, b) => a + b.value, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const innerR = size * 0.24;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <p className="text-muted-foreground text-sm">Sem dados</p>
      </div>
    );
  }

  // Build arcs
  let angle = -Math.PI / 2;
  const arcs = data.map((d) => {
    const startAngle = angle;
    const sweep = (d.value / total) * 2 * Math.PI;
    angle += sweep;
    const endAngle = angle;
    return { ...d, startAngle, endAngle, sweep };
  });

  const describeArc = (
    cx: number,
    cy: number,
    r: number,
    ir: number,
    startAngle: number,
    endAngle: number
  ) => {
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + ir * Math.cos(endAngle);
    const iy1 = cy + ir * Math.sin(endAngle);
    const ix2 = cx + ir * Math.cos(startAngle);
    const iy2 = cy + ir * Math.sin(startAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${ir} ${ir} 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
  };

  return (
    <svg width={size} height={size}>
      {arcs.map((arc, i) => (
        <path
          key={i}
          d={describeArc(cx, cy, hovered === i ? r + 6 : r, innerR, arc.startAngle, arc.endAngle)}
          fill={arc.color}
          className="transition-all cursor-pointer"
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
          opacity={hovered !== null && hovered !== i ? 0.6 : 1}
        />
      ))}
      {/* Center text */}
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        fontSize={20}
        fontWeight="bold"
        fill="currentColor"
      >
        {hovered !== null ? data[hovered].value : total}
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        fontSize={10}
        fill="#9ca3af"
      >
        {hovered !== null ? data[hovered].label : "total"}
      </text>
    </svg>
  );
};

// ---- Horizontal Bar Chart ----
interface HBarChartProps {
  data: AgentStat[];
}

const HBarChart = ({ data }: HBarChartProps) => {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <p className="text-muted-foreground text-sm">Sem dados</p>
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => d.total), 1);

  return (
    <div className="space-y-3">
      {data.map((d) => {
        const resolvedPct = d.total > 0 ? Math.round((d.resolved / d.total) * 100) : 0;
        const barPct = (d.total / maxVal) * 100;
        return (
          <div key={d.agent}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium truncate max-w-[160px]" title={d.agent}>
                {d.agent}
              </span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                <span>{d.total} conversas</span>
                <span className="text-green-600 font-medium">{resolvedPct}% resolvidas</span>
              </div>
            </div>
            <div className="h-6 bg-muted rounded-full overflow-hidden flex">
              {/* Total bar */}
              <div
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${barPct}%` }}
              />
            </div>
            {/* Resolved sub-bar */}
            <div className="h-1.5 bg-muted rounded-full mt-0.5 overflow-hidden">
              <div
                className="h-full bg-green-400 rounded-full transition-all"
                style={{ width: `${resolvedPct}%` }}
              />
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-4 pt-1">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-blue-500" />
          <span className="text-xs text-muted-foreground">Total de conversas</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-green-400" />
          <span className="text-xs text-muted-foreground">Taxa de resolução</span>
        </div>
      </div>
    </div>
  );
};

// ---- Heatmap ----
interface HeatmapProps {
  data: HeatmapCell[];
}

const Heatmap = ({ data }: HeatmapProps) => {
  const [tooltip, setTooltip] = useState<{ day: number; hour: number; count: number } | null>(null);
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const cellMap = new Map<string, number>();
  data.forEach((d) => cellMap.set(`${d.day}-${d.hour}`, d.count));

  const getIntensity = (count: number) => {
    if (count === 0) return 0;
    return Math.max(0.08, count / maxCount);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const days = Array.from({ length: 7 }, (_, i) => i);

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-max">
        {/* Hour labels */}
        <div className="flex ml-10 mb-1">
          {hours.map((h) => (
            <div
              key={h}
              className="text-center text-xs text-muted-foreground"
              style={{ width: 24, minWidth: 24 }}
            >
              {h % 4 === 0 ? `${h}h` : ""}
            </div>
          ))}
        </div>

        {/* Rows */}
        {days.map((day) => (
          <div key={day} className="flex items-center mb-1">
            <span className="text-xs text-muted-foreground w-10 shrink-0">
              {DAY_LABELS[day]}
            </span>
            {hours.map((hour) => {
              const count = cellMap.get(`${day}-${hour}`) ?? 0;
              const intensity = getIntensity(count);
              return (
                <div
                  key={hour}
                  className="rounded-sm cursor-pointer relative"
                  style={{
                    width: 22,
                    minWidth: 22,
                    height: 22,
                    marginRight: 2,
                    backgroundColor:
                      intensity === 0
                        ? "var(--muted)"
                        : `rgba(59, 130, 246, ${intensity})`,
                  }}
                  onMouseEnter={() => setTooltip({ day, hour, count })}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </div>
        ))}

        {/* Tooltip */}
        {tooltip && (
          <div className="text-xs text-muted-foreground mt-2">
            {DAY_LABELS[tooltip.day]} às {tooltip.hour}h:{" "}
            <span className="font-semibold text-foreground">{tooltip.count} mensagens</span>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-muted-foreground">Menos</span>
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
            <div
              key={v}
              className="rounded-sm"
              style={{
                width: 16,
                height: 16,
                backgroundColor:
                  v === 0 ? "var(--muted)" : `rgba(59, 130, 246, ${v})`,
              }}
            />
          ))}
          <span className="text-xs text-muted-foreground">Mais</span>
        </div>
      </div>
    </div>
  );
};

// ---- Main Component ----
const Reports = () => {
  const [days, setDays] = useState("30");
  const [filterConnection, setFilterConnection] = useState("all");
  const [filterAgent, setFilterAgent] = useState("all");
  const [loading, setLoading] = useState(true);

  // Data
  const [dailyCounts, setDailyCounts] = useState<DailyCount[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCount[]>([]);
  const [agentStats, setAgentStats] = useState<AgentStat[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapCell[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);

  // Stats
  const [statsTotal, setStatsTotal] = useState(0);
  const [statsResolved, setStatsResolved] = useState(0);
  const [statsTMA, setStatsTMA] = useState(0);
  const [statsCSAT, setStatsCSAT] = useState(0);

  const loadMeta = useCallback(async () => {
    const [connRes, profileRes] = await Promise.all([
      db.from("connections" as never).select("id, name").limit(100),
      db.from("profiles").select("id, full_name").limit(100),
    ]);
    setConnections(((connRes.data as Connection[]) ?? []).filter((c) => c.name));
    setAgents((profileRes.data as Profile[]) ?? []);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const daysNum = parseInt(days, 10);
      const from = getDateFrom(daysNum);

      // Build query base
      let query = db
        .from("conversations" as never)
        .select("id, status, created_at, resolved_at, assigned_to, connection_id, csat_rating")
        .gte("created_at", from)
        .order("created_at", { ascending: true });

      if (filterConnection !== "all") {
        query = query.eq("connection_id" as never, filterConnection);
      }
      if (filterAgent !== "all") {
        query = query.eq("assigned_to" as never, filterAgent);
      }

      const { data: convs, error } = await query;
      if (error) throw error;

      const rows = (convs as Record<string, unknown>[]) ?? [];

      // Stats
      setStatsTotal(rows.length);
      const resolved = rows.filter(
        (r) => r.status === "resolved" || r.status === "closed"
      );
      setStatsResolved(resolved.length);

      // TMA: average resolution time in minutes
      const times = resolved
        .filter((r) => r.resolved_at && r.created_at)
        .map((r) => {
          const diff =
            new Date(r.resolved_at as string).getTime() -
            new Date(r.created_at as string).getTime();
          return diff / 60000;
        });
      setStatsTMA(
        times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0
      );

      // CSAT
      const csatRows = rows.filter((r) => r.csat_rating != null);
      setStatsCSAT(
        csatRows.length > 0
          ? parseFloat(
              (
                csatRows.reduce((a, b) => a + (b.csat_rating as number), 0) / csatRows.length
              ).toFixed(1)
            )
          : 0
      );

      // Daily counts
      const dayMap = new Map<string, number>();
      rows.forEach((r) => {
        const date = (r.created_at as string).slice(0, 10);
        dayMap.set(date, (dayMap.get(date) ?? 0) + 1);
      });
      // Fill all days in range
      const dailyArr: DailyCount[] = [];
      for (let i = daysNum - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dailyArr.push({ date: key, count: dayMap.get(key) ?? 0 });
      }
      setDailyCounts(dailyArr);

      // Status counts
      const statusMap = new Map<string, number>();
      rows.forEach((r) => {
        const s = (r.status as string) ?? "unknown";
        statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
      });
      setStatusCounts(
        Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }))
      );

      // Agent stats
      const agentMap = new Map<string, { total: number; resolved: number }>();
      rows.forEach((r) => {
        const agent = (r.assigned_to as string) ?? "Não atribuído";
        const current = agentMap.get(agent) ?? { total: 0, resolved: 0 };
        current.total++;
        if (r.status === "resolved" || r.status === "closed") current.resolved++;
        agentMap.set(agent, current);
      });
      // Resolve agent names
      const agentStatArr: AgentStat[] = Array.from(agentMap.entries()).map(
        ([agentId, stats]) => {
          const profile = agents.find((a) => a.id === agentId);
          return {
            agent: profile?.full_name ?? agentId ?? "Não atribuído",
            ...stats,
          };
        }
      );
      agentStatArr.sort((a, b) => b.total - a.total);
      setAgentStats(agentStatArr.slice(0, 10));

      // Heatmap: messages per day/hour
      const heatMap = new Map<string, number>();
      rows.forEach((r) => {
        const d = new Date(r.created_at as string);
        const key = `${d.getDay()}-${d.getHours()}`;
        heatMap.set(key, (heatMap.get(key) ?? 0) + 1);
      });
      setHeatmapData(
        Array.from(heatMap.entries()).map(([key, count]) => {
          const [day, hour] = key.split("-").map(Number);
          return { day, hour, count };
        })
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao carregar relatórios");
    } finally {
      setLoading(false);
    }
  }, [days, filterConnection, filterAgent, agents]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Donut data
  const donutData = (() => {
    const grouped: Record<string, number> = {};
    statusCounts.forEach((s) => {
      const cfg = STATUS_CONFIG[s.status];
      const label = cfg?.label ?? s.status;
      grouped[label] = (grouped[label] ?? 0) + s.count;
    });
    const colors: Record<string, string> = {
      Aguardando: "#eab308",
      Atendendo: "#3b82f6",
      Encerradas: "#22c55e",
    };
    return Object.entries(grouped).map(([label, value]) => ({
      label,
      value,
      color: colors[label] ?? "#94a3b8",
    }));
  })();

  const formatTMA = (mins: number) => {
    if (mins < 60) return `${mins}min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h${m > 0 ? `${m}m` : ""}`;
  };

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #reports-printable, #reports-printable * { visibility: visible; }
          #reports-printable { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto" id="reports-printable">
          {/* Header */}
          <div className="flex items-center justify-between mx-6 py-4 border-b border-border gap-3 flex-wrap no-print">
            <div className="flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-blue-600" />
              <h1 className="text-xl font-bold text-blue-600">Relatórios</h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={loadData}
                disabled={loading}
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Atualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                Exportar PDF
              </Button>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Filters */}
            <Card className="p-4 no-print">
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
                <Filter className="h-4 w-4" />
                Filtros
              </div>
              <div className="flex flex-wrap gap-3">
                <Select value={days} onValueChange={setDays}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterConnection} onValueChange={setFilterConnection}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Conexão" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as conexões</SelectItem>
                    {connections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterAgent} onValueChange={setFilterAgent}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Agente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os agentes</SelectItem>
                    {agents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.full_name ?? a.id.slice(0, 8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Card>

            {/* Stats Cards */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <TrendingUp className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total Conversas</p>
                      <p className="text-2xl font-bold">{statsTotal}</p>
                    </div>
                  </Card>
                  <Card className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Resolvidas</p>
                      <p className="text-2xl font-bold">{statsResolved}</p>
                    </div>
                  </Card>
                  <Card className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                      <Clock className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">TMA</p>
                      <p className="text-2xl font-bold">{formatTMA(statsTMA)}</p>
                    </div>
                  </Card>
                  <Card className="p-4 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
                      <Star className="h-5 w-5 text-yellow-500" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">CSAT Médio</p>
                      <p className="text-2xl font-bold">
                        {statsCSAT > 0 ? `${statsCSAT}/5` : "—"}
                      </p>
                    </div>
                  </Card>
                </div>

                {/* Chart 1: Conversas por Dia */}
                <Card className="p-5">
                  <h2 className="text-base font-semibold mb-4">Conversas por Dia</h2>
                  <div className="overflow-x-auto">
                    <BarChartSVG data={dailyCounts} width={640} height={200} />
                  </div>
                </Card>

                {/* Chart 2: Distribuição por Status */}
                <Card className="p-5">
                  <h2 className="text-base font-semibold mb-4">Distribuição por Status</h2>
                  <div className="flex items-center gap-8 flex-wrap">
                    <DonutChart data={donutData} size={200} />
                    <div className="space-y-3">
                      {donutData.map((d) => (
                        <div key={d.label} className="flex items-center gap-3">
                          <div
                            className="h-3 w-3 rounded-full shrink-0"
                            style={{ backgroundColor: d.color }}
                          />
                          <span className="text-sm text-muted-foreground w-24">{d.label}</span>
                          <span className="text-sm font-semibold">{d.value}</span>
                          <span className="text-xs text-muted-foreground">
                            ({statsTotal > 0 ? Math.round((d.value / statsTotal) * 100) : 0}%)
                          </span>
                        </div>
                      ))}
                      {donutData.length === 0 && (
                        <p className="text-sm text-muted-foreground">Sem dados</p>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Chart 3: Performance por Agente */}
                <Card className="p-5">
                  <h2 className="text-base font-semibold mb-4">Performance por Agente</h2>
                  <HBarChart data={agentStats} />
                </Card>

                {/* Chart 4: Horário de Pico */}
                <Card className="p-5">
                  <h2 className="text-base font-semibold mb-4">Horário de Pico</h2>
                  <Heatmap data={heatmapData} />
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Reports;
