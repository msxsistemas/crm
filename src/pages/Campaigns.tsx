import { useState, useEffect, useMemo, useRef } from "react";
import { Send, Play, Mail, CheckCircle, Eye, AlertTriangle, Plus, Search, RefreshCw, FileText, Clock, XCircle, Download, Info, Loader2, Pause, Users, Tag, BookOpen, Clipboard, Pencil, Trash2, BarChart3 } from "lucide-react";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { sendMessage } from "@/lib/uazap-api";
import { logAudit } from "@/lib/audit";

interface Campaign {
  id: string;
  name: string;
  description?: string;
  messageTemplate?: string;
  sendSpeed: number;
  status: "draft" | "running" | "completed" | "paused";
  totalSent: number;
  delivered: number;
  read: number;
  failed: number;
  createdAt: string;
  segmentId?: string | null;
  connectionName?: string | null;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
  tags?: string[];
}

interface CampaignContact {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  contact_phone: string;
  contact_name: string | null;
  status: "pending" | "sent" | "delivered" | "failed";
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
  contacts?: { name: string | null };
}

interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  content: string;
  variables: string[];
  created_at: string;
}

const TEMPLATE_CATEGORIES = ["Geral", "Saudação", "Vendas", "Suporte", "Promoção", "Fechamento"];

const SAMPLE_VARS: Record<string, string> = {
  nome: "João",
  saudacao: "Bom dia",
  data: "hoje",
  produto: "Produto X",
};

function detectVariables(content: string): string[] {
  const matches = content.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, "")))];
}

function substituteVars(content: string): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => SAMPLE_VARS[key] || `{${key}}`);
}

