import { useState, useEffect, useCallback } from "react";
import {
  Layers,
  Users,
  MessageCircle,
  RefreshCw,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// ---- Types ----
interface Queue {
  id: string;
  name: string;
  color: string;
  connection: string | null;
}

interface KanbanBoard {
  id: string;
  name: string;
  user_id: string;
}

interface KanbanColumn {
  id: string;
  board_id: string;
  name: string;
  color: string;
  position: number;
}

interface KanbanCard {
  id: string;
  column_id: string;
  contact_id: string | null;
  name: string;
  phone: string | null;
  value: number | null;
  created_at: string;
  updated_at: string;
}

interface Contact {
  id: string;
  name: string | null;
  phone: string | null;
}

interface Conversation {
  id: string;
  contact_id: string;
  status: string;
  instance_name: string;
  unread_count: number;
  last_message_at: string | null;
}

interface EnrichedCard {
  id: string;
  contactId: string | null;
  contactName: string;
  phone: string;
  columnName: string;
  columnColor: string;
  conversationId: string | null;
  conversationStatus: string | null;
  instanceName: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
}

interface QueueGroup {
  queueId: string | null;
  queueName: string;
  queueColor: string;
  cards: EnrichedCard[];
}

const STATUS_LABELS: Record<string, string> = {
  open: "Aguardando",
  attending: "Atendendo",
  closed: "Encerrada",
  archived: "Arquivada",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  attending: "bg-blue-100 text-blue-800",
  closed: "bg-gray-100 text-gray-700",
  archived: "bg-red-100 text-red-700",
};

const QUEUE_COLORS = [
  "#8B5CF6",
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#EC4899",
  "#14B8A6",
];

// ---- Main component ----
const KanbanQueues = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [boards, setBoards] = useState<KanbanBoard[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [queueGroups, setQueueGroups] = useState<QueueGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Load boards
      const { data: boardsData, error: boardsErr } = await supabase
        .from("kanban_boards" as never)
        .select("id, name, user_id")
        .eq("user_id", user.id)
        .order("created_at");

      if (boardsErr) throw boardsErr;

      const rawBoards = (boardsData ?? []) as KanbanBoard[];
      setBoards(rawBoards);

      const activeBoardId = selectedBoardId || rawBoards[0]?.id;
      if (!activeBoardId) {
        setQueueGroups([]);
        setLoading(false);
        return;
      }

      if (!selectedBoardId && rawBoards[0]?.id) {
        setSelectedBoardId(rawBoards[0].id);
      }

      // 2. Load queues, columns, cards in parallel
      const [queuesRes, columnsRes, cardsRes] = await Promise.all([
        supabase
          .from("queues" as never)
          .select("id, name, color, connection")
          .eq("user_id", user.id)
          .order("name"),
        supabase
          .from("kanban_columns" as never)
          .select("id, board_id, name, color, position")
          .eq("board_id", activeBoardId)
          .order("position"),
        supabase
          .from("kanban_cards" as never)
          .select("id, column_id, contact_id, name, phone, value, created_at, updated_at")
          .in(
            "column_id",
            // We need column ids for this board — will filter after
            ["placeholder"]
          ),
      ]);

      const rawQueues = (queuesRes.data ?? []) as Queue[];
      const rawColumns = (columnsRes.data ?? []) as KanbanColumn[];
      const columnIds = rawColumns.map((c) => c.id);

      // 3. Load cards for this board's columns
      let rawCards: KanbanCard[] = [];
      if (columnIds.length > 0) {
        const { data: cardsData, error: cardsErr } = await supabase
          .from("kanban_cards" as never)
          .select("id, column_id, contact_id, name, phone, value, created_at, updated_at")
          .in("column_id", columnIds);
        if (cardsErr) throw cardsErr;
        rawCards = (cardsData ?? []) as KanbanCard[];
      }

      // 4. Load contacts
      const contactIds = [
        ...new Set(rawCards.map((c) => c.contact_id).filter(Boolean) as string[]),
      ];
      const contactMap = new Map<string, Contact>();
      if (contactIds.length > 0) {
        const { data: contactsData } = await supabase
          .from("contacts")
          .select("id, name, phone")
          .in("id", contactIds);
        ((contactsData ?? []) as Contact[]).forEach((c) => contactMap.set(c.id, c));
      }

      // 5. Load conversations (latest per contact)
      const convMap = new Map<string, Conversation>();
      if (contactIds.length > 0) {
        const { data: convData } = await supabase
          .from("conversations")
          .select("id, contact_id, status, instance_name, unread_count, last_message_at")
          .in("contact_id", contactIds)
          .order("last_message_at", { ascending: false });
        ((convData ?? []) as Conversation[]).forEach((conv) => {
          if (!convMap.has(conv.contact_id)) convMap.set(conv.contact_id, conv);
        });
      }

      // 6. Build column map for quick lookup
      const columnMap = new Map<string, KanbanColumn>();
      rawColumns.forEach((col) => columnMap.set(col.id, col));

      // 7. Enrich cards
      const enriched: EnrichedCard[] = rawCards.map((card) => {
        const contact = card.contact_id ? contactMap.get(card.contact_id) : null;
        const conv = card.contact_id ? convMap.get(card.contact_id) : null;
        const col = columnMap.get(card.column_id);
        return {
          id: card.id,
          contactId: card.contact_id,
          contactName: contact?.name ?? card.name ?? "Sem nome",
          phone: contact?.phone ?? card.phone ?? "",
          columnName: col?.name ?? "",
          columnColor: col?.color ?? "#6366f1",
          conversationId: conv?.id ?? null,
          conversationStatus: conv?.status ?? null,
          instanceName: conv?.instance_name ?? null,
          unreadCount: conv?.unread_count ?? 0,
          lastMessageAt: conv?.last_message_at ?? null,
          lastMessagePreview: null,
        };
      });

      // 8. Assign each card to a queue
      // Match: card's conversation instance_name === queue's connection
      const assignCard = (card: EnrichedCard): string | null => {
        if (!card.instanceName) return null;
        const q = rawQueues.find(
          (q) => q.connection && q.connection === card.instanceName
        );
        return q?.id ?? null;
      };

      // Build groups map
      const groupMap = new Map<string | null, EnrichedCard[]>();
      groupMap.set(null, []); // "Sem fila" group

      rawQueues.forEach((q) => groupMap.set(q.id, []));

      enriched.forEach((card) => {
        const queueId = assignCard(card);
        const bucket = groupMap.get(queueId) ?? groupMap.get(null)!;
        bucket.push(card);
        if (queueId === null) {
          // Make sure it's in sem fila
        }
      });

      // Build result
      const groups: QueueGroup[] = [];

      rawQueues.forEach((q) => {
        groups.push({
          queueId: q.id,
          queueName: q.name,
          queueColor: q.color ?? "#8B5CF6",
          cards: groupMap.get(q.id) ?? [],
        });
      });

      // "Sem fila" group at the end
      const semFila = groupMap.get(null) ?? [];
      groups.push({
        queueId: null,
        queueName: "Sem fila",
        queueColor: "#94A3B8",
        cards: semFila,
      });

      setQueueGroups(groups);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao carregar dados do Kanban"
      );
    } finally {
      setLoading(false);
    }
  }, [user, selectedBoardId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCardClick = (card: EnrichedCard) => {
    if (card.conversationId) {
      navigate(`/inbox?conversation=${card.conversationId}`);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mx-6 py-4 border-b border-border gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Layers className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold text-blue-600">Kanban por Filas</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Board selector */}
            {boards.length > 1 && (
              <Select
                value={selectedBoardId}
                onValueChange={(v) => {
                  setSelectedBoardId(v);
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Selecionar quadro" />
                </SelectTrigger>
                <SelectContent>
                  {boards.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={loadData}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : boards.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Layers className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-lg">Nenhum quadro Kanban encontrado</p>
              <p className="text-sm mt-1">Crie um quadro Kanban para visualizar os cards por fila.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {queueGroups.map((group) => (
                <div key={group.queueId ?? "__sem_fila__"} className="space-y-3">
                  {/* Swimlane header */}
                  <div className="flex items-center gap-3 pb-2 border-b border-border">
                    <span
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: group.queueColor }}
                    />
                    <span className="font-semibold text-sm">{group.queueName}</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {group.cards.length} card{group.cards.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Cards */}
                  {group.cards.length === 0 ? (
                    <div className="flex items-center gap-2 py-4 px-3 text-sm text-muted-foreground italic">
                      <Inbox className="h-4 w-4 opacity-40" />
                      Nenhum card nesta fila
                    </div>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-3">
                      {group.cards.map((card) => (
                        <KanbanCardItem
                          key={card.id}
                          card={card}
                          onClick={() => handleCardClick(card)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---- Card display ----
interface KanbanCardItemProps {
  card: EnrichedCard;
  onClick: () => void;
}

const KanbanCardItem = ({ card, onClick }: KanbanCardItemProps) => {
  const statusKey = card.conversationStatus ?? "";
  const statusLabel = STATUS_LABELS[statusKey] ?? (statusKey || "Sem conversa");
  const statusColor = STATUS_COLORS[statusKey] ?? "bg-slate-100 text-slate-600";

  return (
    <Card
      className={cn(
        "w-64 shrink-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer",
        card.conversationId && "hover:border-blue-300"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-3">
        {/* Contact name + phone */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate" title={card.contactName}>
              {card.contactName}
            </p>
            {card.phone && (
              <p className="text-xs text-muted-foreground truncate">{card.phone}</p>
            )}
          </div>
          {card.unreadCount > 0 && (
            <span className="shrink-0 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {card.unreadCount > 99 ? "99+" : card.unreadCount}
            </span>
          )}
        </div>

        {/* Column badge */}
        <Badge
          className="text-xs text-white w-full justify-center"
          style={{ backgroundColor: card.columnColor }}
        >
          {card.columnName}
        </Badge>

        {/* Conversation status */}
        <div className="flex items-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className={cn("text-xs px-1.5 py-0.5 rounded-full", statusColor)}>
            {statusLabel}
          </span>
        </div>

        {/* Last message */}
        {card.lastMessageAt && (
          <p className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(card.lastMessageAt), {
              addSuffix: true,
              locale: ptBR,
            })}
          </p>
        )}

        {/* Navigate hint */}
        {card.conversationId && (
          <div className="flex items-center justify-end pt-1 border-t border-border">
            <span className="text-xs text-blue-500 flex items-center gap-0.5">
              Abrir conversa
              <ChevronRight className="h-3 w-3" />
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default KanbanQueues;
