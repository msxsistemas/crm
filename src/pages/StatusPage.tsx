import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, Clock, Database, Server, HardDrive, Smartphone } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ServiceCheck {
  status: "operational" | "degraded" | "down" | "unknown";
  latency?: number;
  error?: string;
  connected?: number;
  total?: number;
}

interface StatusData {
  status: "operational" | "partial_outage" | "major_outage";
  timestamp: string;
  uptime: number;
  services: {
    postgres: ServiceCheck;
    redis: ServiceCheck;
    minio: ServiceCheck;
    whatsapp: ServiceCheck;
  };
}

const API_BASE = import.meta.env.VITE_API_URL || "/api";

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}min`);
  return parts.join(" ");
}

function StatusBadge({ status }: { status: ServiceCheck["status"] }) {
  if (status === "operational") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Operacional
      </span>
    );
  }
  if (status === "degraded") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold">
        <AlertTriangle className="h-3.5 w-3.5" />
        Degradado
      </span>
    );
  }
  if (status === "down") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
        <XCircle className="h-3.5 w-3.5" />
        Fora do Ar
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-semibold">
      <Clock className="h-3.5 w-3.5" />
      Desconhecido
    </span>
  );
}

const SERVICE_META = {
  postgres: { label: "PostgreSQL", description: "Banco de dados principal", Icon: Database },
  redis: { label: "Redis", description: "Cache e filas", Icon: Server },
  minio: { label: "MinIO (Arquivos)", description: "Armazenamento de arquivos e mídias", Icon: HardDrive },
  whatsapp: { label: "WhatsApp", description: "Conexões de WhatsApp ativas", Icon: Smartphone },
} as const;

export default function StatusPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/status`);
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const overallStatus = data?.status;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-3xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">MSX CRM — Status do Sistema</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Monitoramento em tempo real dos serviços
            </p>
          </div>
          <button
            onClick={fetchStatus}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Overall Status Banner */}
        {loading && !data ? (
          <div className="rounded-xl bg-gray-100 dark:bg-gray-800 p-5 animate-pulse h-20" />
        ) : (
          <div
            className={`rounded-xl p-5 flex items-center gap-4 ${
              overallStatus === "operational"
                ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                : overallStatus === "partial_outage"
                ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
            }`}
          >
            {overallStatus === "operational" && <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />}
            {overallStatus === "partial_outage" && <AlertTriangle className="h-8 w-8 text-yellow-600 shrink-0" />}
            {overallStatus === "major_outage" && <XCircle className="h-8 w-8 text-red-600 shrink-0" />}
            <div>
              <p
                className={`text-lg font-bold ${
                  overallStatus === "operational"
                    ? "text-green-700 dark:text-green-400"
                    : overallStatus === "partial_outage"
                    ? "text-yellow-700 dark:text-yellow-400"
                    : "text-red-700 dark:text-red-400"
                }`}
              >
                {overallStatus === "operational"
                  ? "Todos os sistemas operacionais"
                  : overallStatus === "partial_outage"
                  ? "Degradação parcial"
                  : "Falha crítica"}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {lastUpdated
                  ? `Última atualização: ${format(lastUpdated, "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}`
                  : "Verificando..."}
              </p>
            </div>
            {data && (
              <div className="ml-auto text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">Uptime</p>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {formatUptime(data.uptime)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Service Cards */}
        <div className="grid gap-4">
          {(Object.keys(SERVICE_META) as (keyof typeof SERVICE_META)[]).map((key) => {
            const meta = SERVICE_META[key];
            const service = data?.services?.[key];
            const { Icon } = meta;

            return (
              <div
                key={key}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-4"
              >
                <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white">{meta.label}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{meta.description}</p>
                  {key === "whatsapp" && service && service.status !== "unknown" && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {service.connected ?? 0} / {service.total ?? 0} conexões ativas
                    </p>
                  )}
                  {service?.error && (
                    <p className="text-xs text-red-500 mt-0.5 truncate">{service.error}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {loading && !data ? (
                    <div className="h-6 w-24 bg-gray-100 dark:bg-gray-700 rounded-full animate-pulse" />
                  ) : (
                    <StatusBadge status={service?.status ?? "unknown"} />
                  )}
                  {service?.latency !== undefined && (
                    <p className="text-xs text-gray-400">{service.latency}ms</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 pb-4">
          Atualização automática a cada 30 segundos
        </p>
      </div>
    </div>
  );
}