const Campaigns = () => {
  const [activeTab, setActiveTab] = useState("campanhas");
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Execution state
  const [executingCampaign, setExecutingCampaign] = useState<string | null>(null);
  const [selectContactsOpen, setSelectContactsOpen] = useState(false);
  const [pendingCampaignId, setPendingCampaignId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [tagFilter, setTagFilter] = useState("");
  const [sendProgress, setSendProgress] = useState<{ sent: number; total: number } | null>(null);
  const abortRef = useRef(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formSpeed, setFormSpeed] = useState("20");
  const [formSegmentId, setFormSegmentId] = useState("");
  const [formConnectionName, setFormConnectionName] = useState("");
  const [segments, setSegments] = useState<{ id: string; name: string }[]>([]);
  const [connections, setConnectionsList] = useState<{ instance_name: string }[]>([]);

  // Template picker inside new campaign dialog
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);

  // Report state
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCampaignId, setReportCampaignId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<CampaignContact[]>([]);
  const [reportSearch, setReportSearch] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportPage, setReportPage] = useState(0);
  const REPORT_PAGE_SIZE = 50;

  // ── Biblioteca (message templates) state ──
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState("all");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [tplFormName, setTplFormName] = useState("");
  const [tplFormCategory, setTplFormCategory] = useState("Geral");
  const [tplFormContent, setTplFormContent] = useState("");
  const [tplSaving, setTplSaving] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplate | null>(null);

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const { data } = await db
        .from("campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      setCampaigns(
        (data || []).map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description ?? undefined,
          messageTemplate: c.message_template ?? undefined,
          sendSpeed: c.send_speed || 20,
          status: c.status as Campaign["status"],
          totalSent: c.total_sent || 0,
          delivered: c.delivered || 0,
          read: c.read || 0,
          failed: c.failed || 0,
          createdAt: c.created_at,
          segmentId: c.segment_id || null,
          connectionName: c.connection_name || null,
        }))
      );
    } catch {
      toast.error("Erro ao carregar campanhas");
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const { data } = await db
        .from("message_templates")
        .select("*")
        .order("created_at", { ascending: false });
      setTemplates(
        (data || []).map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category || "Geral",
          content: t.content,
          variables: (t.variables as string[]) || [],
          created_at: t.created_at,
        }))
      );
    } catch {
      toast.error("Erro ao carregar templates");
    } finally {
      setTemplatesLoading(false);
    }
  };

  const loadReport = async (campaignId: string) => {
    setReportLoading(true);
    setReportData([]);
    setReportSearch("");
    setReportPage(0);
    try {
      const { data } = await db
        .from("campaign_contacts")
        .select("*, contacts(name)")
        .eq("campaign_id", campaignId)
        .order("created_at", { ascending: false });
      setReportData((data || []) as CampaignContact[]);
    } catch {
      toast.error("Erro ao carregar relatório");
    } finally {
      setReportLoading(false);
    }
  };

  const openReport = (campaign: Campaign) => {
    setReportCampaignId(campaign.id);
    setReportOpen(true);
    loadReport(campaign.id);
  };

  const exportReportCSV = () => {
    if (reportData.length === 0) { toast.error("Sem dados para exportar"); return; }
    const rows = reportData.map(r => ({
      Contato: r.contact_name || r.contacts?.name || "",
      Telefone: r.contact_phone,
      Status: r.status,
      "Enviado em": r.sent_at ? new Date(r.sent_at).toLocaleString("pt-BR") : "",
      Erro: r.error_message || "",
    }));
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(";"),
      ...rows.map(row => headers.map(h => {
        const val = (row as Record<string, string>)[h];
        return typeof val === "string" && val.includes(";") ? `"${val}"` : String(val ?? "");
      }).join(";"))
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campanha_relatorio_${reportCampaignId?.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado com sucesso!");
  };

  useEffect(() => {
    fetchCampaigns();
    db.from("segments").select("id, name").order("name").then(({ data }) => setSegments((data as any[]) || []));
    db.from("evolution_connections").select("instance_name").then(({ data }) => setConnectionsList((data as any[]) || []));
  }, []);
  useEffect(() => { if (activeTab === "biblioteca") fetchTemplates(); }, [activeTab]);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const matchesSearch =
        !searchQuery ||
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [campaigns, searchQuery, statusFilter]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const matchSearch = !templateSearch ||
        t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
        t.content.toLowerCase().includes(templateSearch.toLowerCase());
      const matchCat = templateCategoryFilter === "all" || t.category === templateCategoryFilter;
      return matchSearch && matchCat;
    });
  }, [templates, templateSearch, templateCategoryFilter]);

  const templatesByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    templates.forEach(t => { map[t.category] = (map[t.category] || 0) + 1; });
    return map;
  }, [templates]);

  const statusBadge = (status: Campaign["status"]) => {
    const map: Record<Campaign["status"], { label: string; className: string }> = {
      draft: { label: "Rascunho", className: "bg-gray-200 text-gray-700 border-gray-300" },
      running: { label: "Executando", className: "bg-green-100 text-green-700 border-green-300" },
      completed: { label: "Concluída", className: "bg-blue-100 text-blue-700 border-blue-300" },
      paused: { label: "Pausada", className: "bg-yellow-100 text-yellow-700 border-yellow-300" },
    };
    const s = map[status];
    return <Badge className={cn("text-xs", s.className)}>{s.label}</Badge>;
  };

  const campaignStats = [
    { label: "Campanhas", value: campaigns.length, icon: Send, color: "text-primary" },
    { label: "Executando", value: campaigns.filter(c => c.status === "running").length, icon: Play, color: "text-green-500" },
    { label: "Enviadas", value: campaigns.reduce((a, c) => a + c.totalSent, 0), icon: Mail, color: "text-blue-400" },
    { label: "Entregues", value: campaigns.reduce((a, c) => a + c.delivered, 0), icon: CheckCircle, color: "text-emerald-500" },
    { label: "Lidas", value: campaigns.reduce((a, c) => a + c.read, 0), icon: Eye, color: "text-cyan-400" },
    { label: "Falhas", value: campaigns.reduce((a, c) => a + c.failed, 0), icon: AlertTriangle, color: "text-destructive" },
  ];

  const templateStats = [
    { label: "Total", value: 0, icon: FileText, color: "text-primary" },
    { label: "Aprovados", value: 0, icon: CheckCircle, color: "text-emerald-500" },
    { label: "Pendentes", value: 0, icon: Clock, color: "text-yellow-500" },
    { label: "Rejeitados", value: 0, icon: XCircle, color: "text-destructive" },
  ];

  const handleCreateCampaign = async () => {
    if (!formName.trim() || !formMessage.trim() || !user) return;
    const { error } = await db.from("campaigns").insert({
      user_id: user.id,
      name: formName.trim(),
      description: formDesc.trim() || null,
      message_template: formMessage.trim(),
      send_speed: parseInt(formSpeed) || 20,
      segment_id: formSegmentId || null,
      connection_name: formConnectionName || null,
    });
    if (error) {
      toast.error("Erro ao criar campanha");
      return;
    }
    toast.success("Campanha criada com sucesso!");
    setNewCampaignOpen(false);
    setFormName(""); setFormDesc(""); setFormMessage(""); setFormSpeed("20");
    setFormSegmentId(""); setFormConnectionName("");
    fetchCampaigns();
  };

  // ── Load contacts for selection dialog ──
  const loadContacts = async () => {
    setContactsLoading(true);
    const { data } = await db
      .from("contacts")
      .select("id, name, phone, tags")
      .limit(200);
    setContacts(
      (data || []).map((c) => ({
        id: c.id,
        name: c.name || "",
        phone: c.phone || "",
        tags: (c as any).tags || [],
      }))
    );
    setContactsLoading(false);
  };

  const openSelectContacts = async (campaignId: string) => {
    setPendingCampaignId(campaignId);
    setSelectedContacts(new Set());
    setTagFilter("");
    await loadContacts();

    // Auto-select segment contacts if campaign has segment_id
    const campaign = campaigns.find(c => c.id === campaignId);
    if (campaign?.segmentId) {
      const { data: segContacts } = await db
        .from("contact_segments")
        .select("contact_id")
        .eq("segment_id", campaign.segmentId);
      if (segContacts && segContacts.length > 0) {
        setSelectedContacts(new Set((segContacts as any[]).map(r => r.contact_id)));
        toast.info(`${segContacts.length} contatos do segmento pré-selecionados`);
      }
    }
    setSelectContactsOpen(true);
  };

  const filteredContacts = useMemo(() => {
    if (!tagFilter.trim()) return contacts;
    const tag = tagFilter.toLowerCase().trim();
    return contacts.filter(c =>
      (c.tags || []).some((t: string) => t.toLowerCase().includes(tag))
    );
  }, [contacts, tagFilter]);

  const toggleContact = (id: string) => {
    setSelectedContacts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
  const deselectAll = () => setSelectedContacts(new Set());

  // ── Execute campaign send ──
  const handleExecuteCampaign = async (campaignId: string, contactIds: string[]) => {
    if (contactIds.length === 0) {
      toast.error("Selecione ao menos um contato");
      return;
    }
    if (contactIds.length > 500) {
      toast.warning("Aviso: mais de 500 contatos selecionados. O envio pode demorar bastante.");
    }

    setSelectContactsOpen(false);
    setExecutingCampaign(campaignId);
    abortRef.current = false;

    const campaignName = campaigns.find((c) => c.id === campaignId)?.name || campaignId;
    logAudit("send_campaign", "campaign", campaignId, campaignName, { contactCount: contactIds.length });

    await db.from("campaigns").update({ status: "running" }).eq("id", campaignId);

    const { data: campData } = await db
      .from("campaigns")
      .select("message_template, send_speed, connection_name")
      .eq("id", campaignId)
      .single();

    if (!campData?.message_template) {
      toast.error("Campanha sem mensagem configurada");
      setExecutingCampaign(null);
      await db.from("campaigns").update({ status: "paused" }).eq("id", campaignId);
      return;
    }

    const messageTemplate: string = campData.message_template;
    const sendSpeed: number = campData.send_speed || 20;
    const delayMs = Math.max(1000, Math.round(60000 / sendSpeed));

    // Use campaign's own connection_name if set, otherwise fall back to first available
    let instanceName: string = campData.connection_name || '';
    if (!instanceName) {
      const { data: connData } = await db
        .from("evolution_connections")
        .select("instance_name")
        .limit(1)
        .single();
      instanceName = connData?.instance_name || '';
    }

    if (!instanceName) {
      toast.error("Nenhuma conexão UZap disponível");
      setExecutingCampaign(null);
      await db.from("campaigns").update({ status: "paused" }).eq("id", campaignId);
      return;
    }

    const { data: contactsData } = await db
      .from("contacts")
      .select("id, name, phone")
      .in("id", contactIds);

    const toSend = (contactsData || []).filter(c => c.phone);

    let sentCount = 0;
    let deliveredCount = 0;
    let failedCount = 0;

    setSendProgress({ sent: 0, total: toSend.length });

    const toastId = toast.loading(`Enviando mensagens... 0/${toSend.length}`);

    for (const contact of toSend) {
      if (abortRef.current) break;

      let success = false;
      let errorMessage: string | null = null;
      try {
        await sendMessage(instanceName, contact.phone, messageTemplate);
        sentCount++;
        deliveredCount++;
        success = true;
      } catch (err: unknown) {
        sentCount++;
        failedCount++;
        errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
      }

      await db.from("campaign_contacts").insert({
        campaign_id: campaignId,
        contact_id: contact.id,
        contact_phone: contact.phone,
        contact_name: contact.name,
        status: success ? "sent" : "failed",
        sent_at: new Date().toISOString(),
        error_message: success ? null : errorMessage,
      });

      if (sentCount % 5 === 0 || sentCount === toSend.length) {
        await db
          .from("campaigns")
          .update({
            total_sent: sentCount,
            delivered: deliveredCount,
            failed: failedCount,
          })
          .eq("id", campaignId);
      }

      setSendProgress({ sent: sentCount, total: toSend.length });
      toast.loading(`Enviando mensagens... ${sentCount}/${toSend.length}`, { id: toastId });

      if (sentCount < toSend.length) {
        await new Promise<void>(r => setTimeout(r, delayMs));
      }
    }

    const finalStatus = abortRef.current ? "paused" : "completed";
    await db
      .from("campaigns")
      .update({
        status: finalStatus,
        total_sent: sentCount,
        delivered: deliveredCount,
        failed: failedCount,
      })
      .eq("id", campaignId);

    toast.dismiss(toastId);
    if (abortRef.current) {
      toast.info(`Campanha pausada. ${sentCount} enviadas, ${failedCount} falhas.`);
    } else {
      toast.success(`Campanha concluída! ${deliveredCount} entregues, ${failedCount} falhas.`);
    }

    setExecutingCampaign(null);
    setSendProgress(null);
    fetchCampaigns();
  };

  // ── Template CRUD ──
  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTplFormName("");
    setTplFormCategory("Geral");
    setTplFormContent("");
    setTemplateDialogOpen(true);
  };

  const openEditTemplate = (t: MessageTemplate) => {
    setEditingTemplate(t);
    setTplFormName(t.name);
    setTplFormCategory(t.category);
    setTplFormContent(t.content);
    setTemplateDialogOpen(true);
  };

  const insertVariable = (varName: string) => {
    setTplFormContent(prev => prev + `{{${varName}}}`);
  };

  const handleSaveTemplate = async () => {
    if (!tplFormName.trim() || !tplFormContent.trim()) {
      toast.error("Nome e conteúdo são obrigatórios");
      return;
    }
    if (!user) return;
    setTplSaving(true);

    const vars = detectVariables(tplFormContent);
    const payload = {
      user_id: user.id,
      name: tplFormName.trim(),
      category: tplFormCategory,
      content: tplFormContent.trim(),
      variables: vars,
      updated_at: new Date().toISOString(),
    };

    if (editingTemplate) {
      const { error } = await db
        .from("message_templates")
        .update(payload)
        .eq("id", editingTemplate.id);
      if (error) { toast.error("Erro ao salvar template"); setTplSaving(false); return; }
      toast.success("Template atualizado!");
    } else {
      const { error } = await db.from("message_templates").insert(payload);
      if (error) { toast.error("Erro ao criar template"); setTplSaving(false); return; }
      toast.success("Template criado!");
    }

    setTplSaving(false);
    setTemplateDialogOpen(false);
    fetchTemplates();
  };

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await db.from("message_templates").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir template"); return; }
    toast.success("Template excluído");
    fetchTemplates();
  };

  const handleUseTemplateInCampaign = (t: MessageTemplate) => {
    navigator.clipboard.writeText(t.content).catch(() => {});
    toast.success("Conteúdo do template copiado para a área de transferência!");
  };

  const categoryColor: Record<string, string> = {
    Geral: "bg-gray-100 text-gray-700 border-gray-300",
    Saudação: "bg-blue-100 text-blue-700 border-blue-300",
    Vendas: "bg-green-100 text-green-700 border-green-300",
    Suporte: "bg-purple-100 text-purple-700 border-purple-300",
    Promoção: "bg-orange-100 text-orange-700 border-orange-300",
    Fechamento: "bg-red-100 text-red-700 border-red-300",
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-blue-600">Campanhas</h1>
        <div className="flex items-center gap-2">
          {activeTab === "templates" && (
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Sincronizar da Meta
            </Button>
          )}
          {activeTab === "biblioteca" ? (
            <Button variant="action" className="gap-2 px-5" onClick={openNewTemplate}>
              <Plus className="h-4 w-4" />
              Novo Template
            </Button>
          ) : (
            <Button variant="action" className="gap-2 px-5" onClick={() => setNewCampaignOpen(true)}>
              <Plus className="h-4 w-4" />
              {activeTab === "campanhas" ? "Nova Campanha" : "Novo Template"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="campanhas" className="gap-2">
              <Send className="h-4 w-4" />
              Campanhas
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="h-4 w-4" />
              Templates HSM
            </TabsTrigger>
            <TabsTrigger value="biblioteca" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Biblioteca
            </TabsTrigger>
          </TabsList>

          {/* Campanhas Tab */}
          <TabsContent value="campanhas" className="space-y-6 mt-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {campaignStats.map((stat) => (
                <Card key={stat.label} className="p-4 flex items-center gap-3">
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                  <div>
                    <p className="text-xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </Card>
              ))}
            </div>

            {/* Search & Filter */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar campanhas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="running">Executando</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="paused">Pausada</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchCampaigns}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Campaign List / Empty / Loading */}
            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Send className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>Nenhuma campanha encontrada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCampaigns.map((c) => {
                  const isExecuting = executingCampaign === c.id;
                  return (
                    <Card key={c.id} className={cn("p-4 flex flex-col gap-3", isExecuting && "border-green-400 bg-green-50/30 dark:bg-green-950/10")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-foreground">{c.name}</p>
                          {c.description && (
                            <p className="text-sm text-muted-foreground truncate">{c.description}</p>
                          )}
                        </div>
                        {statusBadge(c.status)}
                      </div>

                      {isExecuting && sendProgress && (
                        <div className="w-full">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span className="flex items-center gap-1">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Enviando...
                            </span>
                            <span>{sendProgress.sent}/{sendProgress.total}</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-green-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${sendProgress.total > 0 ? (sendProgress.sent / sendProgress.total) * 100 : 0}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.totalSent} enviadas</span>
                        <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-emerald-500" />{c.delivered} entregues</span>
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3 text-cyan-500" />{c.read} lidas</span>
                        <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-destructive" />{c.failed} falhas</span>
                        <span className="ml-auto">{format(new Date(c.createdAt), "dd/MM/yyyy", { locale: ptBR })}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {isExecuting ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs text-red-600 border-red-300"
                            onClick={() => { abortRef.current = true; }}
                          >
                            <XCircle className="h-3 w-3" /> Cancelar envio
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs"
                            disabled={c.status === "running" || executingCampaign !== null}
                            onClick={() => openSelectContacts(c.id)}
                          >
                            <Play className="h-3 w-3" /> Executar
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => toast.info("Em breve")}>
                          <Pause className="h-3 w-3" /> Pausar
                        </Button>
                        <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => toast.info("Em breve")}>
                          <Eye className="h-3 w-3" /> Detalhes
                        </Button>
                        {(c.status === "completed" || c.status === "running") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs text-blue-600 border-blue-300"
                            onClick={() => openReport(c)}
                          >
                            <BarChart3 className="h-3 w-3" /> Ver relatório
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* HSM Info */}
            <div className="flex items-start gap-3 rounded-lg bg-primary/10 border border-primary/20 p-4">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-primary">Importante sobre Templates HSM</p>
                <p className="text-sm text-muted-foreground">
                  Para enviar mensagens em massa, você precisa usar Templates HSM aprovados pelo WhatsApp. Mensagens sem template só funcionam para contatos que iniciaram conversa nas últimas 24 horas.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Templates HSM Tab */}
          <TabsContent value="templates" className="space-y-6 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {templateStats.map((stat) => (
                <Card key={stat.label} className="p-4 flex items-center gap-3">
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                  <div>
                    <p className="text-xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar templates..." className="pl-9" />
              </div>
              <Select defaultValue="all">
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="approved">Aprovados</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="rejected">Rejeitados</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            <Card className="p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-semibold text-foreground">Nenhum template</h3>
                <p className="text-sm text-muted-foreground mt-1">Sincronize da Meta ou crie um novo template</p>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" className="gap-2">
                    <Download className="h-4 w-4" />
                    Sincronizar
                  </Button>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Criar Template
                  </Button>
                </div>
              </div>
            </Card>

            <div className="flex items-start gap-3 rounded-lg bg-primary/10 border border-primary/20 p-4">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-primary">Como funcionam os Templates HSM</p>
                <p className="text-sm text-muted-foreground">
                  Templates HSM são mensagens pré-aprovadas pelo WhatsApp para envio proativo. Após criar aqui, você deve submeter para aprovação via Meta Business Suite. Use "Sincronizar da Meta" para importar templates já aprovados.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Biblioteca Tab */}
          <TabsContent value="biblioteca" className="space-y-6 mt-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-4 flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-xl font-bold text-foreground">{templates.length}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </Card>
              {Object.entries(templatesByCategory).slice(0, 3).map(([cat, count]) => (
                <Card key={cat} className="p-4 flex items-center gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xl font-bold text-foreground">{count}</p>
                    <p className="text-xs text-muted-foreground">{cat}</p>
                  </div>
                </Card>
              ))}
            </div>

            {/* Search & Filter */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar templates..."
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={templateCategoryFilter} onValueChange={setTemplateCategoryFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todas as categorias" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {TEMPLATE_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={fetchTemplates}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Templates List */}
            {templatesLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <Card className="p-12">
                <div className="flex flex-col items-center justify-center text-center">
                  <BookOpen className="h-12 w-12 text-muted-foreground/40 mb-4" />
                  <h3 className="text-lg font-semibold text-foreground">Nenhum template na biblioteca</h3>
                  <p className="text-sm text-muted-foreground mt-1">Crie templates reutilizáveis para suas campanhas</p>
                  <Button className="mt-4 gap-2" onClick={openNewTemplate}>
                    <Plus className="h-4 w-4" />
                    Novo Template
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {filteredTemplates.map((t) => {
                  const vars = detectVariables(t.content);
                  return (
                    <Card key={t.id} className="p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-bold text-foreground truncate">{t.name}</p>
                            <Badge className={cn("text-xs shrink-0", categoryColor[t.category] || "bg-gray-100 text-gray-700")}>
                              {t.category}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {t.content.slice(0, 100)}{t.content.length > 100 ? "..." : ""}
                          </p>
                        </div>
                      </div>

                      {/* Variable badges */}
                      {vars.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {vars.map(v => (
                            <Badge key={v} variant="outline" className="text-xs font-mono text-blue-600 border-blue-300 bg-blue-50">
                              {`{${v}}`}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => setPreviewTemplate(previewTemplate?.id === t.id ? null : t)}
                        >
                          <Eye className="h-3 w-3" />
                          {previewTemplate?.id === t.id ? "Fechar Prévia" : "Prévia"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1 text-xs text-green-700 border-green-300"
                          onClick={() => handleUseTemplateInCampaign(t)}
                        >
                          <Clipboard className="h-3 w-3" />
                          Usar em Campanha
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground ml-auto"
                          onClick={() => openEditTemplate(t)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteTemplate(t.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Preview with substitution */}
                      {previewTemplate?.id === t.id && (
                        <div className="bg-muted/40 border border-border rounded-lg p-3 text-sm whitespace-pre-wrap">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Prévia (valores de exemplo):</p>
                          <p className="text-foreground">{substituteVars(t.content)}</p>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* New Campaign Dialog */}
      <Dialog open={newCampaignOpen} onOpenChange={setNewCampaignOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Send className="h-5 w-5 text-primary" />
              <DialogTitle>Nova Campanha</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nome da Campanha *</label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex: Promoção de Natal" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Descrição opcional..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Conexão WhatsApp *</label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent><SelectItem value="default">Meu número</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Template HSM</label>
                <Select>
                  <SelectTrigger><SelectValue placeholder="Nenhum (usar mensagem)" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Nenhum (usar mensagem)</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-foreground">Mensagem *</label>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs h-7"
                  onClick={() => setTemplatePickerOpen(true)}
                >
                  <BookOpen className="h-3 w-3" />
                  Usar template
                </Button>
              </div>
              <Textarea
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                placeholder="Digite a mensagem..."
                rows={4}
              />
              <p className="text-xs text-yellow-500 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Sem template, só funciona para contatos ativos nas últimas 24h
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Segmentar por Tags</label>
              <p className="text-xs text-muted-foreground">Nenhuma tag = todos os contatos com opt-in</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Conexão WhatsApp</label>
                <select value={formConnectionName} onChange={e => setFormConnectionName(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Primeira disponível</option>
                  {connections.map(c => <option key={c.instance_name} value={c.instance_name}>{c.instance_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Velocidade (msg/min)</label>
                <Input type="number" value={formSpeed} onChange={(e) => setFormSpeed(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">Máximo recomendado: 20-30</p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Segmento de contatos</label>
              <select value={formSegmentId} onChange={e => setFormSegmentId(e.target.value)} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm mt-1">
                <option value="">Nenhum — selecionar manualmente ao executar</option>
                {segments.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <p className="text-xs text-muted-foreground mt-1">Se definido, os contatos do segmento são pré-selecionados automaticamente</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setNewCampaignOpen(false)}>Cancelar</Button>
            <Button className="flex-1 gap-2" onClick={handleCreateCampaign}>
              <Send className="h-4 w-4" />
              Criar Campanha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Picker (inside campaign dialog) */}
      <Dialog open={templatePickerOpen} onOpenChange={setTemplatePickerOpen}>
        <DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-primary" />
              <DialogTitle>Selecionar Template</DialogTitle>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0" style={{ maxHeight: "380px" }}>
            {templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="h-10 w-10 mx-auto opacity-40 mb-2" />
                <p className="text-sm">Nenhum template na biblioteca</p>
                <p className="text-xs mt-1">Crie templates na aba "Biblioteca"</p>
              </div>
            ) : (
              templates.map((t) => (
                <button
                  key={t.id}
                  className="w-full text-left border rounded-lg p-3 hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    setFormMessage(t.content);
                    setTemplatePickerOpen(false);
                    toast.success(`Template "${t.name}" aplicado!`);
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <Badge className={cn("text-xs", categoryColor[t.category] || "bg-gray-100 text-gray-700")}>
                      {t.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {t.content.slice(0, 80)}{t.content.length > 80 ? "..." : ""}
                  </p>
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplatePickerOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Select Contacts Dialog */}
      <Dialog open={selectContactsOpen} onOpenChange={setSelectContactsOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-primary" />
              <DialogTitle>Selecionar Contatos para Campanha</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-3 flex-1 flex flex-col min-h-0">
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filtrar por tag..."
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedContacts.size} selecionado(s) de {filteredContacts.length}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={selectAll}>Selecionar todos</Button>
                <Button variant="outline" size="sm" className="text-xs" onClick={deselectAll}>Desmarcar todos</Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border rounded-lg divide-y min-h-0" style={{ maxHeight: "340px" }}>
              {contactsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  Nenhum contato encontrado
                </div>
              ) : (
                filteredContacts.map((contact) => (
                  <label
                    key={contact.id}
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedContacts.has(contact.id)}
                      onChange={() => toggleContact(contact.id)}
                      className="h-4 w-4 rounded border-gray-300 text-primary cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{contact.name || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground">{contact.phone}</p>
                    </div>
                    {(contact.tags || []).length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {(contact.tags || []).slice(0, 2).map((tag: string) => (
                          <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                        ))}
                      </div>
                    )}
                  </label>
                ))
              )}
            </div>

            {selectedContacts.size > 500 && (
              <div className="flex items-center gap-2 text-amber-600 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-lg px-3 py-2 text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Mais de 500 contatos selecionados. O envio pode ser demorado.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setSelectContactsOpen(false)}>Cancelar</Button>
            <Button
              className="gap-2"
              disabled={selectedContacts.size === 0}
              onClick={() => {
                if (pendingCampaignId) {
                  handleExecuteCampaign(pendingCampaignId, Array.from(selectedContacts));
                }
              }}
            >
              <Play className="h-4 w-4" />
              Executar Campanha ({selectedContacts.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign Report Dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-primary" />
              <DialogTitle>
                Relatório — {campaigns.find(c => c.id === reportCampaignId)?.name ?? "Campanha"}
              </DialogTitle>
            </div>
          </DialogHeader>

          {reportLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
              {/* Stats bar */}
              {(() => {
                const total = reportData.length;
                const sent = reportData.filter(r => r.status === "sent").length;
                const delivered = reportData.filter(r => r.status === "delivered").length;
                const failed = reportData.filter(r => r.status === "failed").length;
                const deliveryRate = total > 0 ? (((sent + delivered) / total) * 100).toFixed(1) : "0.0";
                return (
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: "Enviados", value: sent + delivered, color: "text-blue-600" },
                      { label: "Entregues", value: delivered, color: "text-emerald-600" },
                      { label: "Falhas", value: failed, color: "text-red-600" },
                      { label: "Taxa de entrega", value: `${deliveryRate}%`, color: "text-primary" },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg border bg-muted/30 p-3 text-center">
                        <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Search + Export */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar por nome ou telefone..."
                    value={reportSearch}
                    onChange={e => { setReportSearch(e.target.value); setReportPage(0); }}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <Button variant="outline" size="sm" className="gap-1 text-xs shrink-0" onClick={exportReportCSV}>
                  <Download className="h-4 w-4" /> Exportar CSV
                </Button>
              </div>

              {/* Table */}
              {(() => {
                const q = reportSearch.toLowerCase();
                const filtered = reportSearch
                  ? reportData.filter(r =>
                      (r.contact_name || r.contacts?.name || "").toLowerCase().includes(q) ||
                      r.contact_phone.includes(q)
                    )
                  : reportData;
                const pages = Math.max(1, Math.ceil(filtered.length / REPORT_PAGE_SIZE));
                const page = Math.min(reportPage, pages - 1);
                const pageData = filtered.slice(page * REPORT_PAGE_SIZE, (page + 1) * REPORT_PAGE_SIZE);

                const statusBadgeReport = (status: CampaignContact["status"]) => {
                  const map = {
                    pending: { label: "Pendente", cls: "bg-gray-100 text-gray-700 border-gray-300" },
                    sent: { label: "Enviado", cls: "bg-blue-100 text-blue-700 border-blue-300" },
                    delivered: { label: "Entregue", cls: "bg-green-100 text-green-700 border-green-300" },
                    failed: { label: "Falhou", cls: "bg-red-100 text-red-700 border-red-300" },
                  };
                  const s = map[status];
                  return <Badge className={cn("text-xs", s.cls)}>{s.label}</Badge>;
                };

                return (
                  <>
                    <div className="flex-1 overflow-y-auto border rounded-lg min-h-0">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                          <tr>
                            <th className="text-left text-[10px] font-bold uppercase tracking-wider px-3 py-2 text-muted-foreground">Contato</th>
                            <th className="text-left text-[10px] font-bold uppercase tracking-wider px-3 py-2 text-muted-foreground">Telefone</th>
                            <th className="text-left text-[10px] font-bold uppercase tracking-wider px-3 py-2 text-muted-foreground">Status</th>
                            <th className="text-left text-[10px] font-bold uppercase tracking-wider px-3 py-2 text-muted-foreground">Enviado em</th>
                            <th className="text-left text-[10px] font-bold uppercase tracking-wider px-3 py-2 text-muted-foreground">Erro</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {pageData.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="text-center text-muted-foreground text-sm py-10">
                                {reportSearch ? "Nenhum resultado encontrado" : "Nenhum dado disponível"}
                              </td>
                            </tr>
                          ) : pageData.map(r => (
                            <tr key={r.id} className="hover:bg-muted/30">
                              <td className="px-3 py-2 font-medium text-foreground">{r.contact_name || r.contacts?.name || "—"}</td>
                              <td className="px-3 py-2 text-muted-foreground font-mono text-xs">{r.contact_phone}</td>
                              <td className="px-3 py-2">{statusBadgeReport(r.status)}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">
                                {r.sent_at ? new Date(r.sent_at).toLocaleString("pt-BR") : "—"}
                              </td>
                              <td className="px-3 py-2 text-xs text-red-500 max-w-[200px] truncate" title={r.error_message || ""}>
                                {r.error_message || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {pages > 1 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                        <span>{filtered.length} registro(s)</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={page === 0}
                            onClick={() => setReportPage(p => Math.max(0, p - 1))}
                          >
                            Anterior
                          </Button>
                          <span>Página {page + 1} de {pages}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={page >= pages - 1}
                            onClick={() => setReportPage(p => Math.min(pages - 1, p + 1))}
                          >
                            Próxima
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setReportOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New/Edit Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <BookOpen className="h-5 w-5 text-primary" />
              <DialogTitle>{editingTemplate ? "Editar Template" : "Novo Template"}</DialogTitle>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            <div>
              <label className="text-sm font-medium text-foreground">Nome *</label>
              <Input
                value={tplFormName}
                onChange={(e) => setTplFormName(e.target.value)}
                placeholder="Ex: Saudação inicial"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Categoria</label>
              <Select value={tplFormCategory} onValueChange={setTplFormCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Conteúdo *</label>
              <Textarea
                value={tplFormContent}
                onChange={(e) => setTplFormContent(e.target.value)}
                placeholder="Digite a mensagem... Use {{variavel}} para inserir variáveis"
                rows={5}
                className="mt-1 font-mono text-sm"
              />
              {/* Variable helper buttons */}
              <div className="flex flex-wrap gap-1 mt-2">
                <span className="text-xs text-muted-foreground mr-1 self-center">Inserir:</span>
                {["nome", "saudacao", "data", "produto"].map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="text-xs px-2 py-0.5 rounded border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 font-mono"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
              {/* Detected variables */}
              {detectVariables(tplFormContent).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2 items-center">
                  <span className="text-xs text-muted-foreground">Variáveis detectadas:</span>
                  {detectVariables(tplFormContent).map(v => (
                    <Badge key={v} variant="outline" className="text-xs font-mono text-blue-600 border-blue-300 bg-blue-50">
                      {`{${v}}`}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Preview */}
            {tplFormContent && (
              <div className="bg-muted/40 border border-border rounded-lg p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-1">Prévia:</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{substituteVars(tplFormContent)}</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveTemplate} disabled={tplSaving} className="gap-2">
              {tplSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              {editingTemplate ? "Salvar" : "Criar Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Campaigns;
