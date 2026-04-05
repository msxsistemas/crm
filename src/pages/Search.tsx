import { useState, useEffect } from "react";
import { Search as SearchIcon, Download, ArrowUpDown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FloatingInput, FloatingSelectWrapper } from "@/components/ui/floating-input";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { useNavigate } from "react-router-dom";

interface Profile { id: string; full_name: string | null; }
interface Connection { id: string; instance_name: string; }
interface Tag { id: string; name: string; color: string | null; }
interface Contact { id: string; name: string; phone: string; }
interface Category { id: string; name: string; }

const Search = () => {
  const navigate = useNavigate();

  // Filter options
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Filter state
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

  // Results
  const [results, setResults] = useState<any[]>([]);
  const [resultTags, setResultTags] = useState<Record<string, Tag[]>>({});
  const [resultReviews, setResultReviews] = useState<Record<string, any>>({});
  const [totalResults, setTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFilterOptions();
  }, []);

  const loadFilterOptions = async () => {
    const [profRes, connRes, tagRes, contRes, catRes] = await Promise.all([
      db.from("profiles").select("id, full_name"),
      db.from("evolution_connections").select("id, instance_name"),
      db.from("tags").select("id, name, color"),
      db.from("contacts").select("id, name, phone").limit(200).order("name"),
      db.from("categories").select("id, name"),
    ]);
    setProfiles((profRes.data as Profile[]) || []);
    setConnections((connRes.data as Connection[]) || []);
    setTags((tagRes.data as Tag[]) || []);
    setContacts((contRes.data as Contact[]) || []);
    setCategories((catRes.data as Category[]) || []);
  };

  const profileMap = Object.fromEntries(profiles.map(p => [p.id, p.full_name || p.id]));

  const handleSearch = async () => {
    setLoading(true);
    try {
      let conversationIds: string[] | null = null;

      // Filter by tag via contact_tags
      if (tagFilter && tagFilter !== "all") {
        const { data: ctData } = await db
          .from("contact_tags")
          .select("contact_id")
          .eq("tag_id", tagFilter);
        const tagContactIds = (ctData || []).map((ct: any) => ct.contact_id);
        // We'll use these contact IDs later
        if (tagContactIds.length === 0) {
          setResults([]);
          setTotalResults(0);
          setLoading(false);
          return;
        }
        // Get conversations for these contacts
        const { data: convByTag } = await db
          .from("conversations")
          .select("id")
          .in("contact_id", tagContactIds);
        const ids = (convByTag || []).map((c: any) => c.id);
        conversationIds = ids;
      }

      // Filter by message text
      if (messageText.trim()) {
        const { data: msgData } = await db
          .from("messages")
          .select("conversation_id")
          .ilike("body", `%${messageText.trim()}%`);
        const msgConvIds = [...new Set((msgData || []).map((m: any) => m.conversation_id))];
        if (conversationIds !== null) {
          conversationIds = conversationIds.filter(id => msgConvIds.includes(id));
        } else {
          conversationIds = msgConvIds;
        }
        if (conversationIds.length === 0) {
          setResults([]);
          setTotalResults(0);
          setLoading(false);
          return;
        }
      }

      let query = db.from("conversations").select("*, contacts(name, phone)");

      if (statusFilter && statusFilter !== "all") query = query.eq("status", statusFilter);
      if (startDate) query = query.gte("created_at", new Date(startDate).toISOString());
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }
      if (connectionFilter && connectionFilter !== "all") query = query.eq("instance_name", connectionFilter);
      if (userFilter && userFilter !== "all") query = query.eq("assigned_to", userFilter);
      if (contactFilter && contactFilter !== "all") query = query.eq("contact_id", contactFilter);
      if (queueFilter && queueFilter !== "all") query = query.eq("category_id", queueFilter);
      if (protocol) query = query.ilike("id", `%${protocol}%`);
      if (conversationIds !== null) query = query.in("id", conversationIds.length > 0 ? conversationIds : ["__none__"]);

      const { data } = await query.order("created_at", { ascending: false }).limit(100);
      const rows = data || [];
      setResults(rows);
      setTotalResults(rows.length);

      // Load tags for results
      if (rows.length > 0) {
        const convIds = rows.map((r: any) => r.id);
        const { data: convTagData } = await db
          .from("conversation_tags")
          .select("conversation_id, tag_id")
          .in("conversation_id", convIds);
        const tagMap: Record<string, Tag[]> = {};
        if (convTagData) {
          for (const ct of convTagData as any[]) {
            const tag = tags.find(t => t.id === ct.tag_id);
            if (tag) {
              if (!tagMap[ct.conversation_id]) tagMap[ct.conversation_id] = [];
              tagMap[ct.conversation_id].push(tag);
            }
          }
        }
        setResultTags(tagMap);

        // Load reviews
        const { data: reviewData } = await db
          .from("reviews")
          .select("conversation_id, rating, nps")
          .in("conversation_id", convIds);
        const reviewMap: Record<string, any> = {};
        if (reviewData) {
          for (const rv of reviewData as any[]) {
            reviewMap[rv.conversation_id] = rv;
          }
        }
        setResultReviews(reviewMap);
      } else {
        setResultTags({});
        setResultReviews({});
      }
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    const headers = ["ID", "Contato", "Atendente", "Criado", "Status", "Tags"];
    const rows = results.map(r => [
      r.id,
      r.contacts?.name || r.contacts?.phone || "",
      profileMap[r.assigned_to] || "",
      new Date(r.created_at).toLocaleString("pt-BR"),
      r.status || "",
      (resultTags[r.id] || []).map((t: Tag) => t.name).join("; "),
    ]);
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `atendimentos_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
            <button className="text-sm text-primary hover:underline block" onClick={exportCSV}>
              Exportar Resultados em CSV
            </button>
            <button className="text-sm text-primary hover:underline block">Exportar Resultados de Avaliações em CSV</button>
          </div>
        </Card>

        {/* Filters */}
        <div className="space-y-4">
          {/* Row 1: Users, Connection, Status */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FloatingSelectWrapper label="Filtro por Users" hasValue={!!userFilter && userFilter !== "all"}>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
            <FloatingSelectWrapper label="Filtro por Conexão" hasValue={!!connectionFilter && connectionFilter !== "all"}>
              <Select value={connectionFilter} onValueChange={setConnectionFilter}>
                <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {connections.map(c => (
                    <SelectItem key={c.id} value={c.instance_name}>{c.instance_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
            <FloatingSelectWrapper label="Filtro por Status" hasValue={!!statusFilter && statusFilter !== "all"}>
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
            <FloatingSelectWrapper label="Filtro por Tags" hasValue={!!tagFilter && tagFilter !== "all"}>
              <Select value={tagFilter} onValueChange={setTagFilter}>
                <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {tags.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
            <FloatingSelectWrapper label="Filtro por Contato" hasValue={!!contactFilter && contactFilter !== "all"}>
              <Select value={contactFilter} onValueChange={setContactFilter}>
                <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name || c.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
            <FloatingSelectWrapper label="Filas" hasValue={!!queueFilter && queueFilter !== "all"}>
              <Select value={queueFilter} onValueChange={setQueueFilter}>
                <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
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
          <FloatingSelectWrapper label="Filtro por Encerramento" hasValue={!!closeFilter && closeFilter !== "all"}>
            <Select value={closeFilter} onValueChange={setCloseFilter}>
              <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="this_week">Esta semana</SelectItem>
                <SelectItem value="this_month">Este mês</SelectItem>
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
                    {totalResults === 0 && !loading
                      ? "Use os filtros acima e clique em Buscar Atendimentos"
                      : loading ? "Buscando..." : "Nenhum resultado encontrado"}
                  </TableCell>
                </TableRow>
              ) : (
                results.map(r => {
                  const convTags = resultTags[r.id] || [];
                  const review = resultReviews[r.id];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs font-mono">{r.id.substring(0, 8)}</TableCell>
                      <TableCell className="text-xs">{r.contacts?.name || r.contacts?.phone || "-"}</TableCell>
                      <TableCell className="text-xs">{r.assigned_to ? (profileMap[r.assigned_to] || r.assigned_to.substring(0, 8)) : "-"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.status === "closed" && r.updated_at ? new Date(r.updated_at).toLocaleDateString("pt-BR") : "-"}</TableCell>
                      <TableCell className="text-xs">{r.category_id ? (categories.find(c => c.id === r.category_id)?.name || "-") : "-"}</TableCell>
                      <TableCell className="text-xs">0</TableCell>
                      <TableCell className="text-xs">
                        {convTags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {convTags.map(t => (
                              <span
                                key={t.id}
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white"
                                style={{ backgroundColor: t.color || "#6b7280" }}
                              >
                                {t.name}
                              </span>
                            ))}
                          </div>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-xs">{review?.rating ?? "-"}</TableCell>
                      <TableCell className="text-xs">{review?.nps ?? "-"}</TableCell>
                      <TableCell className="text-xs">
                        <button
                          className="flex items-center gap-1 text-primary hover:underline text-xs"
                          onClick={() => navigate(`/inbox?conversation=${r.id}`)}
                          title="Ver atendimento"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Ver
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
};

export default Search;
