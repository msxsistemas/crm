import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart2,
  Plus,
  Trash2,
  FolderOpen,
  FileText,
  RefreshCw,
  Printer,
  X,
} from "lucide-react";

// ─────────────────────────────── Types ───────────────────────────────

interface ReportMetric {
  id: string;
  name: string;
  description: string;
  category: "conversations" | "messages" | "agents" | "contacts" | "financial";
  type: "count" | "sum" | "average" | "percentage" | "list";
  query: string;
}

interface ReportLayout {
  kpis: string[];
  charts: string[];
  tables: string[];
}

interface SavedReport {
  id: string;
  name: string;
  layout: ReportLayout;
  created_by: string | null;
  created_at: string;
}

interface MetricResult {
  metricId: string;
  value: number | string | Array<Record<string, unknown>>;
}

// ─────────────────────────────── Constants ───────────────────────────

const AVAILABLE_METRICS: ReportMetric[] = [
  {
    id: "total_conversations",
    name: "Total de Conversas",
    description: "Contagem total de conversas no período",
    category: "conversations",
    type: "count",
    query: "count from conversations",
  },
  {
    id: "open_conversations",
    name: "Conversas Abertas",
    description: "Conversas com status aberto",
    category: "conversations",
    type: "count",
    query: "count from conversations where status=open",
  },
  {
    id: "avg_response_time",
    name: "Tempo Médio de Resposta",
    description: "Tempo médio entre mensagens",
    category: "conversations",
    type: "average",
    query: "avg response time",
  },
  {
    id: "csat_average",
    name: "CSAT Médio",
    description: "Nota média das avaliações",
    category: "conversations",
    type: "average",
    query: "avg rating from reviews",
  },
  {
    id: "conversations_by_day",
    name: "Conversas por Dia",
    description: "Conversas agrupadas por data",
    category: "conversations",
    type: "list",
    query: "count conversations grouped by date",
  },
  {
    id: "total_messages",
    name: "Total de Mensagens",
    description: "Contagem total de mensagens",
    category: "messages",
    type: "count",
    query: "count from messages",
  },
  {
    id: "inbound_messages",
    name: "Mensagens Recebidas",
    description: "Mensagens recebidas (inbound)",
    category: "messages",
    type: "count",
    query: "count from messages where direction=inbound",
  },
  {
    id: "agent_performance",
    name: "Performance por Agente",
    description: "Conversas por agente",
    category: "agents",
    type: "list",
    query: "conversations per agent",
  },
  {
    id: "new_contacts",
    name: "Novos Contatos",
    description: "Contatos criados no período",
    category: "contacts",
    type: "count",
    query: "count from contacts in period",
  },
  {
    id: "top_contacts",
    name: "Top Contatos",
    description: "Contatos por volume de mensagens",
    category: "contacts",
    type: "list",
    query: "contacts by message count",
  },
  {
    id: "total_revenue",
    name: "Receita Total",
    description: "Soma de oportunidades ganhas",
    category: "financial",
    type: "sum",
    query: "sum opportunities.value where stage=won",
  },
  {
    id: "conversion_rate",
    name: "Taxa de Conversão",
    description: "Oportunidades ganhas / total",
    category: "financial",
    type: "percentage",
    query: "won/total opportunities",
  },
];

const CATEGORY_LABELS: Record<string, string> = {
  conversations: "Conversas",
  messages: "Mensagens",
  agents: "Agentes",
  contacts: "Contatos",
  financial: "Financeiro",
};

const CATEGORY_COLORS: Record<string, string> = {
  conversations: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  messages: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  agents: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  contacts: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  financial: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
};

const PERIOD_OPTIONS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Último ano" },
];

// ─────────────────────────────── Data fetcher ────────────────────────

