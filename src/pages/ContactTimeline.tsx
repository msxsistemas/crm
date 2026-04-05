import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft,
  MessageSquare,
  FileText,
  Send,
  DollarSign,
  Tag,
  Pencil,
  Phone,
  Mail,
  Calendar,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { db } from "@/lib/db";
import { toast } from "sonner";

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  avatar_url: string | null;
  email: string | null;
  tags: string[] | null;
  custom_fields: Record<string, string> | null;
  created_at: string;
  state: string | null;
  city: string | null;
}

type TimelineEvent =
  | { type: "conversation"; id: string; status: string; created_at: string; assigned_to_name?: string }
  | { type: "message"; id: string; content: string; created_at: string; direction: "inbound" | "outbound" }
  | { type: "note"; id: string; content: string; created_at: string; author_name: string }
  | { type: "campaign"; id: string; campaign_name: string; status: string; sent_at: string }
  | { type: "opportunity"; id: string; title: string; value: number; stage: string; created_at: string }
  | { type: "tag_change"; id: string; tags: string[]; created_at: string };

const AVATAR_COLORS = [
  "bg-pink-400", "bg-green-500", "bg-blue-500", "bg-purple-500",
  "bg-red-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500",
];

const getAvatarColor = (id: string) => AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];

const getInitials = (name: string | null) => {
  if (name && name.trim()) return name.trim().charAt(0).toUpperCase();
  return "C";
};

const formatDate = (d: string) => {
  try {
    return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return d;
  }
};

const relativeTime = (d: string) => {
  try {
    return formatDistanceToNow(new Date(d), { locale: ptBR, addSuffix: true });
  } catch {
    return "";
  }
};

