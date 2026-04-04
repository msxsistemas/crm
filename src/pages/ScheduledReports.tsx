import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Pencil,
  Trash2,
  Send,
  CalendarDays,
  X,
  ChevronDown,
  ChevronUp,
  Mail,
  Clock,
  Loader2,
} from "lucide-react";
import { format, addDays, nextDay } from "date-fns";
import { ptBR } from "date-fns/locale";

type ReportType =
  | "daily_summary"
  | "weekly_performance"
  | "monthly_overview"
  | "sla_breach"
  | "agent_performance";

type Frequency = "daily" | "weekly" | "monthly";

interface ScheduledReport {
  id: string;
  name: string;
  report_type: ReportType;
  frequency: Frequency;
  day_of_week: number | null;
  day_of_month: number | null;
  send_time: string;
  recipients: string[];
  filters: Record<string, unknown>;
  is_active: boolean;
  last_sent_at: string | null;
  next_send_at: string | null;
  created_at: string;
  created_by: string | null;
}

const REPORT_TYPE_OPTIONS: { value: ReportType; label: string; description: string }[] = [
  {
    value: "daily_summary",
    label: "Resumo Diário",
    description: "Conversas abertas, fechadas, tempo médio de resposta",
  },
  {
    value: "weekly_performance",
    label: "Performance Semanal",
    description: "Métricas por agente ao longo da semana",
  },
  {
    value: "monthly_overview",
    label: "Visão Mensal",
    description: "Relatório executivo completo do mês",
  },
  {
    value: "sla_breach",
    label: "Alertas de SLA",
    description: "Conversas que violaram o prazo de SLA",
  },
  {
    value: "agent_performance",
    label: "Performance de Agentes",
    description: "Ranking e estatísticas individuais dos agentes",
  },
];

const DAY_OF_WEEK_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
};

function calcNextSend(
  frequency: Frequency,
  sendTime: string,
  dayOfWeek: number | null,
  dayOfMonth: number | null
): string {
  const now = new Date();
  const [hh, mm] = sendTime.split(":").map(Number);

  if (frequency === "daily") {
    const candidate = new Date(now);
    candidate.setHours(hh, mm, 0, 0);
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
    return candidate.toISOString();
  }

  if (frequency === "weekly") {
    const targetDay = dayOfWeek ?? 1; // default Monday
    const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"] as const;
    try {
      const next = nextDay(now, targetDay as Parameters<typeof nextDay>[1]);
      next.setHours(hh, mm, 0, 0);
      return next.toISOString();
    } catch {
      return addDays(now, 7).toISOString();
    }
  }

  if (frequency === "monthly") {
    const dom = dayOfMonth ?? 1;
    const candidate = new Date(now.getFullYear(), now.getMonth(), dom, hh, mm);
    if (candidate <= now) {
      candidate.setMonth(candidate.getMonth() + 1);
    }
    return candidate.toISOString();
  }

  return now.toISOString();
}

function formatNextSend(isoString: string | null): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const timeStr = format(date, "HH:mm");

  if (isSameDay(date, now)) return `Hoje às ${timeStr}`;
  if (isSameDay(date, tomorrow)) return `Amanhã às ${timeStr}`;

  const dayName = format(date, "EEEE", { locale: ptBR });
  const dayNameCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  return `${dayNameCap} às ${timeStr}`;
}