async function fetchMetricData(
  metric: ReportMetric,
  periodDays: number
): Promise<MetricResult> {
  const since = new Date();
  since.setDate(since.getDate() - periodDays);
  const sinceISO = since.toISOString();

  try {
    switch (metric.id) {
      case "total_conversations": {
        const { count } = await supabase
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .gte("created_at", sinceISO);
        return { metricId: metric.id, value: count ?? 0 };
      }
      case "open_conversations": {
        const { count } = await supabase
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .eq("status", "open");
        return { metricId: metric.id, value: count ?? 0 };
      }
      case "total_messages": {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .gte("created_at", sinceISO);
        return { metricId: metric.id, value: count ?? 0 };
      }
      case "inbound_messages": {
        const { count } = await supabase
          .from("messages")
          .select("*", { count: "exact", head: true })
          .eq("from_me", false)
          .gte("created_at", sinceISO);
        return { metricId: metric.id, value: count ?? 0 };
      }
      case "new_contacts": {
        const { count } = await supabase
          .from("contacts")
          .select("*", { count: "exact", head: true })
          .gte("created_at", sinceISO);
        return { metricId: metric.id, value: count ?? 0 };
      }
      case "total_revenue": {
        const { data } = await supabase
          .from("opportunities")
          .select("value")
          .eq("stage", "won")
          .gte("created_at", sinceISO);
        const sum = (data ?? []).reduce(
          (acc, o) => acc + (typeof o.value === "number" ? o.value : 0),
          0
        );
        return { metricId: metric.id, value: sum };
      }
      case "conversion_rate": {
        const { count: total } = await supabase
          .from("opportunities")
          .select("*", { count: "exact", head: true })
          .gte("created_at", sinceISO);
        const { count: won } = await supabase
          .from("opportunities")
          .select("*", { count: "exact", head: true })
          .eq("stage", "won")
          .gte("created_at", sinceISO);
        const rate =
          total && total > 0
            ? Math.round(((won ?? 0) / total) * 100)
            : 0;
        return { metricId: metric.id, value: rate };
      }
      case "avg_response_time": {
        return { metricId: metric.id, value: "N/A" };
      }
      case "csat_average": {
        const { data } = await supabase
          .from("reviews")
          .select("rating")
          .gte("created_at", sinceISO);
        if (!data?.length) return { metricId: metric.id, value: 0 };
        const avg =
          data.reduce((acc, r) => acc + (r.rating ?? 0), 0) / data.length;
        return { metricId: metric.id, value: Math.round(avg * 10) / 10 };
      }
      case "agent_performance": {
        const { data } = await supabase
          .from("conversations")
          .select("assigned_to, profiles(name)")
          .gte("created_at", sinceISO)
          .not("assigned_to", "is", null);
        const counts: Record<string, { name: string; count: number }> = {};
        (data ?? []).forEach((c: Record<string, unknown>) => {
          const id = c.assigned_to as string;
          const profileData = c.profiles as { name?: string } | null;
          const name =
            (profileData && profileData.name) ? profileData.name : id;
          if (!counts[id]) counts[id] = { name, count: 0 };
          counts[id].count++;
        });
        const list = Object.values(counts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        return { metricId: metric.id, value: list as unknown as Array<Record<string, unknown>> };
      }
      case "top_contacts": {
        const { data } = await supabase
          .from("messages")
          .select("conversation_id, conversations(contact_id, contacts(name, phone))")
          .eq("from_me", false)
          .gte("created_at", sinceISO);
        const counts: Record<string, { name: string; count: number }> = {};
        (data ?? []).forEach((m: Record<string, unknown>) => {
          const convData = m.conversations as { contact_id?: string; contacts?: { name?: string; phone?: string } } | null;
          const cid = convData?.contact_id;
          if (!cid) return;
          const contactData = convData?.contacts;
          const name = contactData?.name || contactData?.phone || cid;
          if (!counts[cid]) counts[cid] = { name, count: 0 };
          counts[cid].count++;
        });
        const list = Object.values(counts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        return { metricId: metric.id, value: list as unknown as Array<Record<string, unknown>> };
      }
      case "conversations_by_day": {
        const { data } = await supabase
          .from("conversations")
          .select("created_at")
          .gte("created_at", sinceISO);
        const counts: Record<string, number> = {};
        (data ?? []).forEach((c) => {
          const day = (c.created_at as string).split("T")[0];
          counts[day] = (counts[day] || 0) + 1;
        });
        const list = Object.entries(counts)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, count]) => ({ date, count }));
        return { metricId: metric.id, value: list as unknown as Array<Record<string, unknown>> };
      }
      default:
        return { metricId: metric.id, value: 0 };
    }
  } catch {
    return { metricId: metric.id, value: 0 };
  }
}

// ─────────────────────────────── Sub-components ──────────────────────

