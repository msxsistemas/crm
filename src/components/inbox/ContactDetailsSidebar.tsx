import { useState, useEffect, useRef, useCallback } from "react";
import { X, Phone, Hash, Calendar, User, StickyNote, History, MessageCircle, Clock, TrendingUp, Send, ChevronDown, ChevronUp, Cake } from "lucide-react";
import TagSelector from "@/components/shared/TagSelector";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";

interface ContactDetailsSidebarProps {
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  contactAvatar: string | null;
  conversationId: string;
  conversationCreatedAt: string;
  onClose: () => void;
  customFields?: Record<string, string> | null;
}

interface ConversationNote {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profiles: { full_name: string | null } | null;
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

interface AgentProfile {
  id: string;
  name: string;
}

interface CampaignHistoryItem {
  id: string;
  status: string;
  sent_at: string | null;
  campaigns: { id: string; name: string } | null;
}

type TimelineItemType = "conversation" | "schedule" | "opportunity";

interface TimelineItem {
  id: string;
  type: TimelineItemType;
  created_at: string;
  // conversation fields
  status?: string;
  instance_name?: string;
  // schedule fields
  message?: string;
  send_at?: string;
  // opportunity fields
  title?: string;
  value?: number;
  opp_status?: string;
}

function isBirthdayToday(birthday: string | null): boolean {
  if (!birthday) return false;
  const today = new Date();
  const bday = new Date(birthday);
  return bday.getMonth() === today.getMonth() && bday.getDate() === today.getDate();
}

function formatBirthday(birthday: string): string {
  const d = new Date(birthday);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

/** Render note content, highlighting @mentions in blue */
function renderNoteContent(content: string) {
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, i) =>
    /^@\w+$/.test(part) ? (
      <span key={i} className="text-blue-600 font-medium dark:text-blue-400">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function getLeadScoreBadge(score: number | null) {
  if (score == null) return null;
  if (score >= 76) return { label: 'Muito Quente', emoji: '🔥', className: 'bg-red-100 text-red-700 border-red-200' };
  if (score >= 51) return { label: 'Quente', emoji: '🟢', className: 'bg-green-100 text-green-700 border-green-200' };
  if (score >= 26) return { label: 'Morno', emoji: '🟡', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
  return { label: 'Frio', emoji: '🔴', className: 'bg-blue-100 text-blue-700 border-blue-200' };
}

const ContactDetailsSidebar = ({
  contactId,
  contactName,
  contactPhone,
  contactAvatar,
  conversationId,
  conversationCreatedAt,
  onClose,
  customFields,
}: ContactDetailsSidebarProps) => {
  const [kanbanInfo, setKanbanInfo] = useState<{ boardName: string; columnName: string; columnColor: string } | null>(null);
  const [leadScore, setLeadScore] = useState<number | null>(null);
  const [birthday, setBirthday] = useState<string | null>(null);
  const [previousCount, setPreviousCount] = useState(0);
  const [notes, setNotes] = useState<ConversationNote[]>([]);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [campaignHistory, setCampaignHistory] = useState<CampaignHistoryItem[]>([]);
  const [campaignHistoryOpen, setCampaignHistoryOpen] = useState(false);
  const [auditEvents, setAuditEvents] = useState<{ id: string; event_type: string; actor_name: string | null; old_value: string | null; new_value: string | null; created_at: string }[]>([]);
  const [auditOpen, setAuditOpen] = useState(false);

  // @mention states
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<AgentProfile[]>([]);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);

  // Load agents on mount
  useEffect(() => {
    db
      .from("profiles")
      .select("id, full_name")
      .then(({ data }) => {
        if (data) {
          setAgents(
            data
              .filter((p: any) => p.full_name)
              .map((p: any) => ({ id: p.id, name: p.full_name as string }))
          );
        }
      });
  }, []);

  // Filter mention results when mentionQuery changes
  useEffect(() => {
    if (mentionQuery === null) {
      setMentionResults([]);
      return;
    }
    const q = mentionQuery.toLowerCase();
    setMentionResults(agents.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 6));
    setMentionIndex(0);
  }, [mentionQuery, agents]);

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNoteText(val);

    // Detect @mention
    const cursor = e.target.selectionStart ?? val.length;
    const textUpToCursor = val.slice(0, cursor);
    const match = textUpToCursor.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
    } else {
      setMentionQuery(null);
    }
  };

  const handleNoteKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, mentionResults.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        insertMention(mentionResults[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }
  };