const conversationStatusLabel = (status: string) => {
  const map: Record<string, { label: string; className: string }> = {
    open: { label: "Aberta", className: "bg-green-100 text-green-700 border-green-200" },
    pending: { label: "Pendente", className: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    resolved: { label: "Resolvida", className: "bg-gray-100 text-gray-600 border-gray-200" },
    closed: { label: "Fechada", className: "bg-red-100 text-red-600 border-red-200" },
  };
  return map[status] || { label: status, className: "bg-blue-100 text-blue-700 border-blue-200" };
};

const opportunityStageLabel = (stage: string) => stage;

const formatCurrency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ContactTimeline() {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();

  const [contact, setContact] = useState<Contact | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!contactId) return;
    loadData();
  }, [contactId]);

  const loadData = async () => {
    if (!contactId) return;
    setLoading(true);
    try {
      const [
        { data: contactData, error: contactError },
        { data: conversationsData },
        { data: campaignsData },
        { data: opportunitiesData },
      ] = await Promise.all([
        db.from("contacts").select("*").eq("id", contactId).single(),
        db
          .from("conversations")
          .select("id, status, created_at, assigned_to, profiles(name)")
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false }),
        db
          .from("campaign_contacts")
          .select("id, status, sent_at, campaigns(name)")
          .eq("contact_id", contactId),
        db
          .from("opportunities")
          .select("*")
          .eq("contact_id", contactId),
      ]);

      if (contactError || !contactData) {
        toast.error("Contato não encontrado");
        navigate("/contatos");
        return;
      }

      setContact(contactData as Contact);

      // Fetch notes for all conversations
      const convIds = (conversationsData || []).map((c: any) => c.id);
      let notesData: any[] = [];
      if (convIds.length > 0) {
        const { data: n } = await db
          .from("conversation_notes")
          .select("*")
          .in("conversation_id", convIds);
        notesData = n || [];
      }

      const allEvents: TimelineEvent[] = [];

      // Conversations
      for (const c of conversationsData || []) {
        const profileName = (c as any).profiles?.name || undefined;
        allEvents.push({
          type: "conversation",
          id: c.id,
          status: c.status,
          created_at: c.created_at,
          assigned_to_name: profileName,
        });
      }

      // Notes
      for (const n of notesData) {
        allEvents.push({
          type: "note",
          id: n.id,
          content: n.content || "",
          created_at: n.created_at,
          author_name: n.author_name || "Sistema",
        });
      }

      // Campaigns
      for (const cc of campaignsData || []) {
        const campaignName = (cc as any).campaigns?.name || "Campanha";
        allEvents.push({
          type: "campaign",
          id: cc.id,
          campaign_name: campaignName,
          status: cc.status || "",
          sent_at: cc.sent_at || cc.created_at || "",
        });
      }

      // Opportunities
      for (const op of opportunitiesData || []) {
        allEvents.push({
          type: "opportunity",
          id: op.id,
          title: op.title || "Oportunidade",
          value: Number(op.value) || 0,
          stage: op.stage || "",
          created_at: op.created_at,
        });
      }

      // Sort by date descending
      allEvents.sort((a, b) => {
        const dateA = a.type === "campaign" ? (a as any).sent_at : (a as any).created_at;
        const dateB = b.type === "campaign" ? (b as any).sent_at : (b as any).created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });

      setEvents(allEvents);
    } catch (err: any) {
      toast.error("Erro ao carregar timeline: " + (err?.message || ""));
    } finally {
      setLoading(false);
    }
  };

  const toggleNote = (id: string) => {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getEventDate = (event: TimelineEvent): string => {
    if (event.type === "campaign") return event.sent_at;
    return (event as any).created_at;
  };

  const renderEventIcon = (event: TimelineEvent) => {
    switch (event.type) {
      case "conversation":
        return (
          <div className="w-8 h-8 rounded-full bg-blue-100 border-2 border-blue-400 flex items-center justify-center">
            <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
          </div>
        );
      case "note":
        return (
          <div className="w-8 h-8 rounded-full bg-yellow-100 border-2 border-yellow-400 flex items-center justify-center">
            <FileText className="w-3.5 h-3.5 text-yellow-600" />
          </div>
        );
      case "campaign":
        return (
          <div className="w-8 h-8 rounded-full bg-purple-100 border-2 border-purple-400 flex items-center justify-center">
            <Send className="w-3.5 h-3.5 text-purple-600" />
          </div>
        );
      case "opportunity":
        return (
          <div className="w-8 h-8 rounded-full bg-green-100 border-2 border-green-400 flex items-center justify-center">
            <DollarSign className="w-3.5 h-3.5 text-green-600" />
          </div>
        );
      case "tag_change":
        return (
          <div className="w-8 h-8 rounded-full bg-orange-100 border-2 border-orange-400 flex items-center justify-center">
            <Tag className="w-3.5 h-3.5 text-orange-600" />
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-gray-300 flex items-center justify-center">
            <Clock className="w-3.5 h-3.5 text-gray-500" />
          </div>
        );
    }
  };

  const renderEventContent = (event: TimelineEvent) => {
    switch (event.type) {
      case "conversation": {
        const statusInfo = conversationStatusLabel(event.status);
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">Conversa iniciada</span>
            <Badge className={`text-xs border ${statusInfo.className}`}>{statusInfo.label}</Badge>
            {event.assigned_to_name && (
              <span className="text-xs text-muted-foreground">• Agente: {event.assigned_to_name}</span>
            )}
          </div>
        );
      }
      case "note": {
        const isExpanded = expandedNotes.has(event.id);
        const content = event.content || "";
        const truncated = content.length > 150 && !isExpanded;
        return (
          <div>
            <p className="text-xs text-muted-foreground mb-1">
              Nota por <span className="font-medium text-foreground">{event.author_name}</span>
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap">
              {truncated ? content.slice(0, 150) + "..." : content}
            </p>
            {content.length > 150 && (
              <button
                className="text-xs text-blue-600 hover:underline mt-1"
                onClick={() => toggleNote(event.id)}
              >
                {isExpanded ? "ver menos" : "ver mais"}
              </button>
            )}
          </div>
        );
      }
      case "campaign": {
        const statusMap: Record<string, string> = {
          sent: "Enviada",
          pending: "Pendente",
          failed: "Falhou",
          delivered: "Entregue",
          read: "Lida",
        };
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              Campanha: <span className="text-purple-600">{event.campaign_name}</span>
            </span>
            {event.status && (
              <Badge className="text-xs bg-purple-100 text-purple-700 border-purple-200 border">
                {statusMap[event.status] || event.status}
              </Badge>
            )}
          </div>
        );
      }
      case "opportunity":
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              Oportunidade: <span className="text-green-600">{event.title}</span>
            </span>
            {event.value > 0 && (
              <Badge className="text-xs bg-green-100 text-green-700 border-green-200 border">
                {formatCurrency(event.value)}
              </Badge>
            )}
            {event.stage && (
              <span className="text-xs text-muted-foreground">• {opportunityStageLabel(event.stage)}</span>
            )}
          </div>
        );
      case "tag_change":
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">Tags atualizadas</span>
            {event.tags.map((t) => (
              <Badge key={t} className="text-xs bg-orange-100 text-orange-700 border-orange-200 border">
                {t}
              </Badge>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full py-32 text-muted-foreground">
        <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!contact) return null;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="mx-6 py-4 border-b border-border flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/contatos")} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-blue-600">Timeline do Contato</h1>
          <p className="text-xs text-muted-foreground">Histórico completo de interações</p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Left Column — Contact Card */}
        <div className="w-1/3 border-r border-border overflow-y-auto p-6 space-y-5">
          <div className="flex flex-col items-center gap-3 pb-5 border-b border-border">
            <Avatar className="h-20 w-20">
              <AvatarImage src={contact.avatar_url || undefined} />
              <AvatarFallback className={`${getAvatarColor(contact.id)} text-white text-2xl font-bold`}>
                {getInitials(contact.name)}
              </AvatarFallback>
            </Avatar>
            <div className="text-center">
              <h2 className="text-lg font-bold text-foreground">{contact.name || "Sem nome"}</h2>
              <p className="text-sm text-muted-foreground">{contact.phone}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => navigate("/contatos")}
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
          </div>

          {/* Info */}
          <div className="space-y-3">
            {contact.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-foreground truncate">{contact.email}</span>
              </div>
            )}
            {contact.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-foreground">{contact.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">
                Criado em {formatDate(contact.created_at)}
              </span>
            </div>
          </div>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((tag) => (
                  <Badge key={tag} className="text-xs bg-blue-100 text-blue-700 border-blue-200 border">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Custom Fields */}
          {contact.custom_fields && Object.keys(contact.custom_fields).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Campos personalizados
              </p>
              <div className="space-y-1.5">
                {Object.entries(contact.custom_fields).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-2 text-sm">
                    <span className="text-muted-foreground font-medium min-w-0 shrink-0">{k}:</span>
                    <span className="text-foreground">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Stats summary */}
          <div className="rounded-lg bg-muted/40 p-3 space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Resumo</p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Eventos na timeline</span>
              <span className="font-semibold text-foreground">{events.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Conversas</span>
              <span className="font-semibold text-foreground">
                {events.filter((e) => e.type === "conversation").length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Notas</span>
              <span className="font-semibold text-foreground">
                {events.filter((e) => e.type === "note").length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Campanhas</span>
              <span className="font-semibold text-foreground">
                {events.filter((e) => e.type === "campaign").length}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Oportunidades</span>
              <span className="font-semibold text-foreground">
                {events.filter((e) => e.type === "opportunity").length}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column — Timeline */}
        <div className="flex-1 overflow-y-auto p-6">
          <h3 className="text-sm font-semibold text-foreground mb-6">
            Timeline completa ({events.length} {events.length === 1 ? "evento" : "eventos"})
          </h3>

          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <Clock className="h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm">Nenhum evento encontrado para este contato.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />

              <div className="space-y-6 pl-14">
                {events.map((event, idx) => {
                  const dateStr = getEventDate(event);
                  return (
                    <div key={`${event.type}-${event.id}-${idx}`} className="relative">
                      {/* Icon on the line */}
                      <div className="absolute -left-10 top-0">
                        {renderEventIcon(event)}
                      </div>

                      {/* Card */}
                      <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
                        {renderEventContent(event)}
                        <div className="flex items-center gap-2 mt-2">
                          <span
                            className="text-xs text-muted-foreground cursor-default"
                            title={formatDate(dateStr)}
                          >
                            {relativeTime(dateStr)}
                          </span>
                          <span className="text-xs text-muted-foreground/50">•</span>
                          <span className="text-xs text-muted-foreground">{formatDate(dateStr)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