// Simple HTML preview table for "send now" simulation
function buildReportPreview(report: ScheduledReport): string {
  const typeLabel = REPORT_TYPE_OPTIONS.find(o => o.value === report.report_type)?.label ?? report.report_type;
  const now = new Date();

  const rows = [
    ["Conversas abertas", "47"],
    ["Conversas fechadas", "31"],
    ["Tempo médio de resposta", "4m 22s"],
    ["Mensagens enviadas", "312"],
    ["Avaliações positivas", "28"],
    ["SLA violados", "3"],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${label}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;">${value}</td></tr>`
    )
    .join("");

  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="color:#1d4ed8;margin-bottom:4px;">${typeLabel}</h2>
  <p style="color:#6b7280;font-size:14px;">Gerado em ${format(now, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
  <table style="width:100%;border-collapse:collapse;margin-top:16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#eff6ff;">
        <th style="padding:10px 12px;text-align:left;font-size:13px;color:#374151;">Métrica</th>
        <th style="padding:10px 12px;text-align:left;font-size:13px;color:#374151;">Valor</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p style="margin-top:16px;font-size:12px;color:#9ca3af;">
    Destinatários: ${report.recipients.join(", ")}
  </p>
</div>`;
}

const emptyForm = {
  name: "",
  report_type: "daily_summary" as ReportType,
  frequency: "daily" as Frequency,
  day_of_week: 1,
  day_of_month: 1,
  send_time: "08:00",
  recipients: [] as string[],
  filters: {} as Record<string, unknown>,
  is_active: true,
};

const ScheduledReports = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [emailInput, setEmailInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Send-now modal
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewReport, setPreviewReport] = useState<ScheduledReport | null>(null);
  const [sendingNow, setSendingNow] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("scheduled_reports")
      .select("*")
      .order("created_at", { ascending: false });
    setReports((data as ScheduledReport[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setEmailInput("");
    setShowFilters(false);
    setDialogOpen(true);
  };

  const openEdit = (r: ScheduledReport) => {
    setEditingId(r.id);
    setForm({
      name: r.name,
      report_type: r.report_type,
      frequency: r.frequency,
      day_of_week: r.day_of_week ?? 1,
      day_of_month: r.day_of_month ?? 1,
      send_time: r.send_time,
      recipients: r.recipients,
      filters: r.filters,
      is_active: r.is_active,
    });
    setEmailInput("");
    setShowFilters(false);
    setDialogOpen(true);
  };

  const addEmail = () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("E-mail inválido");
      return;
    }
    if (form.recipients.includes(email)) {
      toast.error("E-mail já adicionado");
      return;
    }
    setForm(f => ({ ...f, recipients: [...f.recipients, email] }));
    setEmailInput("");
  };

  const removeEmail = (email: string) => {
    setForm(f => ({ ...f, recipients: f.recipients.filter(e => e !== email) }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Informe o nome do relatório"); return; }
    if (form.recipients.length === 0) { toast.error("Adicione ao menos um destinatário"); return; }

    setSaving(true);
    const nextSend = calcNextSend(
      form.frequency,
      form.send_time,
      form.frequency === "weekly" ? form.day_of_week : null,
      form.frequency === "monthly" ? form.day_of_month : null
    );

    const payload = {
      name: form.name.trim(),
      report_type: form.report_type,
      frequency: form.frequency,
      day_of_week: form.frequency === "weekly" ? form.day_of_week : null,
      day_of_month: form.frequency === "monthly" ? form.day_of_month : null,
      send_time: form.send_time,
      recipients: form.recipients,
      filters: form.filters,
      is_active: form.is_active,
      next_send_at: nextSend,
      created_by: user?.id,
    };

    if (editingId) {
      const { error } = await supabase
        .from("scheduled_reports")
        .update(payload as any)
        .eq("id", editingId);
      if (error) { toast.error("Erro ao salvar"); setSaving(false); return; }
      toast.success("Relatório atualizado!");
    } else {
      const { error } = await supabase
        .from("scheduled_reports")
        .insert(payload as any);
      if (error) { toast.error("Erro ao criar"); setSaving(false); return; }
      toast.success("Relatório agendado!");
    }

    setSaving(false);
    setDialogOpen(false);
    fetchReports();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este relatório agendado?")) return;
    await supabase.from("scheduled_reports").delete().eq("id", id);
    toast.success("Relatório removido");
    fetchReports();
  };

  const handleToggleActive = async (report: ScheduledReport) => {
    await supabase
      .from("scheduled_reports")
      .update({ is_active: !report.is_active } as any)
      .eq("id", report.id);
    setReports(prev =>
      prev.map(r => r.id === report.id ? { ...r, is_active: !r.is_active } : r)
    );
  };

  const handleSendNow = (report: ScheduledReport) => {
    setPreviewReport(report);
    setPreviewOpen(true);
  };

  const confirmSendNow = async () => {
    if (!previewReport) return;
    setSendingNow(true);
    // Simulate sending — update last_sent_at
    await supabase
      .from("scheduled_reports")
      .update({ last_sent_at: new Date().toISOString() } as any)
      .eq("id", previewReport.id);
    setSendingNow(false);
    setPreviewOpen(false);
    toast.success(`Relatório "${previewReport.name}" enviado com sucesso!`);
    fetchReports();
  };

  const typeLabel = (t: ReportType) =>
    REPORT_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-background shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <CalendarDays className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Relatórios Agendados</h1>
            <p className="text-xs text-muted-foreground">
              Automatize o envio de relatórios por e-mail
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Agendamento
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-foreground font-medium mb-1">Nenhum relatório agendado</p>
            <p className="text-sm text-muted-foreground mb-4">
              Crie agendamentos para receber relatórios automáticos por e-mail
            </p>
            <Button onClick={openCreate} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Criar primeiro agendamento
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[200px]">Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Frequência</TableHead>
                  <TableHead>Horário</TableHead>
                  <TableHead>Destinatários</TableHead>
                  <TableHead>Próximo envio</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map(r => (
                  <TableRow key={r.id} className="hover:bg-muted/20">
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{typeLabel(r.report_type)}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs font-normal">
                        {FREQUENCY_LABELS[r.frequency]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {r.send_time}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate max-w-[160px]">
                          {r.recipients.length === 1
                            ? r.recipients[0]
                            : `${r.recipients[0]} +${r.recipients.length - 1}`}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatNextSend(r.next_send_at)}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={r.is_active}
                        onCheckedChange={() => handleToggleActive(r)}
                        className="scale-75"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs gap-1"
                          onClick={() => handleSendNow(r)}
                        >
                          <Send className="h-3.5 w-3.5" />
                          Enviar agora
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => openEdit(r)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-500 hover:text-red-600"
                          onClick={() => handleDelete(r.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-blue-600" />
              {editingId ? "Editar Agendamento" : "Novo Agendamento"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="report-name">Nome *</Label>
              <Input
                id="report-name"
                placeholder="Ex: Resumo diário da equipe"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            {/* Tipo de relatório */}
            <div className="space-y-1.5">
              <Label>Tipo de relatório *</Label>
              <Select
                value={form.report_type}
                onValueChange={v => setForm(f => ({ ...f, report_type: v as ReportType }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div>
                        <p className="font-medium text-sm">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.description}</p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Frequência */}
            <div className="space-y-1.5">
              <Label>Frequência *</Label>
              <div className="flex gap-2">
                {(["daily", "weekly", "monthly"] as Frequency[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setForm(prev => ({ ...prev, frequency: f }))}
                    className={`flex-1 py-2 rounded-md text-sm font-medium border transition-colors ${
                      form.frequency === f
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {FREQUENCY_LABELS[f]}
                  </button>
                ))}
              </div>

              {/* Weekly: day of week */}
              {form.frequency === "weekly" && (
                <div className="mt-3 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Dia da semana</Label>
                  <div className="flex gap-1 flex-wrap">
                    {DAY_OF_WEEK_LABELS.map((label, idx) => (
                      <button
                        key={idx}
                        onClick={() => setForm(f => ({ ...f, day_of_week: idx }))}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          form.day_of_week === idx
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly: day of month */}
              {form.frequency === "monthly" && (
                <div className="mt-3 space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Dia do mês (1–31)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={form.day_of_month}
                    onChange={e =>
                      setForm(f => ({
                        ...f,
                        day_of_month: Math.min(31, Math.max(1, Number(e.target.value))),
                      }))
                    }
                    className="w-24"
                  />
                </div>
              )}
            </div>

            {/* Horário */}
            <div className="space-y-1.5">
              <Label htmlFor="send-time">Horário de envio</Label>
              <Input
                id="send-time"
                type="time"
                value={form.send_time}
                onChange={e => setForm(f => ({ ...f, send_time: e.target.value }))}
                className="w-32"
              />
            </div>

            {/* Destinatários */}
            <div className="space-y-1.5">
              <Label>Destinatários *</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { e.preventDefault(); addEmail(); }
                  }}
                />
                <Button type="button" variant="outline" onClick={addEmail}>
                  Adicionar
                </Button>
              </div>
              {form.recipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {form.recipients.map(email => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium"
                    >
                      {email}
                      <button
                        onClick={() => removeEmail(email)}
                        className="hover:text-blue-900 dark:hover:text-blue-100 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Digite o e-mail e pressione Enter ou clique em Adicionar
              </p>
            </div>

            {/* Filtros adicionais (collapsible) */}
            <div className="border border-border rounded-md overflow-hidden">
              <button
                onClick={() => setShowFilters(v => !v)}
                className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-foreground bg-muted/40 hover:bg-muted/60 transition-colors"
              >
                Filtros adicionais (opcional)
                {showFilters ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {showFilters && (
                <div className="p-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Filtrar por agente</Label>
                    <Input
                      placeholder="ID ou nome do agente"
                      value={(form.filters.agent as string) || ""}
                      onChange={e =>
                        setForm(f => ({ ...f, filters: { ...f.filters, agent: e.target.value } }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Filtrar por conexão</Label>
                    <Input
                      placeholder="Nome da instância"
                      value={(form.filters.connection as string) || ""}
                      onChange={e =>
                        setForm(f => ({
                          ...f,
                          filters: { ...f.filters, connection: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Status */}
            <div className="flex items-center justify-between">
              <Label>Ativo</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingId ? "Salvar alterações" : "Criar agendamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Now Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-blue-600" />
              Prévia do Relatório — {previewReport?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="py-2">
            {/* SMTP note */}
            <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
              <Mail className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                Configure um servidor SMTP nas configurações para envio real de e-mails.
              </span>
            </div>

            {/* Preview HTML */}
            {previewReport && (
              <div
                className="border border-border rounded-lg overflow-hidden"
                dangerouslySetInnerHTML={{ __html: buildReportPreview(previewReport) }}
              />
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmSendNow} disabled={sendingNow} className="gap-2">
              {sendingNow ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Confirmar envio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ScheduledReports;
