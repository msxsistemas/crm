import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Filter, ChevronDown, ChevronUp, Download, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import api from "@/lib/api";
import { toast } from "sonner";

interface SearchResult {
  id: string;
  content: string;
  sender_type: string;
  created_at: string;
  conversation_id: string;
  labels: string[] | null;
  sentiment: string | null;
  csat_score: number | null;
  connection_name: string | null;
  contact_name: string | null;
  phone: string | null;
  agent_name: string | null;
}

const SENTIMENTS = [
  { value: "positive", label: "Positivo" },
  { value: "negative", label: "Negativo" },
  { value: "neutral", label: "Neutro" },
];

export default function MessageSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [agentId, setAgentId] = useState("");
  const [label, setLabel] = useState("");
  const [channel, setChannel] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [csatMin, setCsatMin] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const LIMIT = 50;

  const buildParams = useCallback((off = 0) => {
    const p: Record<string, string> = { limit: String(LIMIT), offset: String(off) };
    if (q.trim()) p.q = q.trim();
    if (agentId) p.agent_id = agentId;
    if (label) p.label = label;
    if (channel) p.channel = channel;
    if (sentiment) p.sentiment = sentiment;
    if (start) p.start = start;
    if (end) p.end = end;
    if (csatMin) p.csat_min = csatMin;
    return p;
  }, [q, agentId, label, channel, sentiment, start, end, csatMin]);

  const doSearch = async (off = 0) => {
    setLoading(true);
    try {
      const params = buildParams(off);
      const qs = new URLSearchParams(params).toString();
      const data = await api.get<SearchResult[]>(`/messages/search?${qs}`);
      const rows = data || [];
      if (off === 0) {
        setResults(rows);
      } else {
        setResults(prev => [...prev, ...rows]);
      }
      setHasMore(rows.length === LIMIT);
      setOffset(off + rows.length);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao buscar mensagens");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    doSearch(0);
  };

  const handleLoadMore = () => {
    doSearch(offset);
  };

  const handleOpenConversation = (convId: string) => {
    navigate(`/inbox?conv=${convId}`);
  };

  const handleExportCSV = () => {
    if (!results.length) return;
    const header = ["Data", "Contato", "Telefone", "Agente", "Canal", "Conteúdo", "Sentimento", "CSAT"];
    const rows = results.map(r => [
      new Date(r.created_at).toLocaleString("pt-BR"),
      r.contact_name || "",
      r.phone || "",
      r.agent_name || "",
      r.connection_name || "",
      `"${(r.content || "").replace(/"/g, '""')}"`,
      r.sentiment || "",
      r.csat_score != null ? String(r.csat_score) : "",
    ]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `busca_mensagens_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setAgentId(""); setLabel(""); setChannel(""); setSentiment(""); setStart(""); setEnd(""); setCsatMin("");
  };

  const hasFilters = !!(agentId || label || channel || sentiment || start || end || csatMin);

  return (
    <div className="flex flex-col h-full p-4 gap-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Busca Avançada de Mensagens</h1>
          <p className="text-sm text-muted-foreground">Pesquise mensagens com filtros detalhados</p>
        </div>
        {results.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-2">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        )}
      </div>

      {/* Search form */}
      <Card className="p-4 space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar no conteúdo das mensagens..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setFiltersOpen(v => !v)}
            className={hasFilters ? "border-primary text-primary" : ""}
            title="Filtros avançados"
          >
            {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
          </Button>
          <Button type="submit" disabled={loading} className="gap-2">
            <Search className="h-4 w-4" />
            {loading ? "Buscando..." : "Buscar"}
          </Button>
        </form>

        {filtersOpen && (
          <div className="pt-2 border-t border-border">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Canal</label>
                <Input placeholder="Ex: whatsapp-01" value={channel} onChange={e => setChannel(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Label/Etiqueta</label>
                <Input placeholder="Ex: suporte" value={label} onChange={e => setLabel(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Sentimento</label>
                <Select value={sentiment} onValueChange={setSentiment}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    {SENTIMENTS.map(s => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Data início</label>
                <Input type="date" value={start} onChange={e => setStart(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Data fim</label>
                <Input type="date" value={end} onChange={e => setEnd(e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">CSAT mínimo (0-5)</label>
                <Input type="number" min="0" max="5" step="0.1" placeholder="Ex: 4" value={csatMin} onChange={e => setCsatMin(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            {hasFilters && (
              <div className="mt-2 flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs text-muted-foreground">
                  <X className="h-3 w-3" /> Limpar filtros
                </Button>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Results */}
      {results.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span><Badge variant="secondary">{results.length}</Badge> resultado(s) encontrado(s)</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-2">
        {results.length === 0 && !loading && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Use os filtros acima para buscar mensagens</p>
          </div>
        )}

        {results.map(r => (
          <Card key={r.id} className="p-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium text-sm truncate">{r.contact_name || r.phone || "Contato"}</span>
                  {r.agent_name && (
                    <span className="text-xs text-muted-foreground">• {r.agent_name}</span>
                  )}
                  {r.connection_name && (
                    <Badge variant="outline" className="text-xs">{r.connection_name}</Badge>
                  )}
                  {r.sentiment && (
                    <Badge
                      variant="outline"
                      className={
                        r.sentiment === "positive" ? "text-green-600 border-green-300" :
                        r.sentiment === "negative" ? "text-red-600 border-red-300" :
                        "text-gray-500"
                      }
                    >
                      {r.sentiment === "positive" ? "Positivo" : r.sentiment === "negative" ? "Negativo" : "Neutro"}
                    </Badge>
                  )}
                  {r.csat_score != null && (
                    <Badge variant="secondary" className="text-xs">CSAT {r.csat_score}</Badge>
                  )}
                </div>
                <p className="text-sm text-foreground line-clamp-2">{r.content || "(sem texto)"}</p>
                <p className="text-xs text-muted-foreground mt-1">{new Date(r.created_at).toLocaleString("pt-BR")}</p>
                {r.labels && r.labels.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {r.labels.map((l, i) => (
                      <Badge key={i} variant="outline" className="text-xs">{l}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0 gap-1 text-xs"
                onClick={() => handleOpenConversation(r.conversation_id)}
                title="Abrir conversa"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir
              </Button>
            </div>
          </Card>
        ))}

        {hasMore && (
          <div className="flex justify-center py-4">
            <Button variant="outline" onClick={handleLoadMore} disabled={loading}>
              {loading ? "Carregando..." : "Carregar mais"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