  const insertMention = useCallback(
    (agent: AgentProfile) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const cursor = textarea.selectionStart ?? noteText.length;
      const before = noteText.slice(0, cursor);
      const after = noteText.slice(cursor);
      // Replace the partial @query with @fullname
      const replaced = before.replace(/@(\w*)$/, `@${agent.name.split(" ")[0]} `);
      const newText = replaced + after;
      setNoteText(newText);
      setMentionQuery(null);
      // Restore focus
      setTimeout(() => {
        textarea.focus();
        const newCursor = replaced.length;
        textarea.setSelectionRange(newCursor, newCursor);
      }, 0);
    },
    [noteText]
  );

  const loadTimeline = async () => {
    setTimelineLoading(true);
    try {
      const items: TimelineItem[] = [];

      // Conversations
      const { data: convs } = await db
        .from("conversations")
        .select("id, status, created_at, updated_at, instance_name")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (convs) {
        for (const c of convs) {
          items.push({
            id: c.id,
            type: "conversation",
            created_at: c.created_at,
            status: c.status,
            instance_name: c.instance_name,
          });
        }
      }

      // Schedules (by contact phone)
      const { data: scheds } = await db
        .from("schedules")
        .select("id, message, send_at, status, created_at")
        .eq("contact_phone", contactPhone)
        .order("created_at", { ascending: false })
        .limit(5);

      if (scheds) {
        for (const s of scheds) {
          items.push({
            id: s.id,
            type: "schedule",
            created_at: s.created_at,
            message: s.message,
            send_at: s.send_at,
            status: s.status,
          });
        }
      }

      // Opportunities
      const { data: opps } = await db
        .from("opportunities")
        .select("id, title, value, status, created_at")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(5);

      if (opps) {
        for (const o of opps) {
          items.push({
            id: o.id,
            type: "opportunity",
            created_at: o.created_at,
            title: o.title,
            value: o.value ?? 0,
            opp_status: o.status,
          });
        }
      }

      // Sort by created_at descending
      items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTimeline(items);
    } catch (err) {
      console.error("Timeline load error:", err);
    } finally {
      setTimelineLoading(false);
    }
  };

  const loadNotes = async (convId: string) => {
    const { data } = await db
      .from("conversation_notes")
      .select("id, content, created_at, user_id, profiles(full_name)")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false });
    setNotes((data as unknown as ConversationNote[]) || []);
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const { data: userData } = await db.auth.getUser();
      if (!userData.user) return;

      const content = noteText.trim();

      await db.from("conversation_notes").insert({
        conversation_id: conversationId,
        user_id: userData.user.id,
        content,
      });

      // Parse @mentions and insert notifications
      const mentionRegex = /@(\w+)/g;
      let match: RegExpExecArray | null;
      while ((match = mentionRegex.exec(content)) !== null) {
        const mentionedFirstName = match[1].toLowerCase();
        const agent = agents.find(
          (a) => a.name.split(" ")[0].toLowerCase() === mentionedFirstName
        );
        if (agent) {
          await db.from("notifications").insert({
            user_id: agent.id,
            title: "Você foi mencionado",
            body: content.substring(0, 100),
            type: "mention",
            reference_id: conversationId,
          });
        }
      }

      setNoteText("");
      setMentionQuery(null);
      await loadNotes(conversationId);
    } finally {
      setSavingNote(false);
    }
  };

  const formatRelativeDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    if (diffMin < 1) return "agora";
    if (diffMin < 60) return `há ${diffMin}min`;
    if (diffHour < 24) return `há ${diffHour}h`;
    if (diffDay === 1) return "ontem";
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  useEffect(() => {
    const load = async () => {
      // Load lead score and birthday
      const { data: contactData } = await db
        .from("contacts")
        .select("lead_score, birthday")
        .eq("id", contactId)
        .maybeSingle();
      if (contactData) {
        setLeadScore((contactData as any).lead_score ?? null);
        setBirthday((contactData as any).birthday ?? null);
      }

      // Try to find kanban card for this contact
      const { data: cards } = await db
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
      const { count } = await db
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contactId);
      setPreviousCount((count || 1) - 1);

      // Load notes for this conversation
      await loadNotes(conversationId);

      // Load timeline
      await loadTimeline();

      // Load campaign history
      const { data: campData } = await db
        .from("campaign_contacts")
        .select("id, status, sent_at, campaigns(id, name)")
        .eq("contact_id", contactId)
        .order("sent_at", { ascending: false })
        .limit(10);
      setCampaignHistory((campData as unknown as CampaignHistoryItem[]) || []);

      // Load audit events for this conversation
      const { data: evtData } = await db
        .from("conversation_events")
        .select("id, event_type, actor_name, old_value, new_value, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(30);
      setAuditEvents((evtData as any[]) || []);
    };
    load();
  }, [contactId, conversationId]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatSendAt = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const oppStatusLabel: Record<string, string> = {
    prospecting: "Prospecção",
    qualification: "Qualificação",
    proposal: "Proposta",
    negotiation: "Negociação",
    won: "Ganho",
    lost: "Perdido",
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

      {/* Birthday Banner */}
      {birthday && isBirthdayToday(birthday) && (
        <div className="mx-3 mt-3 bg-pink-50 border border-pink-200 dark:bg-pink-950/20 dark:border-pink-800 rounded-lg px-3 py-2.5 flex items-center gap-2">
          <span className="text-xl leading-none">🎉</span>
          <p className="text-xs font-semibold text-pink-700 dark:text-pink-300">
            Hoje é o aniversário de {contactName || contactPhone}!
          </p>
        </div>
      )}

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
        {leadScore != null && (() => {
          const badge = getLeadScoreBadge(leadScore);
          if (!badge) return null;
          return (
            <span
              className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${badge.className}`}
              title="Score calculado com base em engajamento"
            >
              {badge.emoji} Score: {leadScore} — {badge.label}
            </span>
          );
        })()}
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

        {birthday && (
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-pink-100 dark:bg-pink-950/30 flex items-center justify-center shrink-0">
              <Cake className="h-4 w-4 text-pink-500" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Aniversário</p>
              <p className="text-sm font-medium text-foreground">
                🎂 {formatBirthday(birthday)}
                {isBirthdayToday(birthday) && (
                  <span className="ml-1.5 text-[10px] font-semibold text-pink-600 bg-pink-100 px-1.5 py-0.5 rounded-full">Hoje!</span>
                )}
              </p>
            </div>
          </div>
        )}
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
        <div className="flex items-center gap-2 mb-3">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Notas Internas</span>
        </div>

        {/* Notes list */}
        <div className="max-h-[220px] overflow-y-auto space-y-2 mb-3">
          {notes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma nota ainda</p>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="bg-muted/50 rounded-md p-2.5 space-y-0.5">
                <p className="text-[11px] text-muted-foreground font-medium">
                  {note.profiles?.full_name || "Usuário"}
                </p>
                <p className="text-xs text-foreground whitespace-pre-wrap">
                  {renderNoteContent(note.content)}
                </p>
                <p className="text-[10px] text-muted-foreground">{formatRelativeDate(note.created_at)}</p>
              </div>
            ))
          )}
        </div>

        {/* Add note */}
        <div className="space-y-2 relative">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={noteText}
              onChange={handleNoteChange}
              onKeyDown={handleNoteKeyDown}
              placeholder="Adicionar nota interna... (use @ para mencionar)"
              rows={3}
              className="w-full text-xs rounded-md border border-border bg-background px-2.5 py-2 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />

            {/* @mention dropdown */}
            {mentionQuery !== null && mentionResults.length > 0 && (
              <div
                ref={mentionListRef}
                className="absolute bottom-full left-0 mb-1 w-full bg-popover border border-border rounded-md shadow-lg z-50 overflow-hidden"
              >
                {mentionResults.map((agent, idx) => {
                  const avatarInitials = agent.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .substring(0, 2)
                    .toUpperCase();
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertMention(agent);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                        idx === mentionIndex
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                        {avatarInitials}
                      </div>
                      <span>{agent.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <Button
            size="sm"
            className="w-full h-7 text-xs"
            onClick={handleAddNote}
            disabled={savingNote || !noteText.trim()}
          >
            {savingNote ? "Salvando..." : "Adicionar nota"}
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Timeline</span>
        </div>

        <div className="max-h-[280px] overflow-y-auto">
          {timelineLoading ? (
            <p className="text-xs text-muted-foreground">Carregando...</p>
          ) : timeline.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma interação registrada</p>
          ) : (
            <div className="relative pl-5 space-y-3">
              {/* Vertical line */}
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

              {timeline.map((item) => {
                let icon: React.ReactNode;
                let dotColor: string;
                let content: React.ReactNode;

                if (item.type === "conversation") {
                  dotColor = "bg-blue-500";
                  icon = <MessageCircle className="h-3 w-3 text-blue-500" />;
                  const statusLabels: Record<string, string> = {
                    open: "Aberta",
                    closed: "Encerrada",
                    pending: "Pendente",
                  };
                  content = (
                    <>
                      <p className="text-xs font-medium text-foreground">
                        Conversa {statusLabels[item.status || ""] || item.status}
                      </p>
                      {item.instance_name && (
                        <p className="text-[10px] text-muted-foreground">{item.instance_name}</p>
                      )}
                    </>
                  );
                } else if (item.type === "schedule") {
                  dotColor = "bg-orange-500";
                  icon = <Clock className="h-3 w-3 text-orange-500" />;
                  const preview = (item.message || "").substring(0, 40) + ((item.message || "").length > 40 ? "…" : "");
                  content = (
                    <>
                      <p className="text-xs font-medium text-foreground">{preview || "Agendamento"}</p>
                      {item.send_at && (
                        <p className="text-[10px] text-muted-foreground">
                          Envio: {formatSendAt(item.send_at)}
                        </p>
                      )}
                    </>
                  );
                } else {
                  dotColor = "bg-green-500";
                  icon = <TrendingUp className="h-3 w-3 text-green-500" />;
                  content = (
                    <>
                      <p className="text-xs font-medium text-foreground">{item.title || "Oportunidade"}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.value !== undefined && (
                          <p className="text-[10px] text-muted-foreground">
                            R$ {item.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                        )}
                        {item.opp_status && (
                          <span className="text-[9px] px-1.5 py-0 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 font-medium">
                            {oppStatusLabel[item.opp_status] || item.opp_status}
                          </span>
                        )}
                      </div>
                    </>
                  );
                }

                return (
                  <div key={`${item.type}-${item.id}`} className="flex items-start gap-2.5 relative">
                    {/* Dot */}
                    <div
                      className={`h-3.5 w-3.5 rounded-full border-2 border-background ${dotColor} flex items-center justify-center shrink-0 -ml-5 mt-0.5 z-10`}
                    />
                    {/* Content */}
                    <div className="flex-1 min-w-0 pl-1">
                      {content}
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatRelativeDate(item.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Previous conversations */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Conversas Anteriores</span>
        </div>
        <p className="text-xs text-muted-foreground ml-6">
          {previousCount > 0 ? `${previousCount} conversa(s) anterior(es)` : "Primeiro atendimento deste contato"}
        </p>
      </div>

      {/* Campaign History */}
      <div className="px-4 py-3 border-b border-border">
        <button
          className="flex items-center justify-between w-full"
          onClick={() => setCampaignHistoryOpen((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              Campanhas Recebidas ({campaignHistory.length})
            </span>
          </div>
          {campaignHistoryOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {campaignHistoryOpen && (
          <div className="mt-3 space-y-2">
            {campaignHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma campanha enviada para este contato</p>
            ) : (
              campaignHistory.map((item) => {
                const statusConfig: Record<string, { label: string; className: string }> = {
                  sent: { label: "Enviado", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
                  delivered: { label: "Enviado", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
                  failed: { label: "Erro", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
                  pending: { label: "Pendente", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
                };
                const cfg = statusConfig[item.status] ?? statusConfig["pending"];
                return (
                  <div key={item.id} className="flex items-start justify-between gap-2 py-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">
                        {item.campaigns?.name || "Campanha"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.sent_at ? formatRelativeDate(item.sent_at) : "—"}
                      </p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${cfg.className}`}>
                      {cfg.label}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Audit Trail */}
      {auditEvents.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <button
            className="flex items-center justify-between w-full"
            onClick={() => setAuditOpen((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Auditoria ({auditEvents.length})</span>
            </div>
            {auditOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {auditOpen && (
            <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
              {auditEvents.map((evt) => {
                const typeLabels: Record<string, string> = {
                  created: "Conversa criada",
                  status_changed: "Status alterado",
                  assigned: "Atribuído",
                  unassigned: "Desatribuído",
                  note_added: "Nota adicionada",
                };
                const label = typeLabels[evt.event_type] || evt.event_type;
                const detail = evt.event_type === "status_changed"
                  ? `${evt.old_value || "?"} → ${evt.new_value || "?"}`
                  : evt.new_value
                  ? evt.new_value.slice(0, 60)
                  : null;
                return (
                  <div key={evt.id} className="flex items-start gap-2 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{label}</p>
                      {detail && <p className="text-muted-foreground truncate">{detail}</p>}
                      <p className="text-[10px] text-muted-foreground">
                        {evt.actor_name || "Sistema"} · {new Date(evt.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Custom Fields */}
      {customFields && Object.keys(customFields).length > 0 && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Campos Customizados</span>
          </div>
          <div className="space-y-1.5 ml-6">
            {Object.entries(customFields).map(([key, value]) => (
              <div key={key} className="flex flex-wrap gap-1 text-xs">
                <span className="font-semibold text-foreground">{key}:</span>
                <span className="text-muted-foreground">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactDetailsSidebar;
