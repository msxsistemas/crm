import { useState, useEffect, useCallback } from "react";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CalendarDays, Plus, Trash2, Bell, CalendarCheck, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Appointment {
  id: string;
  contact_id: string | null;
  title: string;
  description: string | null;
  scheduled_at: string;
  notify_via_whatsapp: boolean;
  notified: boolean;
  created_by: string;
  contact_name: string | null;
  contact_phone: string | null;
  agent_name: string | null;
  created_at: string;
  google_event_id?: string | null;
}

interface ContactSuggestion {
  id: string;
  name: string | null;
  phone: string;
}

const DAYS_OF_WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function Appointments() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formContactId, setFormContactId] = useState("");
  const [formContactName, setFormContactName] = useState("");
  const [formScheduledAt, setFormScheduledAt] = useState("");
  const [formNotify, setFormNotify] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactSuggestions, setContactSuggestions] = useState<ContactSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get("/appointments");
      setAppointments(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Erro ao carregar compromissos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // Contact autocomplete
  useEffect(() => {
    if (!contactSearch.trim() || contactSearch.length < 2) {
      setContactSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const data = await api.get(`/contacts?search=${encodeURIComponent(contactSearch)}&limit=8`);
        const list = Array.isArray(data) ? data : (data?.data || []);
        setContactSuggestions(list);
        setShowSuggestions(true);
      } catch {
        setContactSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [contactSearch]);

  const handleSelectContact = (c: ContactSuggestion) => {
    setFormContactId(c.id);
    setFormContactName(c.name || c.phone);
    setContactSearch(c.name || c.phone);
    setShowSuggestions(false);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) { toast.error("Título obrigatório"); return; }
    if (!formScheduledAt) { toast.error("Data/hora obrigatória"); return; }
    setSaving(true);
    try {
      await api.post("/appointments", {
        contact_id: formContactId || null,
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        scheduled_at: new Date(formScheduledAt).toISOString(),
        notify_via_whatsapp: formNotify,
      });
      toast.success("Compromisso criado!");
      setShowModal(false);
      resetForm();
      loadAppointments();
    } catch {
      toast.error("Erro ao salvar compromisso");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este compromisso?")) return;
    try {
      await api.delete(`/appointments/${id}`);
      toast.success("Compromisso excluído");
      setAppointments(prev => prev.filter(a => a.id !== id));
    } catch {
      toast.error("Erro ao excluir");
    }
  };

  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleGoogleSync = async (appt: Appointment) => {
    setSyncingId(appt.id);
    try {
      const res = await api.post<{ google_event_id: string }>(`/google-calendar/sync-appointment/${appt.id}`);
      toast.success("Sincronizado com Google Calendar!");
      setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, google_event_id: (res as any)?.google_event_id ?? res } : a));
    } catch (e: any) {
      const msg = e?.response?.data?.error || "Erro ao sincronizar";
      if (msg.includes("não conectado") || msg.includes("not connected")) {
        toast.error("Conecte o Google Calendar em Configurações > Integrações");
      } else {
        toast.error(msg);
      }
    } finally {
      setSyncingId(null);
    }
  };

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormContactId("");
    setFormContactName("");
    setContactSearch("");
    setFormScheduledAt("");
    setFormNotify(false);
    setShowSuggestions(false);
  };

  // Calendar helpers
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Count appointments per day in current month
  const apptByDay: Record<number, number> = {};
  appointments.forEach(a => {
    const d = new Date(a.scheduled_at);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      apptByDay[day] = (apptByDay[day] || 0) + 1;
    }
  });

  const filteredAppointments = selectedDay
    ? appointments.filter(a => {
        const d = new Date(a.scheduled_at);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === selectedDay;
      })
    : appointments;

  const formatDateTime = (iso: string) => {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const today = new Date();

  return (
    <div className="flex flex-col h-full bg-background overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Agenda</h1>
            <p className="text-sm text-muted-foreground">Gerenciar compromissos</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Compromisso
        </Button>
      </div>

      <div className="flex-1 p-6 space-y-6">
        {/* Calendar */}
        <div className="bg-card border border-border rounded-xl p-4">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
              className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              ‹
            </button>
            <span className="font-semibold text-foreground">
              {MONTHS_PT[month]} {year}
            </span>
            <button
              onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
              className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            >
              ›
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS_OF_WEEK.map(d => (
              <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
              const isSelected = selectedDay === day;
              const count = apptByDay[day] || 0;
              return (
                <button
                  key={day}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  className={cn(
                    "relative flex flex-col items-center justify-center rounded-lg h-10 text-sm transition-colors",
                    isToday && "ring-2 ring-primary ring-offset-1",
                    isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground",
                  )}
                >
                  <span className="font-medium leading-none">{day}</span>
                  {count > 0 && (
                    <span className={cn(
                      "absolute bottom-1 left-1/2 -translate-x-1/2 inline-flex items-center justify-center h-3.5 min-w-[14px] rounded-full text-[9px] font-bold px-0.5",
                      isSelected ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {selectedDay && (
            <div className="mt-3 text-xs text-center text-muted-foreground">
              Mostrando dia {selectedDay} —{" "}
              <button onClick={() => setSelectedDay(null)} className="text-primary hover:underline">
                ver todos
              </button>
            </div>
          )}
        </div>

        {/* Appointments list */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
            {selectedDay ? `Compromissos — ${selectedDay}/${month + 1}/${year}` : "Todos os compromissos"}
          </h2>

          {loading ? (
            <div className="text-sm text-muted-foreground text-center py-8">Carregando...</div>
          ) : filteredAppointments.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nenhum compromisso encontrado
            </div>
          ) : (
            filteredAppointments.map(appt => (
              <div
                key={appt.id}
                className="flex items-start justify-between gap-3 bg-card border border-border rounded-lg px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground truncate">{appt.title}</span>
                    {appt.notify_via_whatsapp && (
                      <Badge variant="secondary" className="gap-1 text-[10px] py-0">
                        <Bell className="h-3 w-3" />
                        WhatsApp
                      </Badge>
                    )}
                    {appt.notified && (
                      <Badge className="bg-green-500/20 text-green-600 border-green-500/30 text-[10px] py-0">
                        Notificado
                      </Badge>
                    )}
                    {appt.google_event_id && (
                      <Badge className="bg-blue-500/20 text-blue-600 border-blue-500/30 text-[10px] py-0 gap-1">
                        <CalendarCheck className="h-2.5 w-2.5" />
                        Sincronizado
                      </Badge>
                    )}
                  </div>
                  {appt.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{appt.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    <span className="font-medium text-foreground/70">
                      📅 {formatDateTime(appt.scheduled_at)}
                    </span>
                    {appt.contact_name && (
                      <span>👤 {appt.contact_name}</span>
                    )}
                    {appt.agent_name && (
                      <span>🧑 {appt.agent_name}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleGoogleSync(appt)}
                    disabled={syncingId === appt.id}
                    className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                    title={appt.google_event_id ? "Atualizar no Google Calendar" : "Sincronizar com Google Calendar"}
                  >
                    {syncingId === appt.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <CalendarCheck className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => handleDelete(appt.id)}
                    className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Excluir compromisso"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* New Appointment Modal */}
      <Dialog open={showModal} onOpenChange={v => { setShowModal(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Compromisso</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="appt-title">Título *</Label>
              <Input
                id="appt-title"
                placeholder="Ex: Reunião com cliente"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appt-desc">Descrição</Label>
              <Textarea
                id="appt-desc"
                placeholder="Detalhes do compromisso..."
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-1.5 relative">
              <Label htmlFor="appt-contact">Contato</Label>
              <Input
                id="appt-contact"
                placeholder="Buscar contato..."
                value={contactSearch}
                onChange={e => {
                  setContactSearch(e.target.value);
                  setFormContactId("");
                }}
                onFocus={() => contactSuggestions.length > 0 && setShowSuggestions(true)}
                autoComplete="off"
              />
              {showSuggestions && contactSuggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {contactSuggestions.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => handleSelectContact(c)}
                    >
                      <span className="font-medium">{c.name || c.phone}</span>
                      {c.name && <span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
              {formContactId && (
                <p className="text-xs text-green-600">Contato selecionado: {formContactName}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="appt-dt">Data e hora *</Label>
              <Input
                id="appt-dt"
                type="datetime-local"
                value={formScheduledAt}
                onChange={e => setFormScheduledAt(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Notificar via WhatsApp</p>
                <p className="text-xs text-muted-foreground">Envia lembrete 15 min antes</p>
              </div>
              <Switch
                checked={formNotify}
                onCheckedChange={setFormNotify}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowModal(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
