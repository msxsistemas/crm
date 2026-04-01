import { useState, useMemo } from "react";
import { Search as SearchIcon, Download, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FloatingInput, FloatingSelectWrapper } from "@/components/ui/floating-input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

const Search = () => {
  const [userFilter, setUserFilter] = useState("");
  const [connectionFilter, setConnectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [contactFilter, setContactFilter] = useState("");
  const [queueFilter, setQueueFilter] = useState("");
  const [protocol, setProtocol] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [closeFilter, setCloseFilter] = useState("");
  const [messageText, setMessageText] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    let query = supabase.from("conversations").select("*, contacts(name, phone)");

    if (statusFilter) query = query.eq("status", statusFilter);
    if (startDate) query = query.gte("created_at", new Date(startDate).toISOString());
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query = query.lte("created_at", end.toISOString());
    }
    if (connectionFilter) query = query.eq("instance_name", connectionFilter);

    const { data } = await query.order("created_at", { ascending: false }).limit(100);
    setResults(data || []);
    setTotalResults((data || []).length);
    setLoading(false);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="mx-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-primary">Atendimentos</h1>
      </div>

      <div className="p-6 space-y-5">
        {/* Results summary card */}
        <Card className="p-5 flex items-center gap-6">
          <div className="flex items-center gap-3 flex-1">
            <SearchIcon className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-base font-semibold text-foreground">Total de Resultados</p>
              <p className="text-sm text-primary font-medium">{totalResults}</p>
            </div>
          </div>
          <div className="border-l border-border pl-6">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpDown className="h-5 w-5 text-muted-foreground" />
              <p className="text-base font-semibold text-foreground">Download dos Resultados</p>
            </div>
            <button className="text-sm text-primary hover:underline block">Exportar Resultados em CSV</button>
            <button className="text-sm text-primary hover:underline block">Exportar Resultados de Avaliações em CSV</button>
          </div>
        </Card>

        {/* Filters */}
        <div className="space-y-4">
          {/* Row 1: Users, Connection, Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FloatingSelectWrapper label="Filtro por Users" hasValue={!!userFilter}>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
            <FloatingSelectWrapper label="Filtro por Conexão" hasValue={!!connectionFilter}>
              <Select value={connectionFilter} onValueChange={setConnectionFilter}>
                <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
            <FloatingSelectWrapper label="Filtro por Status" hasValue={!!statusFilter}>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="open">Aberto</SelectItem>
                  <SelectItem value="closed">Fechado</SelectItem>
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
          </div>

          {/* Row 2: Tags, Contact, Queues */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FloatingSelectWrapper label="Filtro por Tags" hasValue={!!tagFilter}>
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
            <FloatingSelectWrapper label="Filtro por Contato" hasValue={!!contactFilter}>
              <Select value={contactFilter} onValueChange={setContactFilter}>
                <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
            <FloatingSelectWrapper label="Filas" hasValue={!!queueFilter}>
              <Select value={queueFilter} onValueChange={setQueueFilter}>
                <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
          </div>

          {/* Row 3: Protocol, Start Date, End Date */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FloatingInput label="Protocolo" value={protocol} onChange={e => setProtocol(e.target.value)} />
            <FloatingInput type="datetime-local" label="Data Inicial" value={startDate} onChange={e => setStartDate(e.target.value)} />
            <FloatingInput type="datetime-local" label="Data Final" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>

          {/* Row 4: Close filter */}
          <FloatingSelectWrapper label="Filtro por Encerramento" hasValue={!!closeFilter}>
            <Select value={closeFilter} onValueChange={setCloseFilter}>
              <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </FloatingSelectWrapper>

          {/* Row 5: Message text */}
          <FloatingInput label="Texto na mensagem" value={messageText} onChange={e => setMessageText(e.target.value)} />

          {/* Search button */}
          <Button variant="action" size="sm" className="uppercase text-xs font-semibold px-6" onClick={handleSearch} disabled={loading}>
            {loading ? "Buscando..." : "Buscar Atendimentos"}
          </Button>
        </div>

        {/* Results table */}
        <Card className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs text-primary font-semibold">ID</TableHead>
                <TableHead className="text-xs text-primary font-semibold">Contato</TableHead>
                <TableHead className="text-xs text-primary font-semibold">Atendente</TableHead>
                <TableHead className="text-xs text-primary font-semibold">Criado</TableHead>
                <TableHead className="text-xs text-primary font-semibold">Início</TableHead>
                <TableHead className="text-xs text-primary font-semibold">Finalizado</TableHead>
                <TableHead className="text-xs text-primary font-semibold">Fila Inicial</TableHead>
                <TableHead className="text-xs text-primary font-semibold">Transferencias</TableHead>
                <TableHead className="text-xs text-primary font-semibold">Tags</TableHead>
                <TableHead className="text-xs text-primary font-semibold">Avaliação</TableHead>
                <TableHead className="text-xs text-primary font-semibold">NPS</TableHead>
                <TableHead className="text-xs text-primary font-semibold">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-8 text-sm">
                    {totalResults === 0 ? "Nenhum resultado encontrado" : "Use os filtros acima e clique em Buscar Atendimentos"}
                  </TableCell>
                </TableRow>
              ) : (
                results.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.id.substring(0, 8)}</TableCell>
                    <TableCell className="text-xs">{r.contacts?.name || r.contacts?.phone || "-"}</TableCell>
                    <TableCell className="text-xs">-</TableCell>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                    <TableCell className="text-xs">{r.status === "closed" ? new Date(r.updated_at).toLocaleDateString("pt-BR") : "-"}</TableCell>
                    <TableCell className="text-xs">-</TableCell>
                    <TableCell className="text-xs">0</TableCell>
                    <TableCell className="text-xs">-</TableCell>
                    <TableCell className="text-xs">-</TableCell>
                    <TableCell className="text-xs">-</TableCell>
                    <TableCell className="text-xs">-</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
};

export default Search;
