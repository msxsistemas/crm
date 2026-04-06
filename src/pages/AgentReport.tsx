import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { FileText, Printer } from "lucide-react";

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

interface AgentReportData {
  full_name: string | null;
  closed_count: number;
  avg_csat: number | null;
  messages_sent: number;
  avg_response_min: number | null;
}

export default function AgentReport() {
  const [agents, setAgents] = useState<Profile[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportData, setReportData] = useState<AgentReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  useEffect(() => {
    api.get<Profile[]>("/users").then((data) => {
      setAgents(data || []);
    }).catch(() => setAgents([]));
  }, []);

  async function handleGenerate() {
    if (!selectedAgent) return;
    setLoading(true);
    setGenerated(false);
    try {
      const data = await api.get<AgentReportData>(
        `/stats/agent-report-pdf?agent_id=${selectedAgent}&start=${startDate}&end=${endDate}`
      );
      setReportData(data);
      setGenerated(true);
    } catch {
      setReportData(null);
    } finally {
      setLoading(false);
    }
  }

  const selectedAgentName = agents.find((a) => a.id === selectedAgent)?.full_name
    || agents.find((a) => a.id === selectedAgent)?.email
    || "Agente";

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-card {
            box-shadow: none !important;
            border: 1px solid #e5e7eb !important;
          }
          body { background: white !important; }
          .print-container { padding: 0 !important; }
        }
      `}</style>

      <div className="p-6 max-w-3xl mx-auto print-container">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 no-print">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Relatório por Agente</h1>
            <p className="text-sm text-muted-foreground">Gere um relatório de desempenho individual</p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-card border border-border rounded-xl p-5 mb-6 no-print">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Agente</label>
              <select
                className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
              >
                <option value="">Selecionar agente...</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.full_name || a.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Data Início</label>
              <input
                type="date"
                className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Data Fim</label>
              <input
                type="date"
                className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <Button
            className="mt-4 flex items-center gap-2"
            onClick={handleGenerate}
            disabled={loading || !selectedAgent}
          >
            {loading ? "Gerando..." : "Gerar Relatório"}
          </Button>
        </div>

        {/* Report Card */}
        {generated && reportData && (
          <div className="print-card bg-card border border-border rounded-xl p-8 shadow-sm">
            {/* Print header (visible only on print) */}
            <div className="hidden print:block mb-6 border-b border-gray-200 pb-4">
              <h1 className="text-2xl font-bold text-gray-900">Relatório de Desempenho</h1>
            </div>

            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  {reportData.full_name || selectedAgentName}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Período: {new Date(startDate).toLocaleDateString("pt-BR")} — {new Date(endDate).toLocaleDateString("pt-BR")}
                </p>
              </div>
              <Button
                variant="outline"
                className="flex items-center gap-2 no-print"
                onClick={() => window.print()}
              >
                <Printer className="h-4 w-4" />
                Imprimir / Salvar PDF
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">
                  Conversas Encerradas
                </p>
                <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">
                  {reportData.closed_count || 0}
                </p>
              </div>

              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl p-5">
                <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">
                  Mensagens Enviadas
                </p>
                <p className="text-3xl font-bold text-green-700 dark:text-green-300">
                  {reportData.messages_sent || 0}
                </p>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-5">
                <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wide mb-1">
                  CSAT Médio
                </p>
                <p className="text-3xl font-bold text-yellow-700 dark:text-yellow-300">
                  {reportData.avg_csat != null ? Number(reportData.avg_csat).toFixed(1) : "—"}
                  {reportData.avg_csat != null && <span className="text-lg font-normal"> / 5</span>}
                </p>
              </div>

              <div className="bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-xl p-5">
                <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">
                  Tempo Médio de Resposta
                </p>
                <p className="text-3xl font-bold text-purple-700 dark:text-purple-300">
                  {reportData.avg_response_min != null ? `${Number(reportData.avg_response_min).toFixed(0)}` : "—"}
                  {reportData.avg_response_min != null && <span className="text-lg font-normal"> min</span>}
                </p>
              </div>
            </div>

            <p className="mt-6 text-xs text-muted-foreground text-center">
              Gerado em {new Date().toLocaleString("pt-BR")} · CRM MSX
            </p>
          </div>
        )}

        {generated && !reportData?.full_name && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Nenhum dado encontrado para o período selecionado.</p>
          </div>
        )}
      </div>
    </>
  );
}
