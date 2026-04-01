import { useState, useEffect } from "react";
import { X, Phone, Hash, Calendar, User, StickyNote, History } from "lucide-react";
import TagSelector from "@/components/shared/TagSelector";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface ContactDetailsSidebarProps {
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  contactAvatar: string | null;
  conversationId: string;
  conversationCreatedAt: string;
  onClose: () => void;
}

interface KanbanCard {
  id: string;
  column_id: string;
  kanban_columns: {
    name: string;
    color: string;
    board_id: string;
    kanban_boards: {
      name: string;
    };
  };
}

const ContactDetailsSidebar = ({
  contactId,
  contactName,
  contactPhone,
  contactAvatar,
  conversationId,
  conversationCreatedAt,
  onClose,
}: ContactDetailsSidebarProps) => {
  const [kanbanInfo, setKanbanInfo] = useState<{ boardName: string; columnName: string; columnColor: string } | null>(null);
  const [previousCount, setPreviousCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      // Try to find kanban card for this contact
      const { data: cards } = await supabase
        .from("kanban_cards")
        .select("id, column_id, kanban_columns(name, color, board_id, kanban_boards(name))")
        .eq("contact_id", contactId)
        .limit(1);

      if (cards && cards.length > 0) {
        const card = cards[0] as unknown as KanbanCard;
        setKanbanInfo({
          boardName: card.kanban_columns?.kanban_boards?.name || "Vendas",
          columnName: card.kanban_columns?.name || "",
          columnColor: card.kanban_columns?.color || "#8B5CF6",
        });
      }

      // Count previous conversations
      const { count } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contactId);
      setPreviousCount((count || 1) - 1);
    };
    load();
  }, [contactId]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const initials = contactName
    ? contactName.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()
    : contactPhone.substring(contactPhone.length - 2);

  return (
    <div className="w-[320px] border-l border-border bg-card flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Detalhes</h2>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Contact info */}
      <div className="flex flex-col items-center py-6 px-4 border-b border-border">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary mb-3">
          {contactAvatar ? (
            <img src={contactAvatar} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <p className="text-sm font-semibold text-foreground">{contactName || contactPhone}</p>
        <p className="text-xs text-muted-foreground">{contactPhone}</p>
      </div>

      {/* Details */}
      <div className="px-4 py-3 space-y-3 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Phone className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Telefone</p>
            <p className="text-sm font-medium text-foreground">{contactPhone}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Hash className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Protocolo</p>
            <p className="text-sm font-medium text-foreground">{conversationId.substring(0, 18)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Calendar className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Iniciado em</p>
            <p className="text-sm font-medium text-foreground">{formatDate(conversationCreatedAt)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Atendente</p>
            <p className="text-sm font-medium text-foreground">—</p>
          </div>
        </div>
      </div>

      {/* Kanban */}
      {kanbanInfo && (
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 mb-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Funil / Kanban</span>
          </div>
          <div className="space-y-2 ml-6">
            <div>
              <p className="text-[11px] text-muted-foreground">Board</p>
              <p className="text-sm text-foreground">📈 {kanbanInfo.boardName}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Coluna</p>
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: kanbanInfo.columnColor }} />
                <span className="text-sm text-foreground">{kanbanInfo.columnName}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tags */}
      <div className="px-4 py-3 border-b border-border">
        <TagSelector contactId={contactId} />
      </div>

      {/* Notes */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Notas Internas</span>
          </div>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground">+</Button>
        </div>
        <div className="bg-muted/50 rounded-md p-2.5">
          <p className="text-xs text-muted-foreground">Clique para adicionar uma nota...</p>
        </div>
      </div>

      {/* Previous conversations */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Conversas Anteriores</span>
        </div>
        <p className="text-xs text-muted-foreground ml-6">
          {previousCount > 0 ? `${previousCount} conversa(s) anterior(es)` : "Primeiro atendimento deste contato"}
        </p>
      </div>
    </div>
  );
};

export default ContactDetailsSidebar;
