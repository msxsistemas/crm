import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Eye, ChevronLeft, ChevronRight, Shield } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AuditEntry {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  resource_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  view_contact: "👁️ Visualizou contato",
  edit_contact: "✏️ Editou contato",
  delete_contact: "🗑️ Deletou contato",
  export_contacts: "📤 Exportou contatos",
  view_conversation: "💬 Visualizou conversa",
  export_conversation: "📤 Exportou conversa",
  send_campaign: "📧 Enviou campanha",
  view_report: "📊 Visualizou relatório",
  login: "🔑 Login",
  logout: "🚪 Logout",
  api_access: "🔌 Acesso API",
};

const PAGE_SIZE = 100;

export default function AuditLog() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  // Filters
  const [filterAction, setFilterAction] = useState("all");
  const [filterUser, setFilterUser] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Detail modal
  const [detailEntry, setDetailEntry] = useState<AuditEntry | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("access_audit")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterAction && filterAction !== "all") {
        query = query.eq("action", filterAction);
      }
      if (filterUser.trim()) {
        query = query.ilike("user_name", `%${filterUser.trim()}%`);
      }
      if (filterDateFrom) {
        query = query.gte("created_at", new Date(filterDateFrom).toISOString());
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo);
        to.setDate(to.getDate() + 1);
        query = query.lt("created_at", to.toISOString());
      }

      const { data, count, error } = await query;
      if (error) throw error;
      setEntries((data as AuditEntry[]) || []);
      setTotalCount(count || 0);
    } catch (err: unknown) {
      toast.error("Erro ao carregar log de auditoria");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, filterAction, filterUser, filterDateFrom, filterDateTo]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleExportCSV = () => {
    if (entries.length === 0) {
      toast.error("Nenhum registro para exportar");
      return;
    }
    const headers = ["Data/Hora", "Usuário", "Ação", "Tipo de Recurso", "ID do Recurso", "Nome do Recurso"];
    const rows = entries.map((e) => [
      format(new Date(e.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
      e.user_name || "",
      ACTION_LABELS[e.action] || e.action,
      e.resource_type || "",
      e.resource_id || "",
      e.resource_name || "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado");
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Log de Auditoria (LGPD)</h1>
            <p className="text-sm text-muted-foreground">Registro de acessos e operações sobre dados</p>
          </div>
        </div>
        <Button
          onClick={handleExportCSV}
          variant="outline"
          className="gap-2 border-blue-300 text-blue-600 hover:bg-blue-50"
        >
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-border bg-muted/30">
        <Select
          value={filterAction}
          onValueChange={(v) => { setFilterAction(v); setPage(0); }}
        >
          <SelectTrigger className="w-52 h-9 text-sm">
            <SelectValue placeholder="Tipo de ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          placeholder="Filtrar por usuário..."
          value={filterUser}
          onChange={(e) => { setFilterUser(e.target.value); setPage(0); }}
          className="w-48 h-9 text-sm"
        />

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">De:</span>
          <Input
            type="date"
            value={filterDateFrom}
            onChange={(e) => { setFilterDateFrom(e.target.value); setPage(0); }}
            className="w-36 h-9 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Até:</span>
          <Input
            type="date"
            value={filterDateTo}
            onChange={(e) => { setFilterDateTo(e.target.value); setPage(0); }}
            className="w-36 h-9 text-sm"
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setFilterAction("all");
            setFilterUser("");
            setFilterDateFrom("");
            setFilterDateTo("");
            setPage(0);
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          Limpar filtros
        </Button>

        <div className="ml-auto text-sm text-muted-foreground">
          {totalCount} registro{totalCount !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Data/Hora</TableHead>
              <TableHead className="w-40">Usuário</TableHead>
              <TableHead className="w-52">Ação</TableHead>
              <TableHead className="w-32">Recurso</TableHead>
              <TableHead className="w-40">ID</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="w-20 text-center">Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  Nenhum registro encontrado
                </TableCell>
              </TableRow>
            ) : (
              entries.map((entry) => (
                <TableRow key={entry.id} className="hover:bg-muted/30">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="font-medium">{entry.user_name || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-normal">
                      {ACTION_LABELS[entry.action] || entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.resource_type || "—"}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-[160px]">
                    {entry.resource_id || "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {entry.resource_name || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-blue-600"
                      onClick={() => setDetailEntry(entry)}
                      title="Ver detalhes"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 px-6 py-3 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page + 1} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
            className="gap-1"
          >
            Próxima
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!detailEntry} onOpenChange={() => setDetailEntry(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Registro</DialogTitle>
          </DialogHeader>
          {detailEntry && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Data/Hora</p>
                  <p>{format(new Date(detailEntry.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Usuário</p>
                  <p>{detailEntry.user_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Ação</p>
                  <p>{ACTION_LABELS[detailEntry.action] || detailEntry.action}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Recurso</p>
                  <p>{detailEntry.resource_type || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">ID do Recurso</p>
                  <p className="font-mono text-xs break-all">{detailEntry.resource_id || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Nome do Recurso</p>
                  <p>{detailEntry.resource_name || "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Metadados</p>
                <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-48 text-foreground">
                  {JSON.stringify(detailEntry.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
