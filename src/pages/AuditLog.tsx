import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
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
import { ShieldCheck, Eye, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  user_created: "Usuário criado",
  user_updated: "Usuário atualizado",
  user_deleted: "Usuário excluído",
  login: "Login",
  logout: "Logout",
  contact_created: "Contato criado",
  contact_updated: "Contato atualizado",
  contact_deleted: "Contato excluído",
  conversation_closed: "Conversa encerrada",
  campaign_sent: "Campanha enviada",
  settings_changed: "Configuração alterada",
};

const PAGE_SIZE = 50;

export default function AuditLog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filters
  const [filterAction, setFilterAction] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  // Detail modal
  const [detailEntry, setDetailEntry] = useState<AuditEntry | null>(null);

  useEffect(() => {
    if (user && !["admin", "supervisor"].includes(user.role || "")) {
      navigate("/");
    }
  }, [user, navigate]);

  const fetchEntries = useCallback(async (reset = false) => {
    const currentOffset = reset ? 0 : offset;
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const data = await api.get(`/admin/audit-log?limit=${PAGE_SIZE}&offset=${currentOffset}`);
      const rows: AuditEntry[] = Array.isArray(data) ? data : [];
      if (reset) {
        setEntries(rows);
        setOffset(rows.length);
      } else {
        setEntries(prev => [...prev, ...rows]);
        setOffset(prev => prev + rows.length);
      }
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err: unknown) {
      toast.error("Erro ao carregar log de auditoria");
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  useEffect(() => {
    fetchEntries(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayedEntries = entries.filter(e => {
    if (filterAction && filterAction !== "all" && e.action !== filterAction) return false;
    if (filterDateFrom && new Date(e.created_at) < new Date(filterDateFrom)) return false;
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setDate(to.getDate() + 1);
      if (new Date(e.created_at) >= to) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-blue-600" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Log de Auditoria</h1>
            <p className="text-sm text-muted-foreground">Histórico de ações importantes no sistema</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-border bg-muted/30">
        <Select
          value={filterAction}
          onValueChange={v => setFilterAction(v)}
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

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">De:</span>
          <Input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            className="w-36 h-9 text-sm"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Até:</span>
          <Input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            className="w-36 h-9 text-sm"
          />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setFilterAction("all"); setFilterDateFrom(""); setFilterDateTo(""); }}
          className="text-muted-foreground hover:text-foreground"
        >
          Limpar filtros
        </Button>

        <div className="ml-auto text-sm text-muted-foreground">
          {displayedEntries.length} registro{displayedEntries.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Data/Hora</TableHead>
              <TableHead className="w-40">Ator</TableHead>
              <TableHead className="w-52">Ação</TableHead>
              <TableHead className="w-32">Entidade</TableHead>
              <TableHead>Detalhes</TableHead>
              <TableHead className="w-20 text-center">Ver</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : displayedEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                  Nenhum registro encontrado
                </TableCell>
              </TableRow>
            ) : (
              displayedEntries.map(entry => (
                <TableRow key={entry.id} className="hover:bg-muted/30">
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="font-medium">{entry.actor_name || "—"}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-normal">
                      {ACTION_LABELS[entry.action] || entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.entity_type || "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate max-w-[240px]">
                    {entry.details ? JSON.stringify(entry.details).slice(0, 80) : "—"}
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

      {/* Load more */}
      {!loading && hasMore && (
        <div className="flex justify-center px-6 py-3 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            disabled={loadingMore}
            onClick={() => fetchEntries(false)}
            className="gap-2"
          >
            <ChevronDown className="h-4 w-4" />
            {loadingMore ? "Carregando..." : "Carregar mais"}
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
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Ator</p>
                  <p>{detailEntry.actor_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Ação</p>
                  <p>{ACTION_LABELS[detailEntry.action] || detailEntry.action}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Entidade</p>
                  <p>{detailEntry.entity_type || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">ID da Entidade</p>
                  <p className="font-mono text-xs break-all">{detailEntry.entity_id || "—"}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Detalhes</p>
                <pre className="bg-muted rounded-md p-3 text-xs overflow-auto max-h-48 text-foreground">
                  {JSON.stringify(detailEntry.details || {}, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
