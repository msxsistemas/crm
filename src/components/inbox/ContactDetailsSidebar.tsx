import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { X, Phone, Hash, Calendar, User, StickyNote, History, MessageCircle, Clock, TrendingUp, Send, ChevronDown, ChevronUp, Cake, Star, CheckSquare, Trash2, CreditCard, MapPin, ShieldOff, Shield, RefreshCw, Sliders, FolderOpen, FileText, Image, File, Download, RotateCcw, Sparkles, Loader2, Tag } from "lucide-react";
import TagSelector from "@/components/shared/TagSelector";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/db";
import api from "@/lib/api";

interface ContactDetailsSidebarProps {
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  contactAvatar: string | null;
  conversationId: string;
  conversationCreatedAt: string;
  conversationStatus?: string;
  onClose: () => void;
  customFields?: Record<string, string> | null;
}

interface ConversationSummary {
  id: string;
  conversation_id: string;
  summary: string;
  next_steps: string[];
  suggested_tags: string[];
  generated_at: string;
}

interface ConversationNote {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  is_pinned?: boolean;
  author_name?: string | null;
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
  conversationStatus,
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

  // Contact version history
  const [contactVersions, setContactVersions] = useState<{ id: string; changed_fields: Record<string, { old: unknown; new: unknown }>; changed_by_name: string | null; created_at: string }[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoaded, setVersionsLoaded] = useState(false);

  // Note version history
  interface NoteVersion { id: string; note_id: string; content: string; edited_by: string | null; edited_by_name: string | null; created_at: string; }
  const [noteVersionsModal, setNoteVersionsModal] = useState<{ noteId: string; versions: NoteVersion[] } | null>(null);
  const [noteVersionsLoading, setNoteVersionsLoading] = useState(false);

