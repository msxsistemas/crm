import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatPhoneBR, unformatPhone } from "@/lib/phone-mask";
import {
  Search, Plus, Download, Upload, Pencil, Trash2, X,
  Phone, CheckCircle, Users, MessageSquare, BarChart3,
  Calendar as CalendarIcon, CalendarDays, CalendarRange, ChevronDown,
  User, Mail, MapPin, Info, Settings, Cake, Filter, Smartphone,
  Layers, Calculator, Eye, RefreshCw, Tag, Clock, GitMerge, ExternalLink
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { FloatingInput } from "@/components/ui/floating-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, isToday, isThisWeek, isThisMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { logAudit } from "@/lib/audit";
import { usePermissions } from "@/hooks/usePermissions";

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  avatar_url: string | null;
  email: string | null;
  cpf_cnpj: string | null;
  gender: string | null;
  birthday: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  reference: string | null;
  disable_chatbot: boolean;
  extra_fields: { name: string; value: string }[] | null;
  custom_fields: Record<string, string> | null;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
  lead_score?: number | null;
  lead_score_updated_at?: string | null;
}

// ── Lead Scoring Helpers ──
function getScoreBadge(score: number | null | undefined) {
  const s = score ?? 0;
  if (s >= 76) return { label: 'Muito Quente', emoji: '🔥', className: 'bg-red-100 text-red-700 border-red-200' };
  if (s >= 51) return { label: 'Quente', emoji: '🟢', className: 'bg-green-100 text-green-700 border-green-200' };
  if (s >= 26) return { label: 'Morno', emoji: '🟡', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
  return { label: 'Frio', emoji: '🔴', className: 'bg-blue-100 text-blue-700 border-blue-200' };
}

async function calculateContactScore(contactId: string): Promise<number> {
  const { data: rules } = await db.from('lead_scoring_rules').select('*').eq('is_active', true);
  let score = 50;
  for (const rule of rules || []) {
    if (rule.condition_type === 'has_conversation') {
      const { count } = await db.from('conversations').select('*', { count: 'exact', head: true })
        .eq('contact_id', contactId).eq('status', rule.condition_value || 'open');
      if ((count || 0) > 0) score += rule.points;
    }
    if (rule.condition_type === 'has_opportunity') {
      const { count } = await db.from('opportunities').select('*', { count: 'exact', head: true })
        .eq('contact_id', contactId);
      if ((count || 0) > 0) score += rule.points;
    }
    if (rule.condition_type === 'inactivity_days') {
      const days = parseInt(rule.condition_value || '30');
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const { data: contact } = await db.from('contacts').select('updated_at').eq('id', contactId).single();
      if (contact && new Date((contact as any).updated_at) < cutoff) score += rule.points;
    }
    if (rule.condition_type === 'campaign_opened') {
      const { count } = await db.from('campaign_contacts').select('*', { count: 'exact', head: true })
        .eq('contact_id', contactId).eq('status', 'sent');
      if ((count || 0) > 0) score += rule.points;
    }
    if (rule.condition_type === 'message_count') {
      const threshold = parseInt(rule.condition_value || '10');
      const { count } = await db.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', contactId);
      if ((count || 0) >= threshold) score += rule.points;
    }
  }
  return Math.max(0, Math.min(100, score));
}

interface SegmentCriterion {
  field: string;
  operator: string;
  value: string;
}

interface ContactSegment {
  id: string;
  name: string;
  description: string | null;
  criteria: { conditions: SegmentCriterion[] };
  contact_count: number;
  created_at: string;
}

const AVATAR_COLORS = [
  "bg-pink-400", "bg-green-500", "bg-blue-500", "bg-purple-500",
  "bg-red-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500"
];

const PAGE_SIZE = 50;

/** Returns true if the given birthday date (YYYY-MM-DD) falls on today (month+day) */
function isBirthdayToday(birthday: string | null): boolean {
  if (!birthday) return false;
  const today = new Date();
  const bday = new Date(birthday);
  return bday.getMonth() === today.getMonth() && bday.getDate() === today.getDate();
}

const SEGMENT_FIELDS = [
  { value: "tag", label: "Tag" },
  { value: "city", label: "Cidade" },
  { value: "state", label: "Estado" },
  { value: "created_period", label: "Período de criação" },
  { value: "no_message_days", label: "Sem mensagem há X dias" },
];

const SEGMENT_OPERATORS: Record<string, { value: string; label: string }[]> = {
  tag: [{ value: "contains", label: "contém" }],
  city: [{ value: "contains", label: "contém" }, { value: "equals", label: "igual a" }],
  state: [{ value: "contains", label: "contém" }, { value: "equals", label: "igual a" }],
  created_period: [{ value: "after", label: "após (data)" }, { value: "before", label: "antes (data)" }],
  no_message_days: [{ value: "gt", label: "maior que (dias)" }],
};

const Contacts = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();

  // Main tab: "contacts" | "segments"
  const [mainTab, setMainTab] = useState<"contacts" | "segments">("contacts");

  const queryClient = useQueryClient();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const vcfInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  // WhatsApp import
  const [whatsappImportOpen, setWhatsappImportOpen] = useState(false);
  const [importingWhatsApp, setImportingWhatsApp] = useState(false);
  const [whatsappConnections, setWhatsappConnections] = useState<{ id: string; instance_name: string }[]>([]);
  const [selectedWAInstance, setSelectedWAInstance] = useState("");

  // Pagination
  const [page, setPage] = useState(1);

  // Advanced filters
  const [filterState, setFilterState] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("all");
  const [showFilters, setShowFilters] = useState(false);

  // New/Edit contact dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCpfCnpj, setFormCpfCnpj] = useState("");
  const [formGender, setFormGender] = useState("");
  const [formBirthday, setFormBirthday] = useState("");
  const [formState, setFormState] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formDisableChatbot, setFormDisableChatbot] = useState(false);
  const [extraFields, setExtraFields] = useState<{ name: string; value: string }[]>([]);
  const [customFields, setCustomFields] = useState<{ key: string; value: string }[]>([]);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);

  // Duplicate detection
  const [duplicateWarning, setDuplicateWarning] = useState<{ id: string; name: string | null } | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [duplicatesDialog, setDuplicatesDialog] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<{ phone: string; count: number; ids: string[]; names: (string | null)[] }[]>([]);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [mergingGroup, setMergingGroup] = useState<string | null>(null);

  const openDuplicatesDialog = async () => {
    setDuplicatesDialog(true);
    setLoadingDuplicates(true);
    try {
      const data = await api.get<any[]>('/contacts/duplicates');
      setDuplicateGroups(data || []);
    } catch { toast.error("Erro ao buscar duplicados"); }
    finally { setLoadingDuplicates(false); }
  };

  const handleMerge = async (keepId: string, mergeIds: string[], phone: string) => {
    setMergingGroup(phone);
    try {
      await api.post('/contacts/merge', { keep_id: keepId, merge_ids: mergeIds });
      toast.success(`${mergeIds.length} contato(s) mesclado(s)`);
      setDuplicateGroups(prev => prev.filter(g => g.phone !== phone));
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch { toast.error("Erro ao mesclar contatos"); }
    finally { setMergingGroup(null); }
  };

  // CSV Import dialog
  type CsvImportStep = "upload" | "mapping" | "preview" | "result";
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvImportStep, setCsvImportStep] = useState<CsvImportStep>("upload");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvMapNome, setCsvMapNome] = useState("");
  const [csvMapTelefone, setCsvMapTelefone] = useState("");
  const [csvMapEmail, setCsvMapEmail] = useState("");
  const [csvMapTags, setCsvMapTags] = useState("");
  const [csvImportProgress, setCsvImportProgress] = useState(0);
  const [csvImportResult, setCsvImportResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null);
  const csvImportFileRef = useRef<HTMLInputElement>(null);

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);

  // ── Segments state ──
  const [segments, setSegments] = useState<ContactSegment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [segmentDialogOpen, setSegmentDialogOpen] = useState(false);
  const [editingSegment, setEditingSegment] = useState<ContactSegment | null>(null);
  const [segFormName, setSegFormName] = useState("");
  const [segFormDesc, setSegFormDesc] = useState("");
  const [segCriteria, setSegCriteria] = useState<SegmentCriterion[]>([
    { field: "city", operator: "contains", value: "" }
  ]);
  const [segCalculating, setSegCalculating] = useState(false);
  const [segCount, setSegCount] = useState<number | null>(null);
  const [segSaving, setSegSaving] = useState(false);

  // Preview contacts dialog
  const [previewSegmentOpen, setPreviewSegmentOpen] = useState(false);
  const [previewContacts, setPreviewContacts] = useState<{ id: string; name: string | null; phone: string }[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Sort
  const [sortField, setSortField] = useState<"name" | "created_at" | "last_message_at" | "lead_score">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Lead score calculation
  const [calculatingScores, setCalculatingScores] = useState(false);
  const [scoreProgress, setScoreProgress] = useState({ current: 0, total: 0 });

  // ── Bulk select state ──
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [availableTags, setAvailableTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [bulkTagApplying, setBulkTagApplying] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleCalculateScores = async () => {
    if (calculatingScores) return;
    const allContactIds = contacts.map(c => c.id);
    setCalculatingScores(true);
    setScoreProgress({ current: 0, total: allContactIds.length });
    let current = 0;
    for (const id of allContactIds) {
      try {
        const score = await calculateContactScore(id);
        await db.from('contacts').update({
          lead_score: score,
          lead_score_updated_at: new Date().toISOString(),
        } as any).eq('id', id);
      } catch { /* ignore per-contact errors */ }
      current++;
      setScoreProgress({ current, total: allContactIds.length });
    }
    setCalculatingScores(false);
    toast.success('Scores atualizados!');
    fetchContacts();
  };

  const fetchContactsQuery = useQuery({
    queryKey: ['contacts'],
    queryFn: async (): Promise<Contact[]> => {
      const [data, convos] = await Promise.all([
        api.get<Contact[]>('/contacts?limit=9999&order=created_at.desc'),
        api.get<{ contact_id: string; last_message_at: string }[]>('/conversations?select=contact_id,last_message_at&limit=9999&order=last_message_at.desc'),
      ]);
      const lastMsgMap = new Map<string, string>();
      for (const c of (convos || [])) {
        if (c.last_message_at && !lastMsgMap.has(c.contact_id)) {
          lastMsgMap.set(c.contact_id, c.last_message_at);
        }
      }
      return (data || []).map((c) => ({
        ...c,
        last_message_at: lastMsgMap.get(c.id) || null,
      }));
    },
    staleTime: 30_000,
  });

  // Sync query result into local state (preserves all existing UI code)
  useEffect(() => {
    if (fetchContactsQuery.data !== undefined) {
      setContacts(fetchContactsQuery.data);
    }
    setLoading(fetchContactsQuery.isLoading);
  }, [fetchContactsQuery.data, fetchContactsQuery.isLoading]);

  const fetchContacts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
  }, [queryClient]);

  const fetchSegments = async () => {
    setSegmentsLoading(true);
    const { data } = await db
      .from("contact_segments")
      .select("*")
      .order("created_at", { ascending: false });
    setSegments(
      (data || []).map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        criteria: (s.criteria as { conditions: SegmentCriterion[] }) || { conditions: [] },
        contact_count: s.contact_count || 0,
        created_at: s.created_at,
      }))
    );
    setSegmentsLoading(false);
  };

  useEffect(() => {
    // Load available tags for bulk tagging
    db.from("tags").select("id, name, color").then(({ data }) => {
      if (data) setAvailableTags(data);
    });
  }, []);

  useEffect(() => {
    if (mainTab === "segments") fetchSegments();
  }, [mainTab]);

  const loadWhatsAppConnections = async () => {
    const { data } = await db.from("evolution_connections").select("id, instance_name");
    setWhatsappConnections((data || []) as { id: string; instance_name: string }[]);
  };

  const openWhatsAppImport = () => {
    setSelectedWAInstance("");
    loadWhatsAppConnections();
    setWhatsappImportOpen(true);
  };

  const handleImportFromWhatsApp = async () => {
    if (!selectedWAInstance) return;
    setImportingWhatsApp(true);
    try {
      const { data: result, error } = await db.functions.invoke("evolution-api", {
        body: { action: "fetch_contacts", instanceName: selectedWAInstance },
      });

      if (error) throw new Error(error.message);

      const rawContacts: any[] = Array.isArray(result)
        ? result
        : Array.isArray(result?.contacts)
          ? result.contacts
          : [];

      const mapped = rawContacts
        .filter((c: any) => {
          const jid: string = c.id || "";
          return jid.includes("@s.whatsapp.net") && !jid.includes("@g.us");
        })
        .map((c: any) => {
          const phone = (c.id || "").replace("@s.whatsapp.net", "").replace(/\D/g, "");
          const name: string = c.pushName || c.name || phone;
          return { phone, name: name || null };
        })
        .filter((c: any) => c.phone && c.phone.length >= 8);

      if (mapped.length === 0) {
        toast.info("Nenhum contato válido encontrado nesta conexão.");
        setImportingWhatsApp(false);
        return;
      }

      const BATCH = 50;
      let imported = 0;
      for (let i = 0; i < mapped.length; i += BATCH) {
        const batch = mapped.slice(i, i + BATCH);
        toast.info(`Importando ${Math.min(i + BATCH, mapped.length)} de ${mapped.length} contatos...`);
        const { error: upsertErr } = await db
          .from("contacts")
          .upsert(batch as any, { onConflict: "phone", ignoreDuplicates: false });
        if (!upsertErr) imported += batch.length;
      }

      toast.success(`${imported} contatos importados do WhatsApp com sucesso!`);
      setWhatsappImportOpen(false);
      fetchContacts();
    } catch (err: any) {
      toast.error("Erro ao importar do WhatsApp: " + (err?.message || "Tente novamente"));
    } finally {
      setImportingWhatsApp(false);
    }
  };

  const filtered = useMemo(() => {
    const base = contacts.filter((c) => {
      if (debouncedSearch) {
        const s = debouncedSearch.toLowerCase();
        if (
          !(c.name || "").toLowerCase().includes(s) &&
          !c.phone.toLowerCase().includes(s)
        ) return false;
      }
      if (filterState && !((c.state || "").toLowerCase().includes(filterState.toLowerCase()))) return false;
      if (filterCity && !((c.city || "").toLowerCase().includes(filterCity.toLowerCase()))) return false;
      if (filterPeriod !== "all" && c.created_at) {
        const d = new Date(c.created_at);
        if (filterPeriod === "today" && !isToday(d)) return false;
        if (filterPeriod === "week" && !isThisWeek(d)) return false;
        if (filterPeriod === "month" && !isThisMonth(d)) return false;
      }
      return true;
    });
    return [...base].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;
      if (sortField === 'name') { aVal = (a.name || '').toLowerCase(); bVal = (b.name || '').toLowerCase(); }
      else if (sortField === 'created_at') { aVal = a.created_at || ''; bVal = b.created_at || ''; }
      else if (sortField === 'last_message_at') { aVal = a.last_message_at || ''; bVal = b.last_message_at || ''; }
      else if (sortField === 'lead_score') { aVal = a.lead_score ?? 0; bVal = b.lead_score ?? 0; }
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [contacts, debouncedSearch, filterState, filterCity, filterPeriod, sortField, sortDir]);

  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterState, filterCity, filterPeriod]);

  const stats = useMemo(() => {
    const today = contacts.filter((c) => isToday(new Date(c.created_at))).length;
    const week = contacts.filter((c) => isThisWeek(new Date(c.created_at))).length;
    const month = contacts.filter((c) => isThisMonth(new Date(c.created_at))).length;
    const total = contacts.length;
    return { today, week, month, total };
  }, [contacts]);

  const getInitials = (name: string | null, _phone: string) => {
    if (name && name.trim()) return name.charAt(0).toUpperCase();
    return "C";
  };

  const getAvatarColor = (id: string) => {
    const index = id.charCodeAt(0) % AVATAR_COLORS.length;
    return AVATAR_COLORS[index];
  };

  const resetForm = () => {
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    setFormCpfCnpj("");
    setFormGender("");
    setFormBirthday("");
    setFormState("");
    setFormCity("");
    setFormAddress("");
    setFormReference("");
    setFormDisableChatbot(false);
    setExtraFields([]);
    setCustomFields([]);
    setCustomFieldsOpen(false);
    setDuplicateWarning(null);
    setEditingContact(null);
  };

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (c: Contact) => {
    logAudit("view_contact", "contact", c.id, c.name || c.phone);
    resetForm();
    setEditingContact(c);
    setFormName(c.name || "");
    setFormPhone(c.phone);
    setFormEmail(c.email || "");
    setFormCpfCnpj(c.cpf_cnpj || "");
    setFormGender(c.gender || "");
    setFormBirthday(c.birthday || "");
    setFormState(c.state || "");
    setFormCity(c.city || "");
    setFormAddress(c.address || "");
    setFormReference(c.reference || "");
    setFormDisableChatbot(c.disable_chatbot || false);
    setExtraFields(c.extra_fields || []);
    const cf = c.custom_fields || {};
    setCustomFields(Object.entries(cf).map(([key, value]) => ({ key, value: String(value) })));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formPhone.trim()) {
      toast.error("Número é obrigatório");
      return;
    }
    const rawPhone = unformatPhone(formPhone);

    if (!/^\d{10,11}$/.test(rawPhone)) {
      toast.error("Número inválido. Use formato: DDD + número (10 ou 11 dígitos)");
      return;
    }

    const mergedCustomFields: Record<string, string> = {};
    for (const cf of customFields) {
      if (cf.key.trim()) mergedCustomFields[cf.key.trim()] = cf.value;
    }

    const contactData = {
      name: formName || null,
      phone: rawPhone,
      email: formEmail || null,
      cpf_cnpj: formCpfCnpj || null,
      gender: formGender || null,
      birthday: formBirthday || null,
      state: formState || null,
      city: formCity || null,
      address: formAddress || null,
      reference: formReference || null,
      disable_chatbot: formDisableChatbot,
      extra_fields: extraFields.length > 0 ? extraFields : null,
      custom_fields: Object.keys(mergedCustomFields).length > 0 ? mergedCustomFields : null,
      updated_at: new Date().toISOString(),
    };

    if (editingContact) {
      try {
        await api.patch(`/contacts/${editingContact.id}`, contactData);
        logAudit("edit_contact", "contact", editingContact.id, contactData.name || editingContact.phone);
        toast.success("Contato atualizado!");
        setDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
      } catch {
        toast.error("Erro ao atualizar contato");
      }
    } else {
      try {
        await api.post('/contacts', contactData);
        toast.success("Contato adicionado!");
        setDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ['contacts'] });
      } catch {
        toast.error("Erro ao criar contato");
      }
    }
  };

  const confirmDelete = (c: Contact) => {
    setContactToDelete(c);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!contactToDelete) return;
    try {
      await api.delete(`/contacts/${contactToDelete.id}`);
      logAudit("delete_contact", "contact", contactToDelete.id, contactToDelete.name || contactToDelete.phone);
      toast.success("Contato excluído");
      setDeleteOpen(false);
      setContactToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
    } catch {
      toast.error("Erro ao excluir contato");
    }
  };

  const formatDateTime = (d: string | null | undefined) => {
    if (!d) return "";
    try {
      return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return "";
    }
  };

  const handleExportCSV = () => {
    if (contacts.length === 0) { toast.error("Nenhum contato para exportar"); return; }
    const headers = ["Nome", "Telefone", "Email", "CPF/CNPJ", "Gênero", "Aniversário", "Estado", "Cidade", "Endereço", "Referência"];
    const rows = contacts.map(c => [
      c.name || "", c.phone, c.email || "", c.cpf_cnpj || "",
      c.gender || "", c.birthday || "", c.state || "",
      c.city || "", c.address || "", c.reference || ""
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `contatos_${new Date().toISOString().split("T")[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    logAudit("export_contacts", "contacts", "csv", "Exportação CSV", { count: contacts.length });
    toast.success(`${contacts.length} contatos exportados`);
  };

  // ── Bulk select helpers ──
  const toggleSelectContact = (id: string) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAllFilteredSelected(false);
  };

  const toggleSelectAll = () => {
    const visibleIds = paginated.map((c) => c.id);
    const allVisible = visibleIds.every((id) => selectedContacts.has(id));
    if (allVisible) {
      setSelectedContacts(new Set());
      setAllFilteredSelected(false);
    } else {
      setSelectedContacts(new Set(visibleIds));
      setAllFilteredSelected(false);
    }
  };

  const selectAllFiltered = () => {
    setSelectedContacts(new Set(filtered.map((c) => c.id)));
    setAllFilteredSelected(true);
  };

  const clearSelection = () => {
    setSelectedContacts(new Set());
    setAllFilteredSelected(false);
  };

  const handleBulkExport = () => {
    const toExport = contacts.filter((c) => selectedContacts.has(c.id));
    if (toExport.length === 0) return;
    const headers = ["Nome", "Telefone", "Email", "CPF/CNPJ", "Gênero", "Aniversário", "Estado", "Cidade", "Endereço", "Referência"];
    const rows = toExport.map(c => [
      c.name || "", c.phone, c.email || "", c.cpf_cnpj || "",
      c.gender || "", c.birthday || "", c.state || "",
      c.city || "", c.address || "", c.reference || ""
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contatos_selecionados_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${toExport.length} contatos exportados`);
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    const ids = Array.from(selectedContacts);
    const { error } = await db.from("contacts").delete().in("id", ids);
    setBulkDeleting(false);
    if (error) {
      toast.error("Erro ao excluir contatos");
    } else {
      toast.success(`${ids.length} contato(s) excluído(s)`);
      setBulkDeleteOpen(false);
      clearSelection();
      fetchContacts();
    }
  };

  const openBulkTagDialog = () => {
    setSelectedTagIds(new Set());
    setBulkTagOpen(true);
  };

  const handleBulkApplyTags = async () => {
    if (selectedTagIds.size === 0) return;
    setBulkTagApplying(true);
    const contactIds = Array.from(selectedContacts);
    const tagIds = Array.from(selectedTagIds);
    const rows = contactIds.flatMap((contact_id) =>
      tagIds.map((tag_id) => ({ contact_id, tag_id }))
    );
    const { error } = await db.from("contact_tags").upsert(rows, { onConflict: "contact_id,tag_id", ignoreDuplicates: true });
    setBulkTagApplying(false);
    if (error) {
      toast.error("Erro ao aplicar tags");
    } else {
      toast.success(`Tags aplicadas em ${contactIds.length} contato(s)`);
      setBulkTagOpen(false);
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (csvInputRef.current) csvInputRef.current.value = "";
    setImporting(true);

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) { toast.error("CSV vazio ou sem dados"); setImporting(false); return; }

      const sep = lines[0].includes(";") ? ";" : ",";
      const headers = lines[0].split(sep).map(h => h.replace(/"/g, "").toLowerCase().trim());

      const getCol = (row: string[], name: string) => {
        const idx = headers.findIndex(h => h.includes(name));
        return idx >= 0 ? (row[idx] || "").replace(/"/g, "").trim() : "";
      };

      const records = lines.slice(1).map(line => {
        const row = line.split(sep);
        const phone = getCol(row, "fone") || getCol(row, "telef") || getCol(row, "phone") || getCol(row, "cel") || getCol(row, "whats");
        if (!phone) return null;
        return {
          name: getCol(row, "nome") || getCol(row, "name") || null,
          phone: phone.replace(/\D/g, ""),
          email: getCol(row, "email") || getCol(row, "e-mail") || null,
          state: getCol(row, "estado") || getCol(row, "state") || getCol(row, "uf") || null,
          city: getCol(row, "cidade") || getCol(row, "city") || null,
        };
      }).filter(Boolean);

      if (records.length === 0) { toast.error("Nenhum contato válido encontrado. Verifique se há coluna de telefone."); setImporting(false); return; }

      let imported = 0;
      const BATCH = 50;
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const { error } = await db.from("contacts").upsert(batch as any, { onConflict: "phone", ignoreDuplicates: false });
        if (!error) imported += batch.length;
      }

      toast.success(`${imported} contatos importados com sucesso!`);
      fetchContacts();
    } catch (err: any) {
      toast.error("Erro ao importar: " + (err?.message || "Verifique o formato do CSV"));
    } finally {
      setImporting(false);
    }
  };

  // ── vCard (.vcf) import ──
  const handleImportVCF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (vcfInputRef.current) vcfInputRef.current.value = "";
    try {
      const text = await file.text();
      const result = await api.post<{ imported: number; skipped: number; errors: number }>('/contacts/import-vcf', { vcf: text });
      toast.success(`${result.imported} contatos importados (${result.skipped} ignorados)`);
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      fetchContacts();
    } catch (err: any) {
      toast.error("Erro ao importar vCard: " + (err?.message || "Verifique o arquivo .vcf"));
    }
  };

  // ── Duplicate detection ──
  const checkDuplicatePhone = async (phone: string) => {
    const raw = unformatPhone(phone);
    if (!raw || raw.length < 8) { setDuplicateWarning(null); return; }
    setCheckingDuplicate(true);
    try {
      const query = db.from("contacts").select("id, name").eq("phone", raw).single();
      const { data: existing } = await query;
      if (existing && (!editingContact || existing.id !== editingContact.id)) {
        setDuplicateWarning({ id: existing.id, name: existing.name });
      } else {
        setDuplicateWarning(null);
      }
    } catch {
      setDuplicateWarning(null);
    } finally {
      setCheckingDuplicate(false);
    }
  };

  const goToExistingContact = (contactId: string) => {
    const found = contacts.find((c) => c.id === contactId);
    if (found) {
      setDialogOpen(false);
      setTimeout(() => openEdit(found), 100);
    }
  };

  // ── CSV Import helpers ──
  function parseCSV(text: string): string[][] {
    return text.trim().split('\n').map(line =>
      line.split(',').map(cell => cell.replace(/^"|"$/g, '').trim())
    );
  }

  const openCsvImportDialog = () => {
    setCsvImportStep("upload");
    setCsvFile(null);
    setCsvHeaders([]);
    setCsvRows([]);
    setCsvMapNome("");
    setCsvMapTelefone("");
    setCsvMapEmail("");
    setCsvMapTags("");
    setCsvImportProgress(0);
    setCsvImportResult(null);
    setCsvImportOpen(true);
  };

  const handleCsvFileSelect = async (file: File) => {
    setCsvFile(file);
    const text = await file.text();
    const parsed = parseCSV(text);
    if (parsed.length < 2) { toast.error("CSV vazio ou sem dados"); return; }
    setCsvHeaders(parsed[0]);
    setCsvRows(parsed.slice(1).filter(r => r.some(c => c.trim())));
    setCsvImportStep("mapping");
  };

  const handleCsvImportExecute = async () => {
    if (!csvMapNome || !csvMapTelefone) {
      toast.error("Mapeie pelo menos Nome e Telefone");
      return;
    }
    const nomeIdx = csvHeaders.indexOf(csvMapNome);
    const telIdx = csvHeaders.indexOf(csvMapTelefone);
    const emailIdx = csvMapEmail ? csvHeaders.indexOf(csvMapEmail) : -1;
    const tagsIdx = csvMapTags ? csvHeaders.indexOf(csvMapTags) : -1;

    setCsvImportStep("preview");
    setCsvImportProgress(0);

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const total = csvRows.length;

    for (let i = 0; i < total; i++) {
      const row = csvRows[i];
      const name = nomeIdx >= 0 ? (row[nomeIdx] || "").trim() : "";
      const phone = telIdx >= 0 ? (row[telIdx] || "").replace(/\D/g, "") : "";
      const email = emailIdx >= 0 ? (row[emailIdx] || "").trim() : undefined;
      const tagsRaw = tagsIdx >= 0 ? (row[tagsIdx] || "").trim() : "";
      const tagsArray = tagsRaw ? tagsRaw.split(";").map(t => t.trim()).filter(Boolean) : undefined;

      if (!phone || phone.length < 8) { errors++; setCsvImportProgress(Math.round(((i + 1) / total) * 100)); continue; }

      // Duplicate check
      const { data: existing } = await db.from("contacts").select("id").eq("phone", phone).single();
      if (existing) { skipped++; setCsvImportProgress(Math.round(((i + 1) / total) * 100)); continue; }

      const { error } = await db.from("contacts").insert({
        name: name || null,
        phone,
        email: email || null,
        tags: tagsArray as any,
      });
      if (error) { errors++; } else { imported++; }
      setCsvImportProgress(Math.round(((i + 1) / total) * 100));
    }

    setCsvImportResult({ imported, skipped, errors });
    setCsvImportStep("result");
    if (imported > 0) fetchContacts();
  };

  // ── Segment helpers ──
  const openNewSegment = () => {
    setEditingSegment(null);
    setSegFormName("");
    setSegFormDesc("");
    setSegCriteria([{ field: "city", operator: "contains", value: "" }]);
    setSegCount(null);
    setSegmentDialogOpen(true);
  };

  const openEditSegment = (seg: ContactSegment) => {
    setEditingSegment(seg);
    setSegFormName(seg.name);
    setSegFormDesc(seg.description || "");
    setSegCriteria(
      seg.criteria?.conditions?.length > 0
        ? seg.criteria.conditions
        : [{ field: "city", operator: "contains", value: "" }]
    );
    setSegCount(seg.contact_count);
    setSegmentDialogOpen(true);
  };

  const addCriterion = () => {
    setSegCriteria(prev => [...prev, { field: "city", operator: "contains", value: "" }]);
  };

  const removeCriterion = (idx: number) => {
    setSegCriteria(prev => prev.filter((_, i) => i !== idx));
  };

  const updateCriterion = (idx: number, key: keyof SegmentCriterion, val: string) => {
    setSegCriteria(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      if (key === "field") {
        const ops = SEGMENT_OPERATORS[val] || [];
        next[idx].operator = ops[0]?.value || "contains";
        next[idx].value = "";
      }
      return next;
    });
  };

  const buildSegmentQuery = async (criteria: SegmentCriterion[]) => {
    let query = db.from("contacts").select("id, name, phone");

    for (const c of criteria) {
      if (!c.value.trim()) continue;

      if (c.field === "tag") {
        // query contact_tags to find contact IDs with this tag
        const { data: tagRows } = await db
          .from("contact_tags")
          .select("contact_id")
          .ilike("tag", `%${c.value}%`);
        const ids = (tagRows || []).map((r: any) => r.contact_id);
        if (ids.length === 0) return null; // no match
        query = query.in("id", ids);
      } else if (c.field === "city") {
        query = query.ilike("city", `%${c.value}%`);
      } else if (c.field === "state") {
        query = query.ilike("state", `%${c.value}%`);
      } else if (c.field === "created_period") {
        if (c.operator === "after") {
          query = query.gte("created_at", new Date(c.value).toISOString());
        } else {
          query = query.lte("created_at", new Date(c.value).toISOString());
        }
      } else if (c.field === "no_message_days") {
        const days = parseInt(c.value) || 0;
        const cutoff = subDays(new Date(), days).toISOString();
        // find contacts that have no conversation since cutoff OR never had one
        const { data: activeConvos } = await db
          .from("conversations")
          .select("contact_id")
          .gte("last_message_at", cutoff);
        const activeIds = (activeConvos || []).map((r: any) => r.contact_id);
        if (activeIds.length > 0) {
          query = query.not("id", "in", `(${activeIds.join(",")})`);
        }
      }
    }

    return query;
  };

  const handleCalculateSegment = async () => {
    setSegCalculating(true);
    setSegCount(null);
    try {
      const q = await buildSegmentQuery(segCriteria);
      if (q === null) {
        setSegCount(0);
        setSegCalculating(false);
        return;
      }
      const { data, error } = await q;
      if (error) throw error;
      setSegCount((data || []).length);
    } catch (err: any) {
      toast.error("Erro ao calcular segmento: " + (err?.message || ""));
    } finally {
      setSegCalculating(false);
    }
  };

  const handleSaveSegment = async () => {
    if (!segFormName.trim()) { toast.error("Nome do segmento é obrigatório"); return; }
    if (!user) return;
    setSegSaving(true);

    // Calculate count for storage
    let count = segCount ?? 0;
    if (segCount === null) {
      try {
        const q = await buildSegmentQuery(segCriteria);
        if (q !== null) {
          const { data } = await q;
          count = (data || []).length;
        }
      } catch { /* ignore */ }
    }

    const payload = {
      user_id: user.id,
      name: segFormName.trim(),
      description: segFormDesc.trim() || null,
      criteria: { conditions: segCriteria } as any,
      contact_count: count,
      updated_at: new Date().toISOString(),
    };

    if (editingSegment) {
      const { error } = await db
        .from("contact_segments")
        .update(payload)
        .eq("id", editingSegment.id);
      if (error) { toast.error("Erro ao salvar segmento"); setSegSaving(false); return; }
      toast.success("Segmento atualizado!");
    } else {
      const { error } = await db.from("contact_segments").insert(payload);
      if (error) { toast.error("Erro ao criar segmento"); setSegSaving(false); return; }
      toast.success("Segmento criado!");
    }

    setSegSaving(false);
    setSegmentDialogOpen(false);
    fetchSegments();
  };

  const handleDeleteSegment = async (id: string) => {
    const { error } = await db.from("contact_segments").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir segmento"); return; }
    toast.success("Segmento excluído");
    fetchSegments();
  };

  const handlePreviewSegment = async (seg: ContactSegment) => {
    setPreviewContacts([]);
    setPreviewLoading(true);
    setPreviewSegmentOpen(true);
    try {
      const q = await buildSegmentQuery(seg.criteria?.conditions || []);
      if (q === null) { setPreviewLoading(false); return; }
      const { data, error } = await q;
      if (error) throw error;
      setPreviewContacts((data || []).map((c: any) => ({ id: c.id, name: c.name, phone: c.phone })));
    } catch (err: any) {
      toast.error("Erro ao visualizar segmento");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleUsarEmCampanha = (segId: string) => {
    navigator.clipboard.writeText(segId).catch(() => {});
    toast.info("Segmento copiado! Cole na seleção de contatos ao criar a campanha.");
  };

  const criteriaLabel = (seg: ContactSegment) => {
    const conds = seg.criteria?.conditions || [];
    if (conds.length === 0) return "Sem critérios";
    return conds
      .map(c => {
        const fieldLabel = SEGMENT_FIELDS.find(f => f.value === c.field)?.label || c.field;
        return `${fieldLabel}: ${c.value}`;
      })
      .join(" | ");
  };

  const statCards = [
    { label: "Hoje", value: stats.today, sub: "Novos contatos", icon: CalendarIcon, iconBg: "bg-blue-500", iconColor: "text-white" },
    { label: "Esta Semana", value: stats.week, sub: "Últimos 7 dias", icon: CalendarDays, iconBg: "bg-red-500", iconColor: "text-white" },
    { label: "Este Mês", value: stats.month, sub: "Mês atual", icon: CalendarRange, iconBg: "bg-green-500", iconColor: "text-white" },
    { label: "Total", value: stats.total, sub: "Todos os contatos", icon: Users, iconBg: "bg-blue-600", iconColor: "text-white" },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="mx-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-blue-600">Contatos</h1>
            {/* Tab switcher */}
            <div className="flex items-center bg-muted rounded-lg p-1">
              <button
                className={`px-3 py-1 text-sm rounded-md font-medium transition-colors ${mainTab === "contacts" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setMainTab("contacts")}
              >
                Contatos
              </button>
              <button
                className={`px-3 py-1 text-sm rounded-md font-medium transition-colors flex items-center gap-1 ${mainTab === "segments" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setMainTab("segments")}
              >
                <Layers className="h-3.5 w-3.5" />
                Segmentos
              </button>
            </div>
          </div>

          {mainTab === "contacts" ? (
            <div className="flex items-center gap-3">
              <div className="relative w-52">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9 rounded-md"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9"
                onClick={() => setShowFilters((v) => !v)}
              >
                <Filter className="h-4 w-4" />
                Filtros
              </Button>
              {(filterState || filterCity || filterPeriod !== "all") && (
                <button
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => { setFilterState(""); setFilterCity(""); setFilterPeriod("all"); }}
                >
                  Limpar filtros
                </button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="bg-green-600 hover:bg-green-700 text-white uppercase text-xs font-semibold gap-1.5">
                    IMPORTAR / EXPORTAR
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="gap-2" onClick={() => csvInputRef.current?.click()} disabled={importing}>
                    <Upload className="h-4 w-4" /> {importing ? "Importando..." : "Importar CSV"}
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onClick={openWhatsAppImport} disabled={importingWhatsApp}>
                    <Smartphone className="h-4 w-4 text-green-600" /> Importar do WhatsApp
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onClick={() => vcfInputRef.current?.click()}>
                    <Upload className="h-4 w-4 text-purple-600" /> Importar vCard (.vcf)
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onClick={async () => {
                    toast.info("Sincronizando fotos de perfil...");
                    try {
                      const r = await api.post<{ updated: number; total: number }>('/contacts/sync-avatars');
                      toast.success(`${r.updated} de ${r.total} fotos sincronizadas`);
                      queryClient.invalidateQueries({ queryKey: ['contacts'] });
                    } catch (e: any) { toast.error(e.message || "Erro ao sincronizar"); }
                  }}>
                    <User className="h-4 w-4 text-blue-500" /> Sincronizar fotos WhatsApp
                  </DropdownMenuItem>
                  <DropdownMenuItem className="gap-2" onClick={openDuplicatesDialog}>
                    <GitMerge className="h-4 w-4 text-orange-500" /> Detectar duplicados
                  </DropdownMenuItem>
                  {can("export_contacts") && (
                    <DropdownMenuItem className="gap-2" onClick={handleExportCSV}>
                      <Download className="h-4 w-4" /> Exportar CSV
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9 border-blue-300 text-blue-600 hover:bg-blue-50"
                onClick={openCsvImportDialog}
              >
                <Upload className="h-4 w-4" />
                Importar CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 h-9 border-purple-300 text-purple-600 hover:bg-purple-50"
                onClick={handleCalculateScores}
                disabled={calculatingScores}
              >
                <Calculator className="h-4 w-4" />
                {calculatingScores ? `Calculando... ${scoreProgress.current}/${scoreProgress.total}` : 'Calcular Scores'}
              </Button>
              <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white uppercase text-xs font-semibold">
                ADICIONAR CONTATO
              </Button>
            </div>
          ) : (
            <Button onClick={openNewSegment} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 text-xs font-semibold uppercase">
              <Plus className="h-4 w-4" />
              + Novo Segmento
            </Button>
          )}
        </div>
        {mainTab === "contacts" && showFilters && (
          <div className="flex items-center gap-3 mt-3">
            <Input
              placeholder="Estado"
              value={filterState}
              onChange={(e) => setFilterState(e.target.value)}
              className="h-8 w-32 text-sm"
            />
            <Input
              placeholder="Cidade"
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              className="h-8 w-40 text-sm"
            />
            <select
              value={filterPeriod}
              onChange={(e) => setFilterPeriod(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="today">Hoje</option>
              <option value="week">Esta semana</option>
              <option value="month">Este mês</option>
            </select>
          </div>
        )}
      </div>
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleImportCSV}
      />
      <input
        ref={csvImportFileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFileSelect(f); if (csvImportFileRef.current) csvImportFileRef.current.value = ""; }}
      />
      <input
        ref={vcfInputRef}
        type="file"
        accept=".vcf"
        className="hidden"
        onChange={handleImportVCF}
      />

      {/* CONTACTS TAB */}
      {mainTab === "contacts" && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4 px-6 py-4">
            {statCards.map((card, i) => (
              <div
                key={i}
                className={`border rounded-lg p-4 ${i === 3 ? "border-blue-500 border-2" : "border-border"}`}
              >
                <div className={`h-10 w-10 rounded-lg ${card.iconBg} flex items-center justify-center mb-2`}>
                  <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
                <p className="text-sm text-muted-foreground">{card.label}</p>
                <p className="text-3xl font-bold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">↗ {card.sub}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto px-6 pb-4">
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 pr-0">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                        checked={paginated.length > 0 && paginated.every((c) => selectedContacts.has(c.id))}
                        onChange={toggleSelectAll}
                        title="Selecionar visíveis"
                      />
                    </TableHead>
                    <TableHead className="w-8"></TableHead>
                    <TableHead
                      className="text-xs font-bold uppercase tracking-wider cursor-pointer select-none hover:text-foreground"
                      onClick={() => { setSortField('name'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}
                    >
                      Nome {sortField === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider">Número WhatsApp</TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider">E-mail</TableHead>
                    <TableHead
                      className="text-xs font-bold uppercase tracking-wider cursor-pointer select-none hover:text-foreground"
                      onClick={() => { setSortField('last_message_at'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}
                    >
                      Última Interação {sortField === 'last_message_at' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider">Status</TableHead>
                    <TableHead
                      className="text-xs font-bold uppercase tracking-wider cursor-pointer select-none hover:text-foreground"
                      onClick={() => { setSortField('lead_score'); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}
                      title="Score calculado com base em engajamento"
                    >
                      Score {sortField === 'lead_score' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                    </TableHead>
                    <TableHead className="text-xs font-bold uppercase tracking-wider text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-16 text-center text-muted-foreground">
                        Nenhum contato encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((contact) => (
                      <TableRow key={contact.id} className={`hover:bg-muted/30 ${selectedContacts.has(contact.id) ? "bg-primary/5" : ""}`}>
                        <TableCell className="pr-0">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                            checked={selectedContacts.has(contact.id)}
                            onChange={() => toggleSelectContact(contact.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={contact.avatar_url || undefined} />
                            <AvatarFallback className={`${getAvatarColor(contact.id)} text-white text-xs font-semibold`}>
                              {getInitials(contact.name, contact.phone)}
                            </AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-green-500 opacity-60" />
                            <span className="text-sm font-medium text-foreground">
                              {contact.name || ""}
                            </span>
                            {isBirthdayToday(contact.birthday) && (
                              <span title="Aniversário hoje!" className="text-base leading-none">🎂</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          {contact.phone}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground"></TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDateTime(contact.last_message_at)}
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 gap-1">
                            <CheckCircle className="h-3 w-3" /> Ativo
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {contact.lead_score != null ? (() => {
                            const badge = getScoreBadge(contact.lead_score);
                            return (
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${badge.className}`}
                                title="Score calculado com base em engajamento"
                              >
                                {badge.emoji} {contact.lead_score} <span className="font-normal opacity-70">{badge.label}</span>
                              </span>
                            );
                          })() : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-0.5">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50" onClick={() => navigate(`/contatos/${contact.id}/profile`)} title="Ver Perfil">
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50" onClick={() => navigate()} title="Ver Timeline">
                              <Clock className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" title="Estatísticas">
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => navigate("/inbox")} title="WhatsApp">
                              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => openEdit(contact)} title="Editar">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {can("delete_contacts") && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => confirmDelete(contact)} title="Excluir">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {/* Select all filtered link */}
            {paginated.length > 0 && paginated.every((c) => selectedContacts.has(c.id)) && !allFilteredSelected && filtered.length > paginated.length && (
              <div className="flex justify-center py-2 bg-primary/5 border-t border-border">
                <button
                  className="text-xs text-primary hover:underline font-medium"
                  onClick={selectAllFiltered}
                >
                  Selecionar todos os {filtered.length} contatos filtrados
                </button>
              </div>
            )}
            {allFilteredSelected && (
              <div className="flex justify-center items-center gap-2 py-2 bg-primary/5 border-t border-border">
                <span className="text-xs text-primary font-medium">Todos os {filtered.length} contatos filtrados selecionados.</span>
                <button className="text-xs text-primary hover:underline" onClick={clearSelection}>Limpar seleção</button>
              </div>
            )}
            {filtered.length > page * PAGE_SIZE && (
              <div className="flex justify-center py-3">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)}>
                  Carregar mais ({filtered.length - page * PAGE_SIZE} restantes)
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Bulk Action Bar */}
      {selectedContacts.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between gap-3 px-6 py-3 bg-gray-900 dark:bg-gray-950 text-white border-t border-gray-700 shadow-2xl">
          <span className="text-sm font-medium whitespace-nowrap">
            {selectedContacts.size} contato(s) selecionado(s)
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-gray-600 text-white hover:bg-gray-700 bg-transparent gap-1.5"
              onClick={openBulkTagDialog}
            >
              <Tag className="h-3.5 w-3.5" />
              Adicionar tag
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-gray-600 text-white hover:bg-gray-700 bg-transparent gap-1.5"
              onClick={handleBulkExport}
            >
              <Download className="h-3.5 w-3.5" />
              Exportar selecionados
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-gray-600 text-white hover:bg-gray-700 bg-transparent gap-1.5"
              onClick={() => {
                toast.info("Copie os IDs e use na seleção da campanha");
              }}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Adicionar à campanha
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-red-500 text-red-400 hover:bg-red-900/30 bg-transparent gap-1.5"
              onClick={() => setBulkDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir selecionados
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-gray-400 hover:text-white hover:bg-gray-700 gap-1"
              onClick={clearSelection}
            >
              <X className="h-3.5 w-3.5" />
              Desmarcar
            </Button>
          </div>
        </div>
      )}

      {/* SEGMENTS TAB */}
      {mainTab === "segments" && (
        <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-foreground">Segmentos Inteligentes</h2>
              <p className="text-sm text-muted-foreground">Agrupe contatos com base em critérios dinâmicos</p>
            </div>
            <Button variant="outline" size="icon" onClick={fetchSegments}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {segmentsLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : segments.length === 0 ? (
            <Card className="p-12 flex flex-col items-center justify-center text-center">
              <Layers className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-semibold text-foreground">Nenhum segmento criado</h3>
              <p className="text-sm text-muted-foreground mt-1">Crie segmentos para agrupar contatos por critérios específicos</p>
              <Button className="mt-4 gap-2" onClick={openNewSegment}>
                <Plus className="h-4 w-4" />
                Novo Segmento
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4">
              {segments.map((seg) => (
                <Card key={seg.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Layers className="h-4 w-4 text-blue-500 shrink-0" />
                        <p className="font-bold text-foreground">{seg.name}</p>
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                          {seg.contact_count} contatos
                        </Badge>
                      </div>
                      {seg.description && (
                        <p className="text-sm text-muted-foreground mb-2">{seg.description}</p>
                      )}
                      <p className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 inline-block">
                        {criteriaLabel(seg)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => handlePreviewSegment(seg)}
                      >
                        <Eye className="h-3 w-3" /> Visualizar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs text-blue-600 border-blue-300"
                        onClick={() => handleUsarEmCampanha(seg.id)}
                      >
                        Usar em Campanha
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditSegment(seg)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDeleteSegment(seg.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Criado em {format(new Date(seg.created_at), "dd/MM/yyyy", { locale: ptBR })}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Contact Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 px-6 py-4 flex items-center gap-3">
            <Plus className="h-5 w-5 text-white" />
            <h2 className="text-lg font-bold text-white">
              {editingContact ? "Editar contato" : "Adicionar contato"}
            </h2>
            <button onClick={() => setDialogOpen(false)} className="ml-auto text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
            {!editingContact && (
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-800">
                  <strong>Dica:</strong> Ao adicionar um contato, selecione o código do país (DDI) correto e digite o número sem espaços ou caracteres especiais.
                </p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <User className="h-4 w-4" /> Dados do contato
              </h3>
              <div className="space-y-4">
                <FloatingInput label="Nome" value={formName} onChange={(e) => setFormName(e.target.value)} />
                <div>
                  <FloatingInput
                    label="Número"
                    value={formPhone}
                    onChange={(e) => { setFormPhone(e.target.value); setDuplicateWarning(null); }}
                    onBlur={() => checkDuplicatePhone(formPhone)}
                    placeholder="5511987654321"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Digite o número completo com DDI (ex: 5511987654321)</p>
                  {checkingDuplicate && (
                    <p className="text-xs text-muted-foreground mt-1">Verificando...</p>
                  )}
                  {duplicateWarning && (
                    <div className="mt-2 flex items-start gap-2 bg-yellow-50 border border-yellow-300 rounded-lg px-3 py-2">
                      <span className="text-yellow-600 text-sm mt-0.5">⚠️</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-yellow-800">
                          Já existe um contato com este telefone: <strong>{duplicateWarning.name || "Sem nome"}</strong>. Deseja ver o contato existente?
                        </p>
                        <button
                          type="button"
                          className="mt-1 text-xs text-yellow-700 font-semibold underline hover:text-yellow-900"
                          onClick={() => goToExistingContact(duplicateWarning.id)}
                        >
                          Ver contato
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <Mail className="h-4 w-4" /> Informações de Contato
              </h3>
              <FloatingInput label="E-Mail" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="exemplo@email.com" />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <User className="h-4 w-4" /> Dados Pessoais
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <FloatingInput label="CPF / CNPJ" value={formCpfCnpj} onChange={(e) => setFormCpfCnpj(e.target.value)} />
                <FloatingInput label="Gênero" value={formGender} onChange={(e) => setFormGender(e.target.value)} />
              </div>
              <FloatingInput label="Aniversário" type="date" value={formBirthday} onChange={(e) => setFormBirthday(e.target.value)} />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <MapPin className="h-4 w-4" /> Localização
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <FloatingInput label="Estado" value={formState} onChange={(e) => setFormState(e.target.value)} />
                <FloatingInput label="Cidade" value={formCity} onChange={(e) => setFormCity(e.target.value)} />
              </div>
              <div className="space-y-4">
                <FloatingInput label="Endereço" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
                <FloatingInput label="Referência / Indicação" value={formReference} onChange={(e) => setFormReference(e.target.value)} />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <Settings className="h-4 w-4" /> Configurações Especiais
              </h3>
              <div className="flex items-center gap-3">
                <Switch checked={formDisableChatbot} onCheckedChange={setFormDisableChatbot} />
                <span className="text-sm text-foreground">Desabilitar chatbot para este contato</span>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <Info className="h-4 w-4" /> Informações adicionais
              </h3>
              {extraFields.map((field, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2">
                  <FloatingInput
                    label="Nome do Campo"
                    value={field.name}
                    onChange={(e) => {
                      const updated = [...extraFields];
                      updated[i].name = e.target.value;
                      setExtraFields(updated);
                    }}
                  />
                  <FloatingInput
                    label="Valor"
                    value={field.value}
                    onChange={(e) => {
                      const updated = [...extraFields];
                      updated[i].value = e.target.value;
                      setExtraFields(updated);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground"
                    onClick={() => setExtraFields(extraFields.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                className="w-full border-blue-300 text-blue-600 hover:bg-blue-50 uppercase text-xs font-semibold"
                onClick={() => setExtraFields([...extraFields, { name: "", value: "" }])}
              >
                + ADICIONAR INFORMAÇÃO
              </Button>
            </div>

            {/* Custom Fields */}
            <div>
              <button
                type="button"
                className="w-full flex items-center justify-between text-sm font-semibold text-blue-600 mb-2"
                onClick={() => setCustomFieldsOpen((v) => !v)}
              >
                <span className="flex items-center gap-2">
                  <Settings className="h-4 w-4" /> Campos Customizados
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${customFieldsOpen ? "rotate-180" : ""}`} />
              </button>
              {customFieldsOpen && (
                <div className="space-y-2 mt-2">
                  {customFields.map((cf, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <FloatingInput
                        label="Nome do campo"
                        value={cf.key}
                        onChange={(e) => {
                          const updated = [...customFields];
                          updated[i] = { ...updated[i], key: e.target.value };
                          setCustomFields(updated);
                        }}
                      />
                      <FloatingInput
                        label="Valor"
                        value={cf.value}
                        onChange={(e) => {
                          const updated = [...customFields];
                          updated[i] = { ...updated[i], value: e.target.value };
                          setCustomFields(updated);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground"
                        onClick={() => setCustomFields(customFields.filter((_, j) => j !== i))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    className="w-full border-blue-300 text-blue-600 hover:bg-blue-50 uppercase text-xs font-semibold"
                    onClick={() => setCustomFields([...customFields, { key: "", value: "" }])}
                  >
                    + Adicionar campo
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
            <Button variant="outline" className="uppercase font-semibold text-xs" onClick={() => setDialogOpen(false)}>
              CANCELAR
            </Button>
            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white uppercase font-semibold text-xs px-6">
              {editingContact ? "SALVAR" : "ADICIONAR"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={csvImportOpen} onOpenChange={(o) => { if (!o) setCsvImportOpen(false); }}>
        <DialogContent className="sm:max-w-lg p-0 gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 px-6 py-4 flex items-center gap-3 rounded-t-lg">
            <Upload className="h-5 w-5 text-white" />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white">Importar CSV</h3>
              <p className="text-xs text-white/80">
                {csvImportStep === "upload" && "Passo 1: Selecione o arquivo"}
                {csvImportStep === "mapping" && "Passo 2: Mapeie as colunas"}
                {csvImportStep === "preview" && "Passo 3: Pré-visualização e importação"}
                {csvImportStep === "result" && "Passo 4: Resultado"}
              </p>
            </div>
            <button onClick={() => setCsvImportOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Step 1: Upload */}
            {csvImportStep === "upload" && (
              <div>
                <div
                  className="border-2 border-dashed border-border rounded-xl p-10 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                  onClick={() => csvImportFileRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f && f.name.endsWith(".csv")) handleCsvFileSelect(f);
                    else toast.error("Somente arquivos .csv são permitidos");
                  }}
                >
                  <Upload className="h-10 w-10 text-blue-400" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Arraste um arquivo CSV aqui</p>
                    <p className="text-xs text-muted-foreground mt-1">ou clique para selecionar</p>
                  </div>
                  {csvFile && (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-2">
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                      <span className="text-sm text-blue-800 font-medium">{csvFile.name}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  A primeira linha do CSV deve conter os cabeçalhos das colunas.
                </p>
              </div>
            )}

            {/* Step 2: Column Mapping */}
            {csvImportStep === "mapping" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Arquivo: <strong>{csvFile?.name}</strong> — {csvRows.length} linhas encontradas
                </p>
                <div className="space-y-3">
                  {[
                    { label: "Nome *", state: csvMapNome, setter: setCsvMapNome, required: true },
                    { label: "Telefone *", state: csvMapTelefone, setter: setCsvMapTelefone, required: true },
                    { label: "Email", state: csvMapEmail, setter: setCsvMapEmail, required: false },
                    { label: "Tags (separadas por ;)", state: csvMapTags, setter: setCsvMapTags, required: false },
                  ].map(({ label, state, setter, required }) => (
                    <div key={label} className="grid grid-cols-2 gap-3 items-center">
                      <label className="text-sm font-medium text-foreground">{label}</label>
                      <select
                        value={state}
                        onChange={(e) => setter(e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">{required ? "— selecione —" : "— não mapear —"}</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <div className="bg-muted/50 rounded-lg p-3 overflow-x-auto">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Pré-visualização (primeiras 3 linhas)</p>
                  <table className="text-xs w-full">
                    <thead>
                      <tr>
                        {csvHeaders.map((h, i) => (
                          <th key={i} className="text-left pr-3 pb-1 text-muted-foreground font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(0, 3).map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => (
                            <td key={ci} className="pr-3 pb-1 text-foreground">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Step 3: Preview & importing */}
            {csvImportStep === "preview" && (
              <div className="space-y-4">
                <p className="text-sm text-foreground">
                  Importando <strong>{csvRows.length} contatos</strong>...
                </p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progresso</span>
                    <span>{csvImportProgress}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-200"
                      style={{ width: `${csvImportProgress}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Pré-visualização (primeiras 5 linhas):</p>
                  <div className="divide-y border rounded-lg overflow-hidden">
                    {csvRows.slice(0, 5).map((row, i) => {
                      const nomeIdx = csvHeaders.indexOf(csvMapNome);
                      const telIdx = csvHeaders.indexOf(csvMapTelefone);
                      return (
                        <div key={i} className="flex items-center gap-3 px-3 py-2">
                          <span className="text-sm font-medium text-foreground">{nomeIdx >= 0 ? row[nomeIdx] : "—"}</span>
                          <span className="text-xs text-muted-foreground">{telIdx >= 0 ? row[telIdx] : "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Result */}
            {csvImportStep === "result" && csvImportResult && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-green-700">{csvImportResult.imported}</p>
                    <p className="text-xs text-green-600 mt-1">Importados</p>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-yellow-700">{csvImportResult.skipped}</p>
                    <p className="text-xs text-yellow-600 mt-1">Duplicatas ignoradas</p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-red-700">{csvImportResult.errors}</p>
                    <p className="text-xs text-red-600 mt-1">Erros</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  Importação concluída de <strong>{csvFile?.name}</strong>
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-6 pb-5 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setCsvImportOpen(false)}>Fechar</Button>
            {csvImportStep === "mapping" && (
              <>
                <Button variant="outline" onClick={() => setCsvImportStep("upload")}>Voltar</Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleCsvImportExecute}
                  disabled={!csvMapNome || !csvMapTelefone}
                >
                  Importar {csvRows.length} contatos
                </Button>
              </>
            )}
            {csvImportStep === "result" && (
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setCsvImportOpen(false)}>
                Concluir
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* WhatsApp Import Dialog */}
      <Dialog open={whatsappImportOpen} onOpenChange={setWhatsappImportOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 [&>button.absolute]:hidden">
          <div className="bg-green-600 text-white px-6 py-4 rounded-t-lg flex items-center gap-3">
            <Smartphone className="h-5 w-5" />
            <div className="flex-1">
              <h3 className="text-lg font-bold">Importar Contatos do WhatsApp</h3>
              <p className="text-xs text-white/80">Selecione uma conexão para importar os contatos</p>
            </div>
            <button onClick={() => setWhatsappImportOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground block mb-1.5">Conexão WhatsApp</label>
              <select
                value={selectedWAInstance}
                onChange={(e) => setSelectedWAInstance(e.target.value)}
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Selecione uma conexão...</option>
                {whatsappConnections.map((c) => (
                  <option key={c.id} value={c.instance_name}>{c.instance_name}</option>
                ))}
              </select>
            </div>
            {importingWhatsApp && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="animate-spin h-4 w-4 border-2 border-green-600 border-t-transparent rounded-full" />
                Importando contatos, aguarde...
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 px-6 pb-5">
            <button
              onClick={() => setWhatsappImportOpen(false)}
              disabled={importingWhatsApp}
              className="px-4 py-2 rounded-md border border-input text-sm font-semibold uppercase hover:bg-muted transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleImportFromWhatsApp}
              disabled={importingWhatsApp || !selectedWAInstance}
              className="px-6 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-semibold uppercase transition-colors disabled:opacity-50"
            >
              {importingWhatsApp ? "Importando..." : "Importar"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-xl p-0 gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Excluir contato</h3>
              <p className="text-xs text-white/80">Esta ação não pode ser desfeita</p>
            </div>
            <button onClick={() => setDeleteOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-foreground">
              O contato <strong>{contactToDelete?.name || contactToDelete?.phone}</strong> será excluído permanentemente junto com todas as suas conversas.
            </p>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-4">
            <Button variant="outline" className="uppercase font-semibold text-xs" onClick={() => setDeleteOpen(false)}>CANCELAR</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white uppercase font-semibold text-xs px-6" onClick={handleDelete}>EXCLUIR</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New/Edit Segment Dialog */}
      <Dialog open={segmentDialogOpen} onOpenChange={setSegmentDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Layers className="h-5 w-5 text-blue-500" />
              <DialogTitle>{editingSegment ? "Editar Segmento" : "Novo Segmento"}</DialogTitle>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-sm font-medium text-foreground">Nome *</label>
                <Input
                  value={segFormName}
                  onChange={(e) => setSegFormName(e.target.value)}
                  placeholder="Ex: Clientes de SP"
                  className="mt-1"
                />
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-foreground">Descrição</label>
                <Input
                  value={segFormDesc}
                  onChange={(e) => setSegFormDesc(e.target.value)}
                  placeholder="Descrição opcional..."
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-foreground block mb-2">Critérios</label>
              <div className="space-y-2">
                {segCriteria.map((crit, idx) => {
                  const ops = SEGMENT_OPERATORS[crit.field] || [];
                  const isDateField = crit.field === "created_period";
                  return (
                    <div key={idx} className="flex items-center gap-2 bg-muted/30 rounded-lg p-2">
                      <Select value={crit.field} onValueChange={(v) => updateCriterion(idx, "field", v)}>
                        <SelectTrigger className="w-52">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SEGMENT_FIELDS.map(f => (
                            <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Select value={crit.operator} onValueChange={(v) => updateCriterion(idx, "operator", v)}>
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ops.map(op => (
                            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <Input
                        type={isDateField ? "date" : "text"}
                        value={crit.value}
                        onChange={(e) => updateCriterion(idx, "value", e.target.value)}
                        placeholder={crit.field === "no_message_days" ? "Ex: 7" : "Valor..."}
                        className="flex-1"
                      />

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-400 hover:text-red-600 shrink-0"
                        onClick={() => removeCriterion(idx)}
                        disabled={segCriteria.length <= 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 gap-1 text-xs"
                onClick={addCriterion}
              >
                <Plus className="h-3 w-3" />
                Adicionar critério
              </Button>
            </div>

            {/* Calculate */}
            <div className="flex items-center gap-3 pt-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={handleCalculateSegment}
                disabled={segCalculating}
              >
                {segCalculating ? (
                  <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
                ) : (
                  <Calculator className="h-4 w-4" />
                )}
                Calcular
              </Button>
              {segCount !== null && (
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                  <Users className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-700">{segCount} contatos encontrados</span>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setSegmentDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="gap-2"
              onClick={handleSaveSegment}
              disabled={segSaving}
            >
              {segSaving ? (
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              {editingSegment ? "Salvar alterações" : "Criar Segmento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Tag Dialog */}
      <Dialog open={bulkTagOpen} onOpenChange={setBulkTagOpen}>
        <DialogContent className="sm:max-w-sm p-0 gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 px-5 py-4 flex items-center gap-3 rounded-t-lg">
            <Tag className="h-5 w-5 text-white" />
            <h2 className="text-base font-bold text-white">Adicionar tag</h2>
            <button onClick={() => setBulkTagOpen(false)} className="ml-auto text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-5 py-4 space-y-2 max-h-72 overflow-y-auto">
            {availableTags.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma tag disponível</p>
            ) : (
              availableTags.map((tag) => (
                <label key={tag.id} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary"
                    checked={selectedTagIds.has(tag.id)}
                    onChange={() => {
                      setSelectedTagIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(tag.id)) next.delete(tag.id);
                        else next.add(tag.id);
                        return next;
                      });
                    }}
                  />
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: tag.color.startsWith("#") ? tag.color : "#8B5CF6" }} />
                  <span className="text-sm text-foreground">{tag.name}</span>
                </label>
              ))
            )}
          </div>
          <div className="flex justify-end gap-2 px-5 pb-4">
            <Button variant="outline" size="sm" onClick={() => setBulkTagOpen(false)} disabled={bulkTagApplying}>Cancelar</Button>
            <Button
              size="sm"
              className="bg-blue-600 hover:bg-blue-700 text-white"
              onClick={handleBulkApplyTags}
              disabled={bulkTagApplying || selectedTagIds.size === 0}
            >
              {bulkTagApplying ? "Aplicando..." : `Aplicar (${selectedTagIds.size} tag(s))`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 [&>button.absolute]:hidden">
          <div className="bg-red-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Excluir contatos selecionados</h3>
              <p className="text-xs text-white/80">Esta ação não pode ser desfeita</p>
            </div>
            <button onClick={() => setBulkDeleteOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-6 py-4 space-y-2">
            <p className="text-sm text-foreground">
              Tem certeza que deseja excluir <strong>{selectedContacts.size} contato(s) selecionado(s)</strong>?
            </p>
            <p className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-yellow-500 mt-0.5">⚠</span>
              Todas as conversas associadas a esses contatos também podem ser afetadas.
            </p>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-4">
            <Button variant="outline" className="uppercase font-semibold text-xs" onClick={() => setBulkDeleteOpen(false)} disabled={bulkDeleting}>CANCELAR</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white uppercase font-semibold text-xs px-6" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? "Excluindo..." : `EXCLUIR ${selectedContacts.size} CONTATO(S)`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Contacts Dialog */}
      <Dialog open={previewSegmentOpen} onOpenChange={setPreviewSegmentOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Eye className="h-5 w-5 text-blue-500" />
              <DialogTitle>Contatos do Segmento</DialogTitle>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0" style={{ maxHeight: "420px" }}>
            {previewLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : previewContacts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 opacity-40 mb-2" />
                <p>Nenhum contato encontrado neste segmento</p>
              </div>
            ) : (
              <div className="divide-y border rounded-lg">
                {previewContacts.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className={`${getAvatarColor(c.id)} text-white text-xs`}>
                        {c.name ? c.name.charAt(0).toUpperCase() : "C"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.name || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">{c.phone}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <p className="text-xs text-muted-foreground flex-1">{previewContacts.length} contatos</p>
            <Button variant="outline" onClick={() => setPreviewSegmentOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Contacts Dialog */}
      <Dialog open={duplicatesDialog} onOpenChange={setDuplicatesDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-orange-500" /> Contatos Duplicados
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto space-y-3 py-2">
            {loadingDuplicates ? (
              <p className="text-sm text-muted-foreground text-center py-6">Analisando...</p>
            ) : duplicateGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum duplicado encontrado!</p>
            ) : (
              duplicateGroups.map((group) => (
                <div key={group.phone} className="border border-border rounded-lg p-3 space-y-2">
                  <p className="text-sm font-medium">{group.phone} <span className="text-muted-foreground font-normal">· {group.count} registros</span></p>
                  <div className="space-y-1">
                    {group.ids.map((id, i) => (
                      <div key={id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={`w-2 h-2 rounded-full ${i === 0 ? "bg-green-500" : "bg-gray-400"}`} />
                        <span className={i === 0 ? "text-green-600 font-medium" : ""}>{group.names[i] || "Sem nome"}</span>
                        {i === 0 && <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 px-1 rounded">manter</span>}
                      </div>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-xs"
                    disabled={mergingGroup === group.phone}
                    onClick={() => handleMerge(group.ids[0], group.ids.slice(1), group.phone)}
                  >
                    {mergingGroup === group.phone ? "Mesclando..." : `Mesclar ${group.count - 1} duplicado(s) no primeiro`}
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicatesDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Contacts;
