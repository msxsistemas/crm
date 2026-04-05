import { useState, useEffect, useCallback } from "react";
import {
  LayoutGrid, Filter, RefreshCw, User, Wifi, Tag, MessageCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// ---- Types ----
interface KanbanCardRaw {
  id: string;
  contact_id: string | null;
  name: string;
  phone: string | null;
  value: number | null;
  created_at: string;
  updated_at: string;
  column_id: string;
  column_name: string;
  column_color: string;
  board_id: string;
}

interface ContactRaw {
  id: string;
  name: string | null;
  phone: string;
}

interface ConversationRaw {
  id: string;
  contact_id: string;
  status: string;
  instance_name: string;
  assigned_to: string | null;
  last_message_at: string | null;
}

interface ProfileRaw {
  id: string;
  full_name: string | null;
}

interface TagRaw {
  id: string;
  name: string;
  color: string;
}

interface ContactTagRaw {
  contact_id: string;
  tag_id: string;
}

interface EnrichedCard {
  id: string;
  contactId: string | null;
  contactName: string;
  phone: string;
  columnName: string;
  columnColor: string;
  value: number;
  createdAt: string;
  conversationStatus: string | null;
  instanceName: string | null;
  assignedTo: string | null;
  assignedName: string | null;
  lastMessageAt: string | null;
  tags: string[];
}

interface Group {
  key: string;
  label: string;
  cards: EnrichedCard[];
  totalValue: number;
}

type GroupBy = "responsavel" | "conexao" | "status" | "tag";

const GROUP_OPTIONS: { value: GroupBy; label: string; icon: React.ReactNode }[] = [
  { value: "responsavel", label: "Por responsável", icon: <User className="w-4 h-4" /> },
  { value: "conexao", label: "Por conexão", icon: <Wifi className="w-4 h-4" /> },
  { value: "status", label: "Por status de conversa", icon: <MessageCircle className="w-4 h-4" /> },
  { value: "tag", label: "Por tag", icon: <Tag className="w-4 h-4" /> },
];

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
  "sem conversa": "bg-slate-100 text-slate-600",
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const KanbanGroups = () => {
  const { user } = useAuth();
  const [groupBy, setGroupBy] = useState<GroupBy>("responsavel");
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAndGroup = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Load kanban cards with column info via join
      const { data: cardsData, error: cardsError } = await db
        .from("kanban_cards")
        .select(`
          id,
          contact_id,
          name,
          phone,
          value,
          created_at,
          updated_at,
          column_id,
          kanban_columns!inner(id, name, color, board_id, kanban_boards!inner(user_id))
        `)
        .eq("kanban_columns.kanban_boards.user_id", user.id);

      if (cardsError) throw cardsError;

      // Normalize cards
      const cards: KanbanCardRaw[] = ((cardsData ?? []) as unknown[]).map((row: unknown) => {
        const r = row as Record<string, unknown>;
        const col = r["kanban_columns"] as Record<string, unknown>;
        return {
          id: r["id"] as string,
          contact_id: r["contact_id"] as string | null,
          name: r["name"] as string,
          phone: r["phone"] as string | null,
          value: r["value"] as number | null,
          created_at: r["created_at"] as string,
          updated_at: r["updated_at"] as string,
          column_id: r["column_id"] as string,
          column_name: col["name"] as string,
          column_color: col["color"] as string,
          board_id: col["board_id"] as string,
        };
      });

      if (cards.length === 0) {
        setGroups([]);
        setLoading(false);
        return;
      }

      // 2. Load contacts
      const contactIds = [...new Set(cards.map(c => c.contact_id).filter(Boolean))] as string[];
      let contactMap: Record<string, ContactRaw> = {};
      if (contactIds.length > 0) {
        const { data: cData } = await db
          .from("contacts")
          .select("id, name, phone")
          .in("id", contactIds);
        if (cData) {
          (cData as ContactRaw[]).forEach(c => { contactMap[c.id] = c; });
        }
      }

      // 3. Load conversations
      let convMap: Record<string, ConversationRaw> = {};
      if (contactIds.length > 0) {
        const { data: convData } = await db
          .from("conversations")
          .select("id, contact_id, status, instance_name, assigned_to, last_message_at")
          .in("contact_id", contactIds)
          .order("last_message_at", { ascending: false });
        if (convData) {
          // Keep latest per contact
          (convData as ConversationRaw[]).forEach(conv => {
            if (!convMap[conv.contact_id]) convMap[conv.contact_id] = conv;
          });
        }
      }

      // 4. Load profiles for agent names
      const assignedIds = [...new Set(
        Object.values(convMap).map(c => c.assigned_to).filter(Boolean)
      )] as string[];
      let profileMap: Record<string, string> = {};
      if (assignedIds.length > 0) {
        const { data: profData } = await db
          .from("profiles")
          .select("id, full_name")
          .in("id", assignedIds);
        if (profData) {
          (profData as ProfileRaw[]).forEach(p => {
            profileMap[p.id] = p.full_name ?? p.id.slice(0, 8);
          });
        }
      }

      // 5. Load tags (only when groupBy=tag)
      let contactTagsMap: Record<string, string[]> = {};
      if (groupBy === "tag" && contactIds.length > 0) {
        const { data: ctData } = await db
          .from("contact_tags")
          .select("contact_id, tag_id")
          .in("contact_id", contactIds);
        if (ctData) {
          const tagIds = [...new Set((ctData as ContactTagRaw[]).map(ct => ct.tag_id))];
          let tagNameMap: Record<string, string> = {};
          if (tagIds.length > 0) {
            const { data: tData } = await db
              .from("tags")
              .select("id, name, color")
              .in("id", tagIds);
            if (tData) {
              (tData as TagRaw[]).forEach(t => { tagNameMap[t.id] = t.name; });
            }
          }
          (ctData as ContactTagRaw[]).forEach(ct => {
            if (!contactTagsMap[ct.contact_id]) contactTagsMap[ct.contact_id] = [];
            contactTagsMap[ct.contact_id].push(tagNameMap[ct.tag_id] ?? ct.tag_id);
          });
        }
      }

      // 6. Enrich cards
      const enriched: EnrichedCard[] = cards.map(card => {
        const contact = card.contact_id ? contactMap[card.contact_id] : null;
        const conv = card.contact_id ? convMap[card.contact_id] : null;
        const assignedTo = conv?.assigned_to ?? null;
        return {
          id: card.id,
          contactId: card.contact_id,
          contactName: contact?.name ?? card.name,
          phone: contact?.phone ?? card.phone ?? "",
          columnName: card.column_name,
          columnColor: card.column_color,
          value: card.value ?? 0,
          createdAt: card.created_at,
          conversationStatus: conv?.status ?? null,
          instanceName: conv?.instance_name ?? null,
          assignedTo: assignedTo,
          assignedName: assignedTo ? (profileMap[assignedTo] ?? assignedTo.slice(0, 8)) : null,
          lastMessageAt: conv?.last_message_at ?? null,
          tags: card.contact_id ? (contactTagsMap[card.contact_id] ?? []) : [],
        };
      });

      // 7. Group
      const groupMap: Record<string, EnrichedCard[]> = {};

      enriched.forEach(card => {
        let keys: string[] = [];

        if (groupBy === "responsavel") {
          keys = [card.assignedName ?? "Sem responsável"];
        } else if (groupBy === "conexao") {
          keys = [card.instanceName ?? "Sem conexão"];
        } else if (groupBy === "status") {
          const s = card.conversationStatus ?? "sem conversa";
          keys = [s];
        } else if (groupBy === "tag") {
          keys = card.tags.length > 0 ? card.tags : ["Sem tag"];
        }

        keys.forEach(key => {
          if (!groupMap[key]) groupMap[key] = [];
          groupMap[key].push(card);
        });
      });

      const result: Group[] = Object.entries(groupMap)
        .map(([key, cards]) => ({
          key,
          label: groupBy === "status" ? (STATUS_LABELS[key] ?? key) : key,
          cards,
          totalValue: cards.reduce((s, c) => s + c.value, 0),
        }))
        .sort((a, b) => b.cards.length - a.cards.length);

      setGroups(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar dados";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [user, groupBy]);

  useEffect(() => {
    fetchAndGroup();
  }, [fetchAndGroup]);

  const selectedOption = GROUP_OPTIONS.find(o => o.value === groupBy);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-blue-600">Kanban — Agrupamentos</h1>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="w-52">
              <SelectValue>
                <span className="flex items-center gap-2">
                  {selectedOption?.icon}
                  {selectedOption?.label}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {GROUP_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  <span className="flex items-center gap-2">
                    {opt.icon}
                    {opt.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={fetchAndGroup} disabled={loading} title="Atualizar">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-20 text-muted-foreground">Carregando...</div>
      ) : groups.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <LayoutGrid className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Nenhum card encontrado</p>
          <p className="text-sm mt-1">Adicione contatos ao Kanban e selecione um agrupamento</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.key} className="space-y-3">
              {/* Swimlane header */}
              <div className="flex items-center gap-3 pb-1 border-b">
                <span className="font-semibold text-base">{group.label}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {group.cards.length} card{group.cards.length !== 1 ? "s" : ""}
                </span>
                {group.totalValue > 0 && (
                  <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                    {formatCurrency(group.totalValue)}
                  </span>
                )}
              </div>

              {/* Horizontal scrollable cards */}
              <div className="flex gap-3 overflow-x-auto pb-2">
                {group.cards.map(card => (
                  <KanbanCardDisplay key={`${group.key}-${card.id}`} card={card} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---- Card display component ----
const KanbanCardDisplay = ({ card }: { card: EnrichedCard }) => {
  const statusKey = card.conversationStatus ?? "sem conversa";
  const statusLabel = STATUS_LABELS[statusKey] ?? statusKey;
  const statusColor = STATUS_COLORS[statusKey] ?? "bg-slate-100 text-slate-600";

  const daysInStage = Math.floor(
    (Date.now() - new Date(card.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Card className="w-64 shrink-0 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        {/* Contact name + column badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{card.contactName}</p>
            {card.phone && (
              <p className="text-xs text-muted-foreground truncate">{card.phone}</p>
            )}
          </div>
          <Badge
            className="shrink-0 text-xs text-white"
            style={{ backgroundColor: card.columnColor }}
          >
            {card.columnName}
          </Badge>
        </div>

        {/* Conversation status */}
        <div className="flex items-center gap-1.5">
          <MessageCircle className="w-3.5 h-3.5 text-muted-foreground" />
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusColor}`}>
            {statusLabel}
          </span>
        </div>

        {/* Last message */}
        {card.lastMessageAt && (
          <p className="text-xs text-muted-foreground">
            Última mensagem:{" "}
            {formatDistanceToNow(new Date(card.lastMessageAt), {
              addSuffix: true,
              locale: ptBR,
            })}
          </p>
        )}

        {/* Connection */}
        {card.instanceName && (
          <div className="flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">{card.instanceName}</span>
          </div>
        )}

        {/* Tags */}
        {card.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {card.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded-full">
                {tag}
              </span>
            ))}
            {card.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">+{card.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Footer: assigned + days */}
        <div className="flex items-center justify-between pt-1 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1 truncate">
            <User className="w-3 h-3 shrink-0" />
            <span className="truncate">{card.assignedName ?? "Sem responsável"}</span>
          </div>
          <span className="shrink-0 ml-1">{daysInStage}d</span>
        </div>
      </CardContent>
    </Card>
  );
};

export default KanbanGroups;