  // Contact conversation history
  const [contactHistory, setContactHistory] = useState<any[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const navigate = useNavigate();

  // Checklist state
  const [checklistItems, setChecklistItems] = useState<{ id: string; text: string; done: boolean }[]>([]);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [addingChecklist, setAddingChecklist] = useState(false);

  // Contact stats (recurrent)
  const [contactStats, setContactStats] = useState<{ total_conversations: number; first_contact: string | null; avg_csat: number | null } | null>(null);

  // Block state
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [blockReasonInput, setBlockReasonInput] = useState("");
  const [blockLoading, setBlockLoading] = useState(false);

  // Address state
  const [addressOpen, setAddressOpen] = useState(false);
  const [addrCep, setAddrCep] = useState("");
  const [addrStreet, setAddrStreet] = useState("");
  const [addrNumber, setAddrNumber] = useState("");
  const [addrComplement, setAddrComplement] = useState("");
  const [addrNeighborhood, setAddrNeighborhood] = useState("");
  const [addrCity, setAddrCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [addrSaving, setAddrSaving] = useState(false);

  // Payment links
  const [paymentLinks, setPaymentLinks] = useState<{ id: string; amount: string; description: string; provider: string; status: string; created_at: string; external_url: string | null }[]>([]);
  const [paymentLinksOpen, setPaymentLinksOpen] = useState(false);
  const [paymentLinksLoaded, setPaymentLinksLoaded] = useState(false);

  // Custom fields
  type CustomFieldDef = { id: string; label: string; field_type: string; options: string[]; required: boolean; position: number; value: string | null };
  const [contactCustomFields, setContactCustomFields] = useState<CustomFieldDef[]>([]);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [savingCustomField, setSavingCustomField] = useState<Record<string, boolean>>({});

  // Pix charges state
  interface PixCharge {
    id: string;
    amount: number;
    description: string | null;
    qr_code_text: string;
    status: string;
    paid_at: string | null;
    created_at: string;
    created_by_name: string | null;
  }
  const [pixCharges, setPixCharges] = useState<PixCharge[]>([]);
  const [pixChargesOpen, setPixChargesOpen] = useState(false);
  const [pixChargesLoaded, setPixChargesLoaded] = useState(false);
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);

  const loadPixCharges = async () => {
    try {
      const data = await api.get<PixCharge[]>(`/pix-charges?conversation_id=${conversationId}`);
      setPixCharges(data || []);
      setPixChargesLoaded(true);
    } catch { setPixChargesLoaded(true); }
  };

  const handleMarkPaid = async (chargeId: string) => {
    setMarkingPaid(chargeId);
    try {
      const updated = await api.patch<PixCharge>(`/pix-charges/${chargeId}/mark-paid`, {});
      setPixCharges(prev => prev.map(c => c.id === chargeId ? updated : c));
    } catch { /* ignore */ }
    setMarkingPaid(null);
  };

  // Documents state
  interface ContactDocument {
    id: string;
    filename: string;
    mimetype: string | null;
    size: number | null;
    uploaded_by_name: string | null;
    created_at: string;
  }
  const [documents, setDocuments] = useState<ContactDocument[]>([]);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const docInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = async () => {
    try {
      const data = await api.get<ContactDocument[]>(`/contacts/${contactId}/documents`);
      setDocuments(data || []);
      setDocumentsLoaded(true);
    } catch { setDocumentsLoaded(true); }
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('Arquivo muito grande. Limite: 10MB');
      return;
    }
    setUploadingDoc(true);
    try {
      const base = import.meta.env.VITE_API_URL || 'https://api.msxzap.pro';
      const formData = new FormData();
      formData.append('file', file, file.name);
      const res = await fetch(`${base}/contacts/${contactId}/documents`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      if (res.ok) {
        await loadDocuments();
      } else {
        alert('Erro ao enviar documento');
      }
    } catch { alert('Erro ao enviar documento'); }
    finally {
      setUploadingDoc(false);
      if (docInputRef.current) docInputRef.current.value = '';
    }
  };

  const handleDocDelete = async (docId: string) => {
    if (!confirm('Excluir este documento?')) return;
    try {
      await api.delete(`/contacts/${contactId}/documents/${docId}`);
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch { alert('Erro ao excluir documento'); }
  };

  const formatDocSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  };

  const getDocIcon = (mimetype: string | null) => {
    if (!mimetype) return <File className="h-4 w-4 text-gray-400" />;
    if (mimetype === 'application/pdf') return <FileText className="h-4 w-4 text-red-500" />;
    if (mimetype.startsWith('image/')) return <Image className="h-4 w-4 text-blue-500" />;
    return <File className="h-4 w-4 text-gray-400" />;
  };

  // Co-atendentes (collaborators)
  const [collaborators, setCollaborators] = useState<{ agent_id: string; name: string | null; full_name: string | null; avatar_url: string | null }[]>([]);
  const [showAddCollab, setShowAddCollab] = useState(false);
  const [allAgents, setAllAgents] = useState<AgentProfile[]>([]);

  // ── Resumo de conversa por IA ─────────────────────────────────────────────
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryChecked, setSummaryChecked] = useState(false);
  const [nextStepsDone, setNextStepsDone] = useState<Record<number, boolean>>({});

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const data = await api.get<ConversationSummary>(`/conversations/${conversationId}/summary`);
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
      setSummaryChecked(true);
    }
  }, [conversationId]);

  const generateSummary = async () => {
    setSummaryLoading(true);
    try {
      const data = await api.post<ConversationSummary>(`/conversations/${conversationId}/summary/generate`, {});
      setSummary(data);
      setSummaryChecked(true);
    } catch {
      /* ignore */
    } finally {
      setSummaryLoading(false);
    }
  };

  // Carregar resumo quando abrir e for conversa fechada
  useEffect(() => {
    if (summaryOpen && !summaryChecked) {
      loadSummary();
    }
  }, [summaryOpen, summaryChecked, loadSummary]);

  // Resetar ao mudar conversa
  useEffect(() => {
    setSummary(null);
    setSummaryChecked(false);
    setNextStepsDone({});
  }, [conversationId]);

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
          const mapped = data
            .filter((p: any) => p.full_name)
            .map((p: any) => ({ id: p.id, name: p.full_name as string }));
          setAgents(mapped);
          setAllAgents(mapped);
        }
      });
  }, []);

  // Load collaborators when conversationId changes
  useEffect(() => {
    if (!conversationId) return;
    api.get<any[]>(`/conversations/${conversationId}/collaborators`)
      .then(data => setCollaborators(data || []))
      .catch(() => {});
  }, [conversationId]);

  // Load contact history when contactId changes
  useEffect(() => {
    if (!contactId) return;
    api.get<any[]>(`/contacts/${contactId}/conversations`)
      .then(data => setContactHistory(data || []))
      .catch(() => {});
  }, [contactId]);

  // Load payment links on demand
  useEffect(() => {
    if (!paymentLinksOpen || paymentLinksLoaded || !conversationId) return;
    api.get<any[]>(`/payment-links?conversation_id=${conversationId}`)
      .then(data => { setPaymentLinks(data || []); setPaymentLinksLoaded(true); })
      .catch(() => setPaymentLinksLoaded(true));
  }, [paymentLinksOpen, paymentLinksLoaded, conversationId]);

  // Load custom fields when contactId changes
  useEffect(() => {
    if (!contactId) return;
    api.get<any[]>(`/contacts/${contactId}/custom-fields`)
      .then(data => {
        if (Array.isArray(data)) {
          setContactCustomFields(data);
          const vals: Record<string, string> = {};
          data.forEach((f: any) => { if (f.value != null) vals[f.id] = f.value; });
          setCustomFieldValues(vals);
        }
      })
      .catch(() => {});
  }, [contactId]);

  // Load note version history
  const loadNoteVersions = async (noteId: string) => {
    setNoteVersionsLoading(true);
    try {
      const versions = await api.get<any[]>(`/notes/${noteId}/versions`);
      setNoteVersionsModal({ noteId, versions: versions || [] });
    } catch {
      setNoteVersionsModal({ noteId, versions: [] });
    } finally {
      setNoteVersionsLoading(false);
    }
  };

  const handleRestoreNoteVersion = async (noteId: string, versionId: string) => {
    try {
      const result = await api.post<{ success: boolean; content: string }>(`/notes/${noteId}/restore/${versionId}`);
      if (result?.content) {
        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, content: result.content } : n));
        setNoteVersionsModal(null);
      }
    } catch {
      // ignore
    }
  };

  // Load contact versions on demand
  const loadContactVersions = useCallback(() => {
    if (versionsLoaded) return;
    api.get<any[]>(`/contacts/${contactId}/history`)
      .then(data => {
        setContactVersions(data || []);
        setVersionsLoaded(true);
      })
      .catch(() => setVersionsLoaded(true));
  }, [contactId, versionsLoaded]);

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
      // Load lead score, birthday, block status, and address
      const { data: contactData } = await db
        .from("contacts")
        .select("lead_score, birthday, is_blocked, block_reason, cep, street, address_number, complement, neighborhood, city, state")
        .eq("id", contactId)
        .maybeSingle();
      if (contactData) {
        setLeadScore((contactData as any).lead_score ?? null);
        setBirthday((contactData as any).birthday ?? null);
        setIsBlocked((contactData as any).is_blocked ?? false);
        setBlockReason((contactData as any).block_reason ?? null);
        // Load address fields
        setAddrCep((contactData as any).cep ?? "");
        setAddrStreet((contactData as any).street ?? "");
        setAddrNumber((contactData as any).address_number ?? "");
        setAddrComplement((contactData as any).complement ?? "");
        setAddrNeighborhood((contactData as any).neighborhood ?? "");
        setAddrCity((contactData as any).city ?? "");
        setAddrState((contactData as any).state ?? "");
      }

      // Load contact stats
      api.get<any>(`/contacts/${contactId}/stats`)
        .then(stats => setContactStats(stats || null))
        .catch(() => {});

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

      // Load checklist
      try {
        const items = await api.get<{ id: string; text: string; done: boolean }[]>(`/conversations/${conversationId}/checklist`);
        setChecklistItems(items || []);
      } catch {
        setChecklistItems([]);
      }
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

  const handleBlockContact = async (blocked: boolean, reason?: string) => {
    setBlockLoading(true);
    try {
      await api.patch(`/contacts/${contactId}/block`, { blocked, block_reason: reason || null });
      setIsBlocked(blocked);
      setBlockReason(blocked ? (reason || null) : null);
      setShowBlockDialog(false);
      setBlockReasonInput("");
    } catch {
      // ignore
    } finally {
      setBlockLoading(false);
    }
  };

  const handleCepSearch = async () => {
    const cep = addrCep.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const data = await api.get<any>(`/viacep/${cep}`);
      if (data) {
        setAddrStreet(data.logradouro || "");
        setAddrNeighborhood(data.bairro || "");
        setAddrCity(data.localidade || "");
        setAddrState(data.uf || "");
        setAddrComplement(data.complemento || "");
      }
    } catch {
      // CEP not found
    } finally {
      setCepLoading(false);
    }
  };

  const handleSaveAddress = async () => {
    setAddrSaving(true);
    try {
      await api.patch(`/contacts/${contactId}`, {
        cep: addrCep || null,
        street: addrStreet || null,
        address_number: addrNumber || null,
        complement: addrComplement || null,
        neighborhood: addrNeighborhood || null,
        city: addrCity || null,
        state: addrState || null,
      });
    } catch {
      // ignore
    } finally {
      setAddrSaving(false);
    }
  };

  const formattedAddress = addrStreet && addrCity
    ? `${addrStreet}${addrNumber ? ', ' + addrNumber : ''}${addrNeighborhood ? ' - ' + addrNeighborhood : ''}, ${addrCity}${addrState ? '/' + addrState : ''}`
    : null;

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
        {isBlocked && (
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800">
            <Shield className="h-3 w-3" /> BLOQUEADO
          </span>
        )}
        {contactStats && Number(contactStats.total_conversations) > 3 && (
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800">
            ⭐ Cliente recorrente
          </span>
        )}
        {contactStats && Number(contactStats.total_conversations) > 0 && (
          <span className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            🔁 {contactStats.total_conversations} conversa(s)
            {contactStats.first_contact && (
              <> · cliente há {Math.floor((Date.now() - new Date(contactStats.first_contact).getTime()) / (1000 * 60 * 60 * 24))}d</>
            )}
          </span>
        )}
        {(() => {
          const score = leadScore ?? 0;
          const badge = getLeadScoreBadge(score);
          if (!badge) return null;
          return (
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${badge.className}`}
                title="Score calculado com base em engajamento: conversas, mensagens, tempo de resposta, recência, Pix, CSAT, e-mail e empresa"
              >
                {badge.emoji} Score: {score} — {badge.label}
              </span>
              <button
                className="text-[10px] px-2 py-0.5 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700 dark:hover:bg-blue-900/30 transition-colors"
                onClick={async () => {
                  try {
                    const result = await api.post<{ score: number }>(`/contacts/${contactId}/calculate-score`, {});
                    setLeadScore(result.score);
                  } catch { /* ignore */ }
                }}
                title="Recalcular score de lead"
              >
                <RefreshCw className="h-2.5 w-2.5 inline mr-0.5" />Recalcular
              </button>
            </div>
          );
        })()}
        {/* Block / Unblock button */}
        <div className="mt-2 flex gap-2">
          {isBlocked ? (
            <button
              type="button"
              className="text-[10px] px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/30 transition-colors"
              onClick={() => handleBlockContact(false)}
              disabled={blockLoading}
            >
              {blockLoading ? "..." : "Desbloquear"}
            </button>
          ) : (
            <button
              type="button"
              className="text-[10px] px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 dark:text-red-400 dark:border-red-700 dark:hover:bg-red-900/30 transition-colors flex items-center gap-1"
              onClick={() => setShowBlockDialog(true)}
            >
              <ShieldOff className="h-3 w-3" /> Bloquear
            </button>
          )}
        </div>
        {isBlocked && blockReason && (
          <p className="text-[10px] text-muted-foreground mt-1 text-center px-2">Motivo: {blockReason}</p>
        )}
      </div>

      {/* Block confirmation dialog */}
      {showBlockDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-lg shadow-xl p-4 w-72 space-y-3">
            <p className="text-sm font-semibold text-foreground">Bloquear contato?</p>
            <p className="text-xs text-muted-foreground">Novas mensagens deste contato serão ignoradas silenciosamente.</p>
            <textarea
              className="w-full text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Motivo (opcional)"
              rows={2}
              value={blockReasonInput}
              onChange={e => setBlockReasonInput(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
                onClick={() => { setShowBlockDialog(false); setBlockReasonInput(""); }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={blockLoading}
                className="text-xs px-3 py-1.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                onClick={() => handleBlockContact(true, blockReasonInput)}
              >
                {blockLoading ? "Bloqueando..." : "Bloquear"}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Endereço */}
      <div className="px-4 py-3 border-b border-border">
        <button
          className="flex items-center justify-between w-full"
          onClick={() => setAddressOpen(v => !v)}
        >
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Endereço</span>
            {formattedAddress && !addressOpen && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{formattedAddress}</span>
            )}
          </div>
          {addressOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {addressOpen && (
          <div className="mt-3 space-y-2">
            {/* CEP row */}
            <div className="flex gap-2">
              <input
                className="flex-1 text-xs border border-border rounded px-2.5 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="CEP"
                value={addrCep}
                onChange={e => setAddrCep(e.target.value)}
                maxLength={9}
              />
              <button
                type="button"
                disabled={cepLoading || addrCep.replace(/\D/g, '').length !== 8}
                className="text-xs px-2.5 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1"
                onClick={handleCepSearch}
              >
                {cepLoading ? <RefreshCw className="h-3 w-3 animate-spin" /> : "Buscar"}
              </button>
            </div>
            <input
              className="w-full text-xs border border-border rounded px-2.5 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Rua / Logradouro"
              value={addrStreet}
              onChange={e => setAddrStreet(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="w-24 text-xs border border-border rounded px-2.5 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Número"
                value={addrNumber}
                onChange={e => setAddrNumber(e.target.value)}
              />
              <input
                className="flex-1 text-xs border border-border rounded px-2.5 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Complemento"
                value={addrComplement}
                onChange={e => setAddrComplement(e.target.value)}
              />
            </div>
            <input
              className="w-full text-xs border border-border rounded px-2.5 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Bairro"
              value={addrNeighborhood}
              onChange={e => setAddrNeighborhood(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className="flex-1 text-xs border border-border rounded px-2.5 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Cidade"
                value={addrCity}
                onChange={e => setAddrCity(e.target.value)}
              />
              <input
                className="w-14 text-xs border border-border rounded px-2.5 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary uppercase"
                placeholder="UF"
                value={addrState}
                onChange={e => setAddrState(e.target.value.toUpperCase())}
                maxLength={2}
              />
            </div>
            <button
              type="button"
              disabled={addrSaving}
              className="w-full text-xs py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors font-medium"
              onClick={handleSaveAddress}
            >
              {addrSaving ? "Salvando..." : "Salvar endereço"}
            </button>
            {formattedAddress && (
              <p className="text-[10px] text-muted-foreground">{formattedAddress}</p>
            )}
            {(addrStreet && addrCity) && (
              <a
                href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${addrStreet}${addrNumber ? ', ' + addrNumber : ''}, ${addrCity}${addrState ? ', ' + addrState : ''}, Brasil`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <MapPin className="h-3 w-3" /> Ver no mapa
              </a>
            )}
            {(!addrStreet && addrCep && addrCep.replace(/\D/g, '').length === 8) && (
              <a
                href={`https://www.openstreetmap.org/search?query=${addrCep.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <MapPin className="h-3 w-3" /> Ver localização pelo CEP
              </a>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">Notas Internas</span>
        </div>

        {/* Notes list — pinned first */}
        <div className="max-h-[220px] overflow-y-auto space-y-2 mb-3">
          {notes.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma nota ainda</p>
          ) : (
            [...notes].sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)).map((note) => (
              <div key={note.id} className={`rounded-md p-2.5 space-y-0.5 ${note.is_pinned ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800' : 'bg-muted/50'}`}>
                <div className="flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground font-medium">
                    {note.author_name || note.profiles?.full_name || "Usuário"}
                    {note.is_pinned && <span className="ml-1 text-yellow-600">📌</span>}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Ver histórico de versões"
                      className="text-[10px] text-muted-foreground hover:text-blue-500 transition-colors flex items-center gap-0.5 px-1 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      onClick={() => loadNoteVersions(note.id)}
                    >
                      <History className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      title={note.is_pinned ? "Desafixar" : "Fixar nota"}
                      className="text-muted-foreground hover:text-yellow-500 transition-colors"
                      onClick={async () => {
                        try {
                          const { api } = await import("@/lib/api");
                          await api.patch(`/conversations/${conversationId}/notes/${note.id}`, { is_pinned: !note.is_pinned });
                          setNotes(prev => prev.map(n => n.id === note.id ? { ...n, is_pinned: !n.is_pinned } : n));
                        } catch {}
                      }}
                    >
                      <span className="text-[11px]">{note.is_pinned ? "✕" : "📌"}</span>
                    </button>
                  </div>
                </div>
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

      {/* Checklist */}
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Checklist</span>
          </div>
          {checklistItems.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {checklistItems.filter(i => i.done).length}/{checklistItems.length} concluídos
            </span>
          )}
        </div>

        {checklistItems.length > 0 && (
          <div className="space-y-1.5 mb-3 max-h-[200px] overflow-y-auto">
            {checklistItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2 group">
                <input
                  type="checkbox"
                  checked={item.done}
                  className="h-4 w-4 rounded cursor-pointer accent-primary"
                  onChange={async () => {
                    const newDone = !item.done;
                    setChecklistItems(prev => prev.map(i => i.id === item.id ? { ...i, done: newDone } : i));
                    try {
                      await api.patch(`/conversations/${conversationId}/checklist/${item.id}`, { done: newDone });
                    } catch {
                      setChecklistItems(prev => prev.map(i => i.id === item.id ? { ...i, done: item.done } : i));
                    }
                  }}
                />
                <span className={`flex-1 text-xs ${item.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                  {item.text}
                </span>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                  onClick={async () => {
                    setChecklistItems(prev => prev.filter(i => i.id !== item.id));
                    try {
                      await api.delete(`/conversations/${conversationId}/checklist/${item.id}`);
                    } catch {
                      // ignore
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            className="flex-1 text-xs border border-border rounded px-2.5 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Adicionar item..."
            value={newChecklistText}
            onChange={(e) => setNewChecklistText(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && newChecklistText.trim()) {
                e.preventDefault();
                const text = newChecklistText.trim();
                setNewChecklistText("");
                setAddingChecklist(true);
                try {
                  const item = await api.post<{ id: string; text: string; done: boolean }>(
                    `/conversations/${conversationId}/checklist`, { text }
                  );
                  if (item) setChecklistItems(prev => [...prev, item]);
                } catch {
                  // ignore
                } finally {
                  setAddingChecklist(false);
                }
              }
            }}
          />
          <button
            type="button"
            disabled={addingChecklist || !newChecklistText.trim()}
            className="text-xs bg-primary text-primary-foreground px-2.5 py-1.5 rounded font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            onClick={async () => {
              const text = newChecklistText.trim();
              if (!text) return;
              setNewChecklistText("");
              setAddingChecklist(true);
              try {
                const item = await api.post<{ id: string; text: string; done: boolean }>(
                  `/conversations/${conversationId}/checklist`, { text }
                );
                if (item) setChecklistItems(prev => [...prev, item]);
              } catch {
                // ignore
              } finally {
                setAddingChecklist(false);
              }
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Histórico de Atendimentos */}
      <div className="px-4 py-3 border-b border-border">
        <button
          className="flex items-center justify-between w-full"
          onClick={() => setHistoryOpen(v => !v)}
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              Histórico de Atendimentos ({contactHistory.length})
            </span>
          </div>
          {historyOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>

        {historyOpen && (
          <div className="mt-3 space-y-2">
            {contactHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum atendimento anterior</p>
            ) : (
              contactHistory.map((c) => {
                const statusConfig: Record<string, { label: string; className: string }> = {
                  open: { label: "Aberta", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
                  closed: { label: "Encerrada", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
                  in_progress: { label: "Em andamento", className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
                };
                const sc = statusConfig[c.status] ?? statusConfig["open"];
                const lastMsg = c.last_message_body ? (c.last_message_body.length > 40 ? c.last_message_body.slice(0, 40) + "…" : c.last_message_body) : "—";
                return (
                  <div
                    key={c.id}
                    className="rounded-md p-2.5 bg-muted/40 hover:bg-muted/60 cursor-pointer transition-colors"
                    onClick={() => navigate(`/inbox?conversation=${c.id}`)}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${sc.className}`}>{sc.label}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      </span>
                    </div>
                    {c.agent_name && (
                      <p className="text-[11px] text-muted-foreground">Agente: {c.agent_name}</p>
                    )}
                    {c.category_name && (
                      <p className="text-[11px] text-muted-foreground">Categoria: {c.category_name}</p>
                    )}
                    <p className="text-[11px] text-foreground mt-0.5">{lastMsg}</p>
                    {c.csat_score != null && (
                      <div className="flex items-center gap-0.5 mt-1">
                        {[1,2,3,4,5].map(n => (
                          <Star key={n} className={`h-3 w-3 ${n <= c.csat_score ? 'text-yellow-400 fill-yellow-400' : 'text-muted-foreground'}`} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
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

      {/* Histórico de Alterações */}
      <div className="px-4 py-3 border-t border-border">
        <button
          className="flex items-center justify-between w-full"
          onClick={() => {
            const next = !versionsOpen;
            setVersionsOpen(next);
            if (next) loadContactVersions();
          }}
        >
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Histórico de Alterações</span>
          </div>
          {versionsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {versionsOpen && (
          <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
            {!versionsLoaded ? (
              <p className="text-xs text-muted-foreground ml-6">Carregando...</p>
            ) : contactVersions.length === 0 ? (
              <p className="text-xs text-muted-foreground ml-6">Nenhuma alteração registrada</p>
            ) : (
              contactVersions.map(v => (
                <div key={v.id} className="ml-6 border-l-2 border-border pl-3 py-1">
                  <p className="text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleString('pt-BR')}
                    {v.changed_by_name ? ` · ${v.changed_by_name}` : ''}
                  </p>
                  {Object.entries(v.changed_fields || {}).map(([field, change]) => {
                    const fieldLabels: Record<string, string> = {
                      name: 'Nome', phone: 'Telefone', email: 'E-mail',
                      organization: 'Empresa', tags: 'Tags', notes: 'Notas'
                    };
                    const label = fieldLabels[field] || field;
                    const oldVal = Array.isArray(change.old) ? (change.old as string[]).join(', ') : String(change.old ?? '');
                    const newVal = Array.isArray(change.new) ? (change.new as string[]).join(', ') : String(change.new ?? '');
                    return (
                      <p key={field} className="text-xs text-foreground mt-0.5">
                        <span className="font-medium">{label}:</span>{' '}
                        <span className="text-red-500 line-through">{oldVal || '—'}</span>
                        {' → '}
                        <span className="text-green-600">{newVal || '—'}</span>
                      </p>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Co-atendentes */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Co-atendentes</span>
          </div>
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => setShowAddCollab(v => !v)}
          >
            + Adicionar
          </button>
        </div>

        {showAddCollab && (
          <div className="mb-2 rounded-lg border border-border bg-muted/30 p-2 space-y-1 max-h-36 overflow-y-auto">
            {allAgents.filter(a => !collaborators.some(c => c.agent_id === a.id)).map(a => (
              <button
                key={a.id}
                className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors text-foreground"
                onClick={async () => {
                  try {
                    await api.post(`/conversations/${conversationId}/collaborators`, { agent_id: a.id });
                    setCollaborators(prev => [...prev, { agent_id: a.id, name: a.name, full_name: a.name, avatar_url: null }]);
                    setShowAddCollab(false);
                  } catch { /* silent */ }
                }}
              >
                {a.name}
              </button>
            ))}
            {allAgents.filter(a => !collaborators.some(c => c.agent_id === a.id)).length === 0 && (
              <p className="text-xs text-muted-foreground px-2">Todos os agentes já são co-atendentes</p>
            )}
          </div>
        )}

        {collaborators.length === 0 ? (
          <p className="text-xs text-muted-foreground ml-6">Nenhum co-atendente</p>
        ) : (
          <div className="space-y-1.5 ml-6">
            {collaborators.map(c => (
              <div key={c.agent_id} className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                  {(c.full_name || c.name || '?').charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-foreground flex-1">{c.full_name || c.name}</span>
                <button
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  onClick={async () => {
                    try {
                      await api.delete(`/conversations/${conversationId}/collaborators/${c.agent_id}`);
                      setCollaborators(prev => prev.filter(x => x.agent_id !== c.agent_id));
                    } catch { /* silent */ }
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payment Links Section */}
      <div className="border-t border-border pt-3 space-y-2">
        <button
          className="w-full flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors"
          onClick={() => setPaymentLinksOpen(p => !p)}
        >
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <span className="flex-1 text-left">Links de Pagamento</span>
          {paymentLinksOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {paymentLinksOpen && (
          <div className="space-y-2 ml-6">
            {!paymentLinksLoaded ? (
              <p className="text-xs text-muted-foreground">Carregando...</p>
            ) : paymentLinks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum link de pagamento</p>
            ) : paymentLinks.map(pl => (
              <div key={pl.id} className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-foreground leading-snug">{pl.description}</p>
                  <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${pl.status === 'paid' ? 'bg-green-100 text-green-700' : pl.status === 'cancelled' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {pl.status === 'paid' ? 'Pago' : pl.status === 'cancelled' ? 'Cancelado' : 'Pendente'}
                  </span>
                </div>
                <p className="text-sm font-bold text-foreground">R$ {parseFloat(pl.amount).toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground">{pl.provider} · {new Date(pl.created_at).toLocaleDateString("pt-BR")}</p>
                {pl.external_url && (
                  <a href={pl.external_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary hover:underline truncate block">
                    {pl.external_url}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Campos Personalizados */}
      <div className="px-4 py-3 border-b border-border">
        <button
          className="flex items-center justify-between w-full"
          onClick={() => setCustomFieldsOpen(v => !v)}
        >
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Campos Personalizados</span>
          </div>
          {customFieldsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {customFieldsOpen && (
          <div className="mt-3 space-y-3 ml-6">
            {contactCustomFields.length === 0 ? (
              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground">Nenhum campo configurado.</p>
                <Link to="/configuracoes" className="text-xs text-primary hover:underline">
                  Ir para Configurações
                </Link>
              </div>
            ) : (
              contactCustomFields.map(field => (
                <div key={field.id} className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    {field.label}
                    {field.required && <span className="text-destructive">*</span>}
                  </label>
                  {field.field_type === 'boolean' ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={customFieldValues[field.id] === 'true'}
                        onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.checked ? 'true' : 'false' }))}
                        className="rounded border-border"
                      />
                      <span className="text-xs text-foreground">{customFieldValues[field.id] === 'true' ? 'Sim' : 'Não'}</span>
                      <button
                        type="button"
                        disabled={savingCustomField[field.id]}
                        onClick={async () => {
                          setSavingCustomField(prev => ({ ...prev, [field.id]: true }));
                          await api.post(`/contacts/${contactId}/custom-fields`, { field_id: field.id, value: customFieldValues[field.id] || 'false' }).catch(() => {});
                          setSavingCustomField(prev => ({ ...prev, [field.id]: false }));
                        }}
                        className="text-[10px] px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 ml-auto"
                      >
                        {savingCustomField[field.id] ? "..." : "Salvar"}
                      </button>
                    </div>
                  ) : field.field_type === 'select' ? (
                    <div className="flex gap-2">
                      <select
                        value={customFieldValues[field.id] || ''}
                        onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                        className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="">Selecione...</option>
                        {(field.options || []).map((opt: string) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={savingCustomField[field.id]}
                        onClick={async () => {
                          setSavingCustomField(prev => ({ ...prev, [field.id]: true }));
                          await api.post(`/contacts/${contactId}/custom-fields`, { field_id: field.id, value: customFieldValues[field.id] || '' }).catch(() => {});
                          setSavingCustomField(prev => ({ ...prev, [field.id]: false }));
                        }}
                        className="text-[10px] px-2 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                      >
                        {savingCustomField[field.id] ? "..." : "Salvar"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type={field.field_type === 'number' ? 'number' : field.field_type === 'date' ? 'date' : 'text'}
                        value={customFieldValues[field.id] || ''}
                        onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                        onBlur={async () => {
                          setSavingCustomField(prev => ({ ...prev, [field.id]: true }));
                          await api.post(`/contacts/${contactId}/custom-fields`, { field_id: field.id, value: customFieldValues[field.id] || '' }).catch(() => {});
                          setSavingCustomField(prev => ({ ...prev, [field.id]: false }));
                        }}
                        className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder={`${field.label}...`}
                      />
                      {savingCustomField[field.id] && (
                        <span className="text-[10px] text-muted-foreground self-center">Salvando...</span>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Documents Section */}
      <div className="border-t border-border">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors"
          onClick={() => {
            setDocumentsOpen(v => !v);
            if (!documentsLoaded) loadDocuments();
          }}
        >
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Documentos</span>
            {documents.length > 0 && (
              <span className="text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{documents.length}</span>
            )}
          </div>
          {documentsOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>

        {documentsOpen && (
          <div className="px-4 pb-4 space-y-2">
            <input
              ref={docInputRef}
              type="file"
              className="hidden"
              accept="*/*"
              onChange={handleDocUpload}
            />
            <button
              type="button"
              onClick={() => docInputRef.current?.click()}
              disabled={uploadingDoc}
              className="w-full flex items-center justify-center gap-2 text-xs border border-dashed border-border rounded-lg py-2 text-muted-foreground hover:text-foreground hover:border-primary transition-colors disabled:opacity-50"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {uploadingDoc ? 'Enviando...' : 'Enviar documento (máx. 10MB)'}
            </button>

            {!documentsLoaded ? (
              <p className="text-xs text-muted-foreground text-center py-2">Carregando...</p>
            ) : documents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Sem documentos</p>
            ) : (
              <div className="space-y-1.5">
                {documents.map(doc => {
                  const base = import.meta.env.VITE_API_URL || 'https://api.msxzap.pro';
                  return (
                    <div key={doc.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted/80 group">
                      {getDocIcon(doc.mimetype)}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{doc.filename}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDocSize(doc.size)}
                          {doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ''}
                        </p>
                      </div>
                      <a
                        href={`${base}/contacts/${contactId}/documents/${doc.id}/download`}
                        target="_blank"
                        rel="noreferrer"
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Baixar"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDocDelete(doc.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 dark:hover:bg-red-950"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pix Charges Section */}
      <div className="border-b border-border">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
          onClick={() => {
            setPixChargesOpen(v => !v);
            if (!pixChargesLoaded) loadPixCharges();
          }}
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <CreditCard className="h-4 w-4 text-green-500" />
            Cobranças Pix
            {pixCharges.length > 0 && (
              <span className="text-[11px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{pixCharges.length}</span>
            )}
          </div>
          {pixChargesOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
        {pixChargesOpen && (
          <div className="px-4 pb-4 space-y-2">
            {!pixChargesLoaded ? (
              <p className="text-xs text-muted-foreground text-center py-2">Carregando...</p>
            ) : pixCharges.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Sem cobranças Pix</p>
            ) : (
              <div className="space-y-2">
                {pixCharges.map(charge => (
                  <div key={charge.id} className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">
                        R$ {Number(charge.amount).toFixed(2).replace('.', ',')}
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${charge.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {charge.status === 'paid' ? '✅ Pago' : '⏳ Pendente'}
                      </span>
                    </div>
                    {charge.description && <p className="text-xs text-muted-foreground">{charge.description}</p>}
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(charge.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {charge.created_by_name ? ` · ${charge.created_by_name}` : ''}
                    </p>
                    {charge.status !== 'paid' && (
                      <button
                        type="button"
                        onClick={() => handleMarkPaid(charge.id)}
                        disabled={markingPaid === charge.id}
                        className="w-full mt-1 text-[11px] py-1 px-2 rounded border border-green-500 text-green-600 hover:bg-green-50 dark:hover:bg-green-950 transition-colors disabled:opacity-50"
                      >
                        {markingPaid === charge.id ? 'Marcando...' : 'Marcar como pago'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Resumo da Conversa (IA) ── */}
      {conversationStatus === 'closed' && (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setSummaryOpen(v => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              Resumo da Conversa (IA)
            </span>
            {summaryOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {summaryOpen && (
            <div className="px-4 pb-4 space-y-3">
              {summaryLoading ? (
                <div className="flex items-center gap-2 py-4 justify-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Gerando resumo...</span>
                </div>
              ) : summary ? (
                <>
                  {/* Resumo */}
                  <div className="rounded-md bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 p-3">
                    <p className="text-xs font-medium text-violet-800 dark:text-violet-300 mb-1">Resumo</p>
                    <p className="text-xs text-violet-900 dark:text-violet-200 leading-relaxed">{summary.summary}</p>
                  </div>
                  {/* Próximos passos */}
                  {summary.next_steps?.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Próximos passos</p>
                      <ul className="space-y-1.5">
                        {summary.next_steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={!!nextStepsDone[i]}
                              onChange={() => setNextStepsDone(prev => ({ ...prev, [i]: !prev[i] }))}
                              className="mt-0.5 h-3.5 w-3.5 rounded accent-violet-600 cursor-pointer shrink-0"
                            />
                            <span className={`text-xs leading-relaxed ${nextStepsDone[i] ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                              {step}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {/* Tags sugeridas */}
                  {summary.suggested_tags?.length > 0 && (
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Tags sugeridas</p>
                      <div className="flex flex-wrap gap-1.5">
                        {summary.suggested_tags.map((tag, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground border border-border"
                          >
                            <Tag className="h-2.5 w-2.5" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    Gerado em {new Date(summary.generated_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </>
              ) : (
                <div className="text-center py-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Nenhum resumo gerado ainda.</p>
                </div>
              )}
              <button
                type="button"
                onClick={generateSummary}
                disabled={summaryLoading}
                className="w-full flex items-center justify-center gap-1.5 rounded-md border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 text-xs py-1.5 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors disabled:opacity-50"
              >
                {summaryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {summary ? 'Gerar novamente' : 'Gerar resumo'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Note Versions Modal */}
      {noteVersionsModal && (
        <Dialog open={!!noteVersionsModal} onOpenChange={(v) => { if (!v) setNoteVersionsModal(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Histórico de Versões da Nota
              </DialogTitle>
            </DialogHeader>
            {noteVersionsLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Carregando versões...</div>
            ) : noteVersionsModal.versions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma versão anterior encontrada.
              </div>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {noteVersionsModal.versions.map((ver) => (
                  <div key={ver.id} className="rounded-md border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-medium text-muted-foreground">
                          {ver.edited_by_name || 'Agente'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(ver.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestoreNoteVersion(noteVersionsModal.noteId, ver.id)}
                        className="flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-primary text-primary hover:bg-primary/10 transition-colors"
                        title="Restaurar esta versão"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restaurar
                      </button>
                    </div>
                    <p className="text-xs text-foreground whitespace-pre-wrap bg-muted/40 rounded p-2 line-clamp-4">
                      {ver.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-2 border-t">
              <Button size="sm" variant="ghost" className="w-full" onClick={() => setNoteVersionsModal(null)}>
                Fechar
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ContactDetailsSidebar;
