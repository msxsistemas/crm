import { useState, useEffect, Fragment } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Flame } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const PRIORITY_LABELS: Record<string, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

function getHeatColor(count: number, maxCount: number): string {
  if (count === 0) return "#f3f4f6";
  const intensity = count / maxCount;
  if (intensity < 0.25) return "#bbf7d0";
  if (intensity < 0.5) return "#4ade80";
  if (intensity < 0.75) return "#16a34a";
  return "#14532d";
}

function getTextColor(count: number, maxCount: number): string {
  if (count === 0) return "#9ca3af";
  const intensity = count / maxCount;
  if (intensity < 0.5) return "#166534";
  return "#f0fdf4";
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface HeatmapRow {
  dow: number;
  hour: number;
  count: number;
}

interface PeakRow {
  hour: number;
  count: number;
}

export default function HeatmapReport() {
  const defaultEnd = formatDate(new Date());
  const defaultStart = formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [loading, setLoading] = useState(false);
  const [grid, setGrid] = useState<number[][]>(
    Array.from({ length: 7 }, () => new Array(24).fill(0))
  );
  const [peaks, setPeaks] = useState<PeakRow[]>([]);
  const [tooltip, setTooltip] = useState<{ dow: number; hour: number; count: number } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await api.get<{ heatmap: HeatmapRow[]; peaks: PeakRow[] }>(
        `/stats/heatmap?start=${start}T00:00:00Z&end=${end}T23:59:59Z`
      );
      const newGrid = Array.from({ length: 7 }, () => new Array(24).fill(0));
      for (const row of data.heatmap || []) {
        const d = Math.round(Number(row.dow));
        const h = Math.round(Number(row.hour));
        if (d >= 0 && d <= 6 && h >= 0 && h <= 23) {
          newGrid[d][h] = Number(row.count);
        }
      }
      setGrid(newGrid);
      setPeaks(
        (data.peaks || []).map((p) => ({ hour: Math.round(Number(p.hour)), count: Number(p.count) }))
      );
    } catch {
      toast.error("Erro ao carregar dados do heatmap");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxCount = Math.max(1, ...grid.flat());
  const totalMessages = grid.flat().reduce((a, b) => a + b, 0);

  // Find peak day
  const dayTotals = grid.map((row) => row.reduce((a, b) => a + b, 0));
  const peakDayIdx = dayTotals.indexOf(Math.max(...dayTotals));

  // Find peak hour from grid
  const hourTotals = Array.from({ length: 24 }, (_, h) =>
    grid.reduce((sum, dayRow) => sum + dayRow[h], 0)
  );
  const peakHourIdx = hourTotals.indexOf(Math.max(...hourTotals));

  const peakBarMax = peaks.length > 0 ? Math.max(...peaks.map((p) => p.count)) : 1;

  return (
    <div className="p-6 space-y-6 max-w-full">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
          <Flame className="h-5 w-5 text-green-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Mapa de Calor de Volume</h1>
          <p className="text-muted-foreground text-sm">
            Visualize os horários e dias com mais mensagens recebidas
          </p>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data inicial</label>
            <Input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Data final</label>
            <Input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={fetchData} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Aplicar
          </Button>
        </div>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{totalMessages.toLocaleString("pt-BR")}</div>
          <div className="text-sm text-muted-foreground">Total de mensagens no período</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{peakHourIdx}h</div>
          <div className="text-sm text-muted-foreground">Hora mais movimentada</div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{DAY_LABELS[peakDayIdx]}</div>
          <div className="text-sm text-muted-foreground">Dia mais movimentado</div>
        </Card>
      </div>

      {/* Heatmap grid */}
      <Card className="p-4 overflow-x-auto">
        <h2 className="font-semibold mb-4">Heatmap — mensagens por hora × dia da semana</h2>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="relative">
            {/* Tooltip */}
            {tooltip && (
              <div className="absolute z-10 bg-gray-900 text-white text-xs rounded px-2 py-1 pointer-events-none"
                style={{ top: -30, left: "50%", transform: "translateX(-50%)" }}>
                {DAY_LABELS[tooltip.dow]} {String(tooltip.hour).padStart(2, "0")}h: {tooltip.count} msg
              </div>
            )}
            <div
              className="grid"
              style={{
                gridTemplateColumns: `56px repeat(24, minmax(28px, 1fr))`,
                gap: "2px",
              }}
            >
              {/* Header row */}
              <div />
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="text-center text-xs text-muted-foreground font-mono">
                  {h % 3 === 0 ? `${String(h).padStart(2, "0")}h` : ""}
                </div>
              ))}

              {/* Data rows */}
              {DAY_LABELS.map((dayLabel, dayIdx) => (
                <Fragment key={dayIdx}>
                  <div className="text-xs font-medium text-muted-foreground flex items-center pr-2 justify-end">
                    {dayLabel}
                  </div>
                  {Array.from({ length: 24 }, (_, h) => {
                    const count = grid[dayIdx][h];
                    return (
                      <div
                        key={`${dayIdx}-${h}`}
                        className="rounded cursor-default transition-all hover:ring-2 hover:ring-green-500"
                        style={{
                          backgroundColor: getHeatColor(count, maxCount),
                          color: getTextColor(count, maxCount),
                          minHeight: 28,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "9px",
                          fontWeight: 600,
                        }}
                        title={`${dayLabel} ${String(h).padStart(2, "0")}h: ${count} mensagens`}
                        onMouseEnter={() => setTooltip({ dow: dayIdx, hour: h, count })}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {count > 0 ? count : ""}
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground">
              <span>Menos</span>
              {["#f3f4f6", "#bbf7d0", "#4ade80", "#16a34a", "#14532d"].map((c) => (
                <div key={c} className="w-5 h-5 rounded" style={{ backgroundColor: c, border: "1px solid #e5e7eb" }} />
              ))}
              <span>Mais</span>
            </div>
          </div>
        )}
      </Card>

      {/* Peak hours */}
      {peaks.length > 0 && (
        <Card className="p-4">
          <h2 className="font-semibold mb-4">Horários de Pico (Top 5)</h2>
          <div className="space-y-3">
            {peaks.map((p, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-12 text-sm font-medium text-right">{String(p.hour).padStart(2, "0")}h</div>
                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-5 rounded-full bg-green-500 transition-all"
                    style={{ width: `${(p.count / peakBarMax) * 100}%` }}
                  />
                </div>
                <div className="w-16 text-sm text-right text-muted-foreground">
                  {Number(p.count).toLocaleString("pt-BR")} msg
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