function MetricCard({
  metric,
  dragging,
  onDragStart,
}: {
  metric: ReportMetric;
  dragging: boolean;
  onDragStart: (id: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(metric.id)}
      className={`cursor-grab active:cursor-grabbing rounded-lg border p-3 bg-card hover:shadow-md transition-shadow select-none ${
        dragging ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight">{metric.name}</span>
        <Badge
          className={`text-[10px] shrink-0 px-1.5 py-0 ${
            CATEGORY_COLORS[metric.category]
          }`}
        >
          {metric.type}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
    </div>
  );
}

function KPICard({
  metric,
  result,
  onRemove,
}: {
  metric: ReportMetric;
  result: MetricResult | undefined;
  onRemove: () => void;
}) {
  const displayValue = () => {
    if (!result) return "—";
    if (typeof result.value === "number") {
      if (metric.type === "percentage") return `${result.value}%`;
      if (metric.id === "total_revenue")
        return new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(result.value);
      return result.value.toLocaleString("pt-BR");
    }
    return String(result.value);
  };

  return (
    <div className="relative rounded-xl border bg-card p-4 shadow-sm group">
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
        {metric.name}
      </p>
      <p className="text-3xl font-bold mt-1">{displayValue()}</p>
    </div>
  );
}

function SimpleBarChart({
  data,
  labelKey,
  valueKey,
}: {
  data: Array<Record<string, unknown>>;
  labelKey: string;
  valueKey: string;
}) {
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div className="space-y-1.5">
      {data.map((item, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate text-right text-muted-foreground">
            {String(item[labelKey] ?? "")}
          </span>
          <div className="flex-1 h-5 bg-muted rounded-sm overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-sm transition-all"
              style={{ width: `${(Number(item[valueKey]) / max) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right font-medium">
            {String(item[valueKey] ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ChartSlot({
  metric,
  result,
  onRemove,
}: {
  metric: ReportMetric;
  result: MetricResult | undefined;
  onRemove: () => void;
}) {
  const data = Array.isArray(result?.value)
    ? (result.value as Array<Record<string, unknown>>)
    : [];

  const labelKey =
    metric.id === "conversations_by_day" ? "date" : "name";
  const valueKey =
    metric.id === "conversations_by_day" ? "count" : "count";

  return (
    <div className="relative rounded-xl border bg-card p-4 shadow-sm group">
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="text-sm font-semibold mb-3">{metric.name}</p>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados para exibir.</p>
      ) : (
        <SimpleBarChart data={data} labelKey={labelKey} valueKey={valueKey} />
      )}
    </div>
  );
}

function TableSlot({
  metric,
  result,
  onRemove,
}: {
  metric: ReportMetric;
  result: MetricResult | undefined;
  onRemove: () => void;
}) {
  const data = Array.isArray(result?.value)
    ? (result.value as Array<Record<string, unknown>>)
    : [];

  const columns =
    data.length > 0 ? Object.keys(data[0]) : [];

  return (
    <div className="relative rounded-xl border bg-card p-4 shadow-sm group">
      <button
        onClick={onRemove}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <p className="text-sm font-semibold mb-3">{metric.name}</p>
      {data.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem dados para exibir.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col}
                    className="text-left font-semibold py-1.5 px-2 border-b capitalize"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-accent/30">
                  {columns.map((col) => (
                    <td key={col} className="py-1.5 px-2">
                      {String(row[col] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DropZone({
  label,
  accepts,
  max,
  children,
  onDrop,
  hasSpace,
}: {
  label: string;
  accepts: string;
  max: number;
  children: React.ReactNode;
  onDrop: (e: React.DragEvent) => void;
  hasSpace: boolean;
}) {
  const [over, setOver] = useState(false);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Badge variant="outline" className="text-[10px]">
          {accepts} · máx {max}
        </Badge>
      </div>
      <div
        onDragOver={(e) => {
          if (hasSpace) {
            e.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          setOver(false);
          if (hasSpace) onDrop(e);
        }}
        className={`min-h-[80px] rounded-xl border-2 border-dashed p-2 transition-colors ${
          over && hasSpace
            ? "border-blue-400 bg-blue-50 dark:bg-blue-950"
            : hasSpace
            ? "border-border hover:border-blue-300"
            : "border-border opacity-50"
        }`}
      >
        {children}
        {hasSpace && (
          <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
            Arraste uma métrica aqui
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────── Main page ───────────────────────────

export default function CustomReports() {
  const [activeTab, setActiveTab] = useState<"builder" | "saved">("builder");
  const [draggedMetric, setDraggedMetric] = useState<string | null>(null);
  const [reportLayout, setReportLayout] = useState<ReportLayout>({
    kpis: [],
    charts: [],
    tables: [],
  });
  const [reportName, setReportName] = useState("Meu Relatório");
  const [period, setPeriod] = useState("30");
  const [results, setResults] = useState<MetricResult[]>([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);

  const loadSavedReports = useCallback(async () => {
    setLoadingSaved(true);
    const { data } = await supabase
      .from("custom_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setSavedReports(data as SavedReport[]);
    setLoadingSaved(false);
  }, []);

  useEffect(() => {
    loadSavedReports();
  }, [loadSavedReports]);

  // Group metrics by category
  const metricsByCategory = AVAILABLE_METRICS.reduce<
    Record<string, ReportMetric[]>
  >((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {});

  const allSelectedIds = [
    ...reportLayout.kpis,
    ...reportLayout.charts,
    ...reportLayout.tables,
  ];

  const getMetric = (id: string) =>
    AVAILABLE_METRICS.find((m) => m.id === id);

  const handleDrop = (
    zone: keyof ReportLayout,
    max: number,
    _e: React.DragEvent
  ) => {
    if (!draggedMetric) return;
    if (allSelectedIds.includes(draggedMetric)) {
      toast.warning("Métrica já adicionada ao relatório.");
      return;
    }
    const metric = getMetric(draggedMetric);
    if (!metric) return;

    // Validate type compatibility
    const isKpiCompatible =
      zone === "kpis" &&
      ["count", "sum", "average", "percentage"].includes(metric.type);
    const isListCompatible =
      (zone === "charts" || zone === "tables") && metric.type === "list";

    if (!isKpiCompatible && !isListCompatible) {
      toast.warning(
        zone === "kpis"
          ? "Esta zona aceita apenas métricas de contagem, soma, média ou porcentagem."
          : "Esta zona aceita apenas métricas do tipo lista."
      );
      return;
    }

    setReportLayout((prev) => {
      const current = prev[zone];
      if (current.length >= max) return prev;
      return { ...prev, [zone]: [...current, draggedMetric] };
    });
    setDraggedMetric(null);
  };

  const removeFromZone = (zone: keyof ReportLayout, id: string) => {
    setReportLayout((prev) => ({
      ...prev,
      [zone]: prev[zone].filter((x) => x !== id),
    }));
    setResults((prev) => prev.filter((r) => r.metricId !== id));
  };

  const handleGenerate = async () => {
    if (allSelectedIds.length === 0) {
      toast.warning("Adicione ao menos uma métrica ao relatório.");
      return;
    }
    setGenerating(true);
    setResults([]);
    const periodDays = parseInt(period);
    const metrics = allSelectedIds
      .map((id) => getMetric(id))
      .filter((m): m is ReportMetric => !!m);

    const fetched = await Promise.all(
      metrics.map((m) => fetchMetricData(m, periodDays))
    );
    setResults(fetched);
    setGenerating(false);
    toast.success("Relatório gerado!");
  };

  const handleSave = async () => {
    if (!reportName.trim()) {
      toast.warning("Insira um nome para o relatório.");
      return;
    }
    if (allSelectedIds.length === 0) {
      toast.warning("Adicione ao menos uma métrica.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("custom_reports").insert({
      name: reportName,
      layout: reportLayout,
    });
    if (error) {
      toast.error("Erro ao salvar relatório.");
    } else {
      toast.success("Relatório salvo!");
      await loadSavedReports();
    }
    setSaving(false);
  };

  const handleOpenSaved = (report: SavedReport) => {
    setReportName(report.name);
    setReportLayout(report.layout as ReportLayout);
    setResults([]);
    setActiveTab("builder");
    toast.success("Layout carregado. Clique em 'Gerar relatório'.");
  };

  const handleDeleteSaved = async (id: string) => {
    if (!window.confirm("Excluir este relatório?")) return;
    await supabase.from("custom_reports").delete().eq("id", id);
    setSavedReports((prev) => prev.filter((r) => r.id !== id));
    toast.success("Relatório excluído.");
  };

  const getResult = (id: string) => results.find((r) => r.metricId === id);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <BarChart2 className="h-6 w-6 text-blue-600" />
          <h1 className="text-xl font-bold">Builder de Relatórios</h1>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <button
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "builder"
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("builder")}
          >
            <Plus className="h-4 w-4 inline mr-1.5" />
            Novo Relatório
          </button>
          <button
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "saved"
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setActiveTab("saved");
              loadSavedReports();
            }}
          >
            <FolderOpen className="h-4 w-4 inline mr-1.5" />
            Meus Relatórios
          </button>
        </div>
      </div>

      {/* Builder tab */}
      {activeTab === "builder" && (
        <div className="flex flex-1 overflow-hidden">
          {/* Left: metric library */}
          <aside className="w-[280px] shrink-0 border-r overflow-y-auto p-3 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">
              Biblioteca de Métricas
            </p>
            {Object.entries(metricsByCategory).map(([category, metrics]) => (
              <div key={category}>
                <p className="text-xs font-medium text-muted-foreground mb-1.5 px-1">
                  {CATEGORY_LABELS[category]}
                </p>
                <div className="space-y-1.5">
                  {metrics.map((m) => (
                    <MetricCard
                      key={m.id}
                      metric={m}
                      dragging={draggedMetric === m.id}
                      onDragStart={setDraggedMetric}
                    />
                  ))}
                </div>
              </div>
            ))}
          </aside>

          {/* Center: canvas */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Row 1: KPIs */}
            <DropZone
              label="KPIs"
              accepts="count / sum / average / percentage"
              max={4}
              hasSpace={reportLayout.kpis.length < 4}
              onDrop={(e) => handleDrop("kpis", 4, e)}
            >
              {reportLayout.kpis.length > 0 && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-2">
                  {reportLayout.kpis.map((id) => {
                    const m = getMetric(id);
                    if (!m) return null;
                    return (
                      <KPICard
                        key={id}
                        metric={m}
                        result={getResult(id)}
                        onRemove={() => removeFromZone("kpis", id)}
                      />
                    );
                  })}
                </div>
              )}
            </DropZone>

            {/* Row 2: Charts */}
            <DropZone
              label="Gráficos"
              accepts="lista"
              max={2}
              hasSpace={reportLayout.charts.length < 2}
              onDrop={(e) => handleDrop("charts", 2, e)}
            >
              {reportLayout.charts.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                  {reportLayout.charts.map((id) => {
                    const m = getMetric(id);
                    if (!m) return null;
                    return (
                      <ChartSlot
                        key={id}
                        metric={m}
                        result={getResult(id)}
                        onRemove={() => removeFromZone("charts", id)}
                      />
                    );
                  })}
                </div>
              )}
            </DropZone>

            {/* Row 3: Tables */}
            <DropZone
              label="Tabelas"
              accepts="lista"
              max={1}
              hasSpace={reportLayout.tables.length < 1}
              onDrop={(e) => handleDrop("tables", 1, e)}
            >
              {reportLayout.tables.length > 0 && (
                <div className="mb-2">
                  {reportLayout.tables.map((id) => {
                    const m = getMetric(id);
                    if (!m) return null;
                    return (
                      <TableSlot
                        key={id}
                        metric={m}
                        result={getResult(id)}
                        onRemove={() => removeFromZone("tables", id)}
                      />
                    );
                  })}
                </div>
              )}
            </DropZone>
          </div>

          {/* Right: settings */}
          <aside className="w-[240px] shrink-0 border-l p-4 space-y-5 overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Configurações
              </Label>
              <div className="space-y-1.5">
                <Label htmlFor="report-name" className="text-sm">
                  Nome do relatório
                </Label>
                <Input
                  id="report-name"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  placeholder="Meu Relatório"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Período</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Button
                className="w-full"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Gerando...
                  </>
                ) : (
                  <>
                    <BarChart2 className="h-4 w-4 mr-2" />
                    Gerar relatório
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleSave}
                disabled={saving}
              >
                <FileText className="h-4 w-4 mr-2" />
                {saving ? "Salvando..." : "Salvar relatório"}
              </Button>
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Como usar:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Arraste métricas para as zonas</li>
                <li>Selecione o período</li>
                <li>Clique em "Gerar relatório"</li>
                <li>Salve para reutilizar</li>
              </ol>
            </div>
          </aside>
        </div>
      )}

      {/* Saved reports tab */}
      {activeTab === "saved" && (
        <div className="flex-1 overflow-y-auto p-6">
          {loadingSaved ? (
            <div className="flex justify-center py-16">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : savedReports.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
              <FileText className="h-12 w-12 opacity-20" />
              <p className="text-sm">Nenhum relatório salvo ainda.</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("builder")}
              >
                Criar primeiro relatório
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {savedReports.map((report) => {
                const layout = report.layout as ReportLayout;
                const metricCount =
                  (layout.kpis?.length ?? 0) +
                  (layout.charts?.length ?? 0) +
                  (layout.tables?.length ?? 0);
                return (
                  <div
                    key={report.id}
                    className="rounded-xl border bg-card p-4 shadow-sm space-y-3"
                  >
                    <div>
                      <h3 className="font-semibold">{report.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {metricCount} métrica{metricCount !== 1 ? "s" : ""} ·{" "}
                        {new Date(report.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {layout.kpis?.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {layout.kpis.length} KPI
                        </Badge>
                      )}
                      {layout.charts?.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {layout.charts.length} gráfico
                        </Badge>
                      )}
                      {layout.tables?.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {layout.tables.length} tabela
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => handleOpenSaved(report)}
                      >
                        <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                        Abrir
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.print()}
                        title="Exportar PDF"
                      >
                        <Printer className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDeleteSaved(report.id)}
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
