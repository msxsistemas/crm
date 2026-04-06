import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Minimize2, MessageCircle, Clock, CheckCircle, AlertCircle, Search, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db";
import { toast } from "sonner";
import { useSocketEvent } from "@/hooks/useSocketEvent";

type StatusFilter = "all" | "open" | "in_progress" | "waiting";

interface Contact {
  id: string;
  name: string;
  phone: string;
  avatar_url?: string | null;
}

interface Conversation {
  id: string;
  contact_id: string;
  status: string;
  unread_count: number;
  last_message_at: string | null;
  last_message_body?: string;
  assigned_to: string | null;
  contacts: Contact;
  created_at?: string;
}

const fmtTime = (s: string | null) => {
  if (!s) return "";
  const d = new Date(s);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const STATUS_LABELS: Record<string, string> = {
  open: "Aberta",
  in_progress: "Em andamento",
  waiting: "Aguardando",
};

export default function FocusMode() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await db
        .from("conversations")
        .select("id, contact_id, status, unread_count, last_message_at, last_message_body, assigned_to, created_at, contacts(id, name, phone, avatar_url)")
        .eq("assigned_to", user.id)
        .in("status", ["open", "in_progress", "waiting"])
        .order("last_message_at", { ascending: false })
        .limit(100);
      if (!error && data) {
        setConversations(data as unknown as Conversation[]);
      }
    } catch {
      toast.error("Erro ao carregar conversas");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  useSocketEvent("conversation_updated", load);
  useSocketEvent("new_message", load);

  const exitFocus = () => navigate("/inbox");

  const filtered = conversations.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        c.contacts?.name?.toLowerCase().includes(q) ||
        c.contacts?.phone?.includes(q) ||
        c.last_message_body?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts = {
    all: conversations.length,
    open: conversations.filter(c => c.status === "open").length,
    in_progress: conversations.filter(c => c.status === "in_progress").length,
    waiting: conversations.filter(c => c.status === "waiting").length,
  };

  const selectedConvo = conversations.find(c => c.id === selectedId);

  const openInInbox = (id: string) => {
    navigate(`/inbox?conversation=${id}`);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Left panel — conversation list */}
      <div className="flex flex-col w-80 shrink-0 border-r border-border bg-card">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground leading-none">Modo Foco</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {user?.user_metadata?.full_name || user?.email?.split("@")[0]}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Atualizar"
                onClick={load}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={exitFocus}
              >
                <Minimize2 className="h-3.5 w-3.5" />
                Sair do foco
              </Button>
            </div>
          </div>

          {/* Active count */}
          <div className="flex items-center gap-1">
            <Badge variant="secondary" className="text-xs font-medium">
              {counts.all} ativa{counts.all !== 1 ? "s" : ""}
            </Badge>
          </div>
        </div>

        {/* Filter pills */}
        <div className="flex gap-1 px-3 py-2 border-b border-border overflow-x-auto">
          {(["all", "open", "in_progress", "waiting"] as StatusFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full font-medium transition-colors ${
                statusFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f === "all" ? `Todas (${counts.all})` :
               f === "open" ? `Abertas (${counts.open})` :
               f === "in_progress" ? `Em andamento (${counts.in_progress})` :
               `Aguardando (${counts.waiting})`}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-7 h-7 text-xs"
              placeholder="Buscar conversa..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageCircle className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/40 transition-colors ${
                  selectedId === c.id ? "bg-primary/5 border-l-2 border-l-primary" : ""
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
                    {c.contacts?.name?.charAt(0)?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {c.contacts?.name || c.contacts?.phone || "Desconhecido"}
                      </p>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {fmtTime(c.last_message_at)}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {c.last_message_body || c.contacts?.phone || ""}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <StatusBadge status={c.status} />
                      {c.unread_count > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1">
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel — detail / placeholder */}
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/20">
        {selectedConvo ? (
          <div className="max-w-md text-center px-6">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground mx-auto mb-4">
              {selectedConvo.contacts?.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <h2 className="text-lg font-bold text-foreground">
              {selectedConvo.contacts?.name || "Desconhecido"}
            </h2>
            <p className="text-sm text-muted-foreground mb-1">{selectedConvo.contacts?.phone}</p>
            <StatusBadge status={selectedConvo.status} />
            {selectedConvo.last_message_body && (
              <p className="mt-4 text-sm text-muted-foreground bg-muted rounded-lg px-4 py-2">
                {selectedConvo.last_message_body}
              </p>
            )}
            <Button
              className="mt-6"
              onClick={() => openInInbox(selectedConvo.id)}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Abrir no Inbox completo
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              O chat completo abre no Inbox com todos os recursos
            </p>
          </div>
        ) : (
          <div className="text-center px-6">
            <MessageCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Selecione uma conversa</p>
            <p className="text-xs text-muted-foreground mt-1">
              Clique em uma conversa na lista para ver os detalhes
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={exitFocus}
            >
              <Minimize2 className="h-3.5 w-3.5 mr-1.5" />
              Voltar para o Inbox
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    open: {
      icon: <MessageCircle className="h-2.5 w-2.5" />,
      label: "Aberta",
      cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    },
    in_progress: {
      icon: <Clock className="h-2.5 w-2.5" />,
      label: "Em andamento",
      cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    },
    waiting: {
      icon: <AlertCircle className="h-2.5 w-2.5" />,
      label: "Aguardando",
      cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
    },
    closed: {
      icon: <CheckCircle className="h-2.5 w-2.5" />,
      label: "Encerrada",
      cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    },
  };
  const c = configs[status] || { icon: null, label: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${c.cls}`}>
      {c.icon}
      {c.label}
    </span>
  );
}
