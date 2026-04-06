import { useState, useEffect, useCallback } from "react";
import { Download, RefreshCw, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import api from "@/lib/api";
import { toast } from "sonner";

interface WordEntry {
  word: string;
  count: number;
}

const PERIOD_OPTIONS = [
  { value: "7", label: "Últimos 7 dias" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
];

const DIRECTION_OPTIONS = [
  { value: "inbound", label: "Entrada (clientes)" },
  { value: "outbound", label: "Saída (agentes)" },
  { value: "", label: "Ambos" },
];

export default function WordCloud() {
  const [words, setWords] = useState<WordEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState("30");
  const [direction, setDirection] = useState("inbound");
  const [channel, setChannel] = useState("");
  const [connections, setConnections] = useState<{ instance_name: string }[]>([]);

  useEffect(() => {
    api.get<any[]>('/connections').then((data) => {
      setConnections(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  const loadWords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days, direction });
      if (channel) params.set("channel", channel);
      const data = await api.get<WordEntry[]>(`/stats/word-cloud?${params.toString()}`);
      setWords(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast.error("Erro ao carregar palavras");
    } finally {
      setLoading(false);
    }
  }, [days, direction, channel]);

  useEffect(() => {
    loadWords();
  }, [loadWords]);

  const maxCount = words[0]?.count || 1;
  const minFontSize = 13;
  const maxFontSize = 52;

  const getFontSize = (count: number) => {
    const ratio = count / maxCount;
    return Math.round(minFontSize + ratio * (maxFontSize - minFontSize));
  };

  const getColor = (idx: number) => {
    const colors = [
      "#2563eb", "#7c3aed", "#059669", "#dc2626", "#d97706",
      "#0891b2", "#db2777", "#16a34a", "#ea580c", "#6d28d9",
    ];
    return colors[idx % colors.length];
  };

  const exportCsv = () => {
    const header = "Posição,Palavra,Ocorrências\n";
    const rows = words.map((w, i) => `${i + 1},${w.word},${w.count}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `word-cloud-${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-blue-500" />
          <h1 className="text-xl font-bold text-blue-600">Nuvem de Palavras</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadWords} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={words.length === 0}>
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={direction} onValueChange={setDirection}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Direção" />
            </SelectTrigger>
            <SelectContent>
              {DIRECTION_OPTIONS.map((o) => (
                <SelectItem key={o.value || "_all"} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={channel || "_all"} onValueChange={(v) => setChannel(v === "_all" ? "" : v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos os canais</SelectItem>
              {connections.map((c) => (
                <SelectItem key={c.instance_name} value={c.instance_name}>{c.instance_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Word Cloud */}
        <Card className="p-6 min-h-64">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : words.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
              <Cloud className="h-12 w-12 opacity-30" />
              <p className="text-sm">Nenhuma palavra encontrada para os filtros selecionados</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3 items-center justify-center p-4">
              {words.map((entry, idx) => (
                <span
                  key={entry.word}
                  title={`${entry.word}: ${entry.count} ocorrências`}
                  style={{
                    fontSize: `${getFontSize(entry.count)}px`,
                    color: getColor(idx),
                    lineHeight: 1.2,
                    cursor: "default",
                    fontWeight: entry.count > maxCount * 0.6 ? 700 : 400,
                    transition: "transform 0.15s",
                    display: "inline-block",
                  }}
                  className="hover:scale-110"
                >
                  {entry.word}
                </span>
              ))}
            </div>
          )}
        </Card>

        {/* Ranking Table */}
        {words.length > 0 && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">
              Ranking de Palavras ({words.length} palavras)
            </h2>
            <div className="overflow-auto max-h-96">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium w-16">#</th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Palavra</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Ocorrências</th>
                  </tr>
                </thead>
                <tbody>
                  {words.map((entry, idx) => (
                    <tr key={entry.word} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-1.5 pr-4 text-muted-foreground">{idx + 1}</td>
                      <td className="py-1.5 pr-4 font-medium" style={{ color: getColor(idx) }}>
                        {entry.word}
                      </td>
                      <td className="py-1.5 text-right">
                        <span className="inline-flex items-center justify-center bg-muted px-2 py-0.5 rounded text-xs">
                          {entry.count}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
