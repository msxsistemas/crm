import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import {
  Search, Plus, X, RefreshCw, ChevronLeft, ChevronRight,
  Calendar as CalendarIcon, List, Clock, User, MessageSquare,
  Paperclip, Settings, Pencil, Trash2, Repeat, Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FloatingInput, FloatingTextarea, FloatingSelectWrapper } from "@/components/ui/floating-input";
import { toast } from "sonner";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, addMonths, subMonths, isToday,
  isSameMonth, isSameDay
} from "date-fns";
import { ptBR } from "date-fns/locale";

interface Schedule {
  id: string;
  contact_name: string;
  contact_phone: string;
  connection: string;
  queue: string;
  message: string;
  send_at: string;
  status: "pending" | "sent" | "failed";
  open_ticket: boolean;
  create_note: boolean;
  repeat_interval: string;
  repeat_daily: string;
  repeat_count: string;
}

const WEEKDAYS = [
  { label: "Seg", value: "1" },
  { label: "Ter", value: "2" },
  { label: "Qua", value: "3" },
  { label: "Qui", value: "4" },
  { label: "Sex", value: "5" },
  { label: "Sáb", value: "6" },
  { label: "Dom", value: "0" },
];

const isRecurring = (s: Schedule) =>
  s.repeat_interval && s.repeat_interval !== "none" && s.repeat_interval !== "";

const Schedules = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"month" | "day" | "history">("month");
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formConnection, setFormConnection] = useState("");
  const [formQueue, setFormQueue] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formDateTime, setFormDateTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [formOpenTicket, setFormOpenTicket] = useState("no");
  const [formCreateNote, setFormCreateNote] = useState("no");
  const [formRepeatInterval, setFormRepeatInterval] = useState("none");
  // For weekly: comma-separated day numbers e.g. "1,2,5"
  const [formRepeatDays, setFormRepeatDays] = useState<string[]>([]);
  // repeat_count mode: "unlimited" | "count"
  const [formRepeatCountMode, setFormRepeatCountMode] = useState("unlimited");
  const [formRepeatCountValue, setFormRepeatCountValue] = useState("5");

  // Contacts for search
  const [contacts, setContacts] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [formContactPhone, setFormContactPhone] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  // Connections
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [deleteScheduleId, setDeleteScheduleId] = useState<string | null>(null);
  const [deletingSchedule, setDeletingSchedule] = useState(false);

  // Sending state: scheduleId -> loading
  const [sendingIds, setSendingIds] = useState<Record<string, boolean>>({});

  // TanStack Query: schedules
  const { data: schedulesData = [], refetch: loadSchedules } = useQuery<Schedule[]>({
    queryKey: ['schedules'],
    queryFn: async () => {
      const rows = await api.get<any[]>('/schedules');
      return rows.map((s: any) => ({
        id: s.id,
        contact_name: s.contact_name,
        contact_phone: s.contact_phone,
        connection: s.connection_name || s.connection_id || "",
        queue: s.queue || "",
        message: s.message,
        send_at: s.send_at || s.scheduled_at,
        status: s.status,
        open_ticket: s.open_ticket,
        create_note: s.create_note,
        repeat_interval: s.repeat_interval,
        repeat_daily: s.repeat_daily,
        repeat_count: s.repeat_count,
      }));
    },
    enabled: !!user,
  });
  const schedules = schedulesData;

  // TanStack Query: connections
  const { data: connectionsData = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['evolution-connections'],
    queryFn: async () => {
      const rows = await api.get<any[]>('/evolution-connections');
      return rows.map(c => ({ id: c.id || c.instance_name, name: c.instance_name || c.name }));
    },
    enabled: !!user,
  });
  const connections = connectionsData;

  // Schedule mutations
  const saveMutation = useMutation({
    mutationFn: (payload: { id?: string; data: any }) =>
      payload.id
        ? api.patch(`/schedules/${payload.id}`, payload.data)
        : api.post('/schedules', payload.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/schedules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['schedules'] }),
  });

  const searchContacts = async (q: string) => {
    setContactSearch(q);
    if (q.length < 3) { setContacts([]); setShowContactDropdown(false); return; }
    const data = await api.get<any[]>(`/contacts?search=${encodeURIComponent(q)}&limit=10`);
    setContacts((data || []).map((c: any) => ({ id: c.id, name: c.name || c.phone, phone: c.phone })));
    setShowContactDropdown(true);
  };

  const selectContact = (c: { id: string; name: string; phone: string }) => {
    setContactSearch(c.name);
    setFormContactPhone(c.phone);
    setShowContactDropdown(false);
  };

  const filtered = useMemo(() => {
    if (!search) return schedules;
    const s = search.toLowerCase();
    return schedules.filter(sc =>
      sc.contact_name.toLowerCase().includes(s) ||
      sc.contact_phone.toLowerCase().includes(s) ||
      sc.message.toLowerCase().includes(s) ||
      sc.status.toLowerCase().includes(s)
    );
  }, [schedules, search]);

  const resetForm = () => {
    setContactSearch("");
    setFormContactPhone("");
    setFormConnection("");
    setFormQueue("");
    setFormMessage("");
    setFormDateTime(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setFormOpenTicket("no");
    setFormCreateNote("no");
    setFormRepeatInterval("none");
    setFormRepeatDays([]);
    setFormRepeatCountMode("unlimited");
    setFormRepeatCountValue("5");
    setEditingSchedule(null);
  };

  // Parse stored repeat_daily string into formRepeatDays (weekly mode) or countMode
  const parseRepeatFields = (s: Schedule) => {
    // repeat_daily in weekly mode stores "1,2,3"; in other modes it was "none"/"weekdays"/"all"
    // repeat_count stores "unlimited" or a number string
    const days = s.repeat_daily && s.repeat_daily !== "none" && s.repeat_interval === "weekly"
      ? s.repeat_daily.split(",").filter(Boolean)
      : [];
    const countMode = s.repeat_count === "unlimited" ? "unlimited" : "count";
    const countValue = s.repeat_count === "unlimited" ? "5" : s.repeat_count;
    return { days, countMode, countValue };
  };

  const openEdit = (s: Schedule) => {
    const { days, countMode, countValue } = parseRepeatFields(s);
    setEditingSchedule(s);
    setContactSearch(s.contact_name);
    setFormContactPhone(s.contact_phone);
    setFormConnection(s.connection);
    setFormQueue(s.queue);
    setFormMessage(s.message);
    setFormDateTime(format(new Date(s.send_at), "yyyy-MM-dd'T'HH:mm"));
    setFormOpenTicket(s.open_ticket ? "yes" : "no");
    setFormCreateNote(s.create_note ? "yes" : "no");
    setFormRepeatInterval(s.repeat_interval || "none");
    setFormRepeatDays(days);
    setFormRepeatCountMode(countMode);
    setFormRepeatCountValue(countValue);
    setDialogOpen(true);
  };

  const handleDeleteSchedule = async () => {
    if (!deleteScheduleId) return;
    setDeletingSchedule(true);
    try {
      await deleteMutation.mutateAsync(deleteScheduleId);
      toast.success("Agendamento excluído!");
    } catch { toast.error("Erro ao excluir agendamento"); }
    setDeleteScheduleId(null);
    setDeletingSchedule(false);
  };

  const buildRepeatDaily = () => {
    if (formRepeatInterval === "weekly") {
      return formRepeatDays.length > 0 ? formRepeatDays.join(",") : "none";
    }
    return "none";
  };

  const buildRepeatCount = () => {
    if (formRepeatCountMode === "count") return formRepeatCountValue;
    return "unlimited";
  };

  const handleSave = async () => {
    if (!contactSearch.trim()) { toast.error("Selecione um contato"); return; }
    if (!formConnection) { toast.error("Selecione uma conexão"); return; }
    if (!user) return;

    const payload = {
      contact_name: contactSearch,
      contact_phone: formContactPhone,
      connection_name: formConnection || null,
      queue: formQueue || null,
      message: formMessage,
      send_at: new Date(formDateTime).toISOString(),
      open_ticket: formOpenTicket === "yes",
      create_note: formCreateNote === "yes",
      repeat_interval: formRepeatInterval,
      repeat_daily: buildRepeatDaily(),
      repeat_count: buildRepeatCount(),
    };

    try {
      if (editingSchedule) {
        await saveMutation.mutateAsync({ id: editingSchedule.id, data: payload });
        toast.success("Agendamento atualizado!");
      } else {
        await saveMutation.mutateAsync({ data: { ...payload, status: "pending" } });
        toast.success("Agendamento criado!");
      }
      setEditingSchedule(null);
      setDialogOpen(false);
      resetForm();
    } catch { toast.error("Erro ao salvar agendamento"); }
  };

  const toggleWeekday = (val: string) => {
    setFormRepeatDays(prev =>
      prev.includes(val) ? prev.filter(d => d !== val) : [...prev, val]
    );
  };

  // "Enviar agora" — mark as processing so the schedules worker picks it up immediately
  const handleSendNow = async (s: Schedule) => {
    setSendingIds(prev => ({ ...prev, [s.id]: true }));
    try {
      await api.patch(`/schedules/${s.id}`, { status: "pending", send_at: new Date().toISOString() });
      toast.success("Agendamento enviado para processamento!");
      queryClient.invalidateQueries({ queryKey: ['schedules'] });
    } catch (err: any) {
      toast.error("Erro ao enviar: " + (err?.message || "desconhecido"));
    } finally {
      setSendingIds(prev => { const next = { ...prev }; delete next[s.id]; return next; });
    }
  };

  const navigateCal = (dir: "prev" | "next" | "today") => {
    if (dir === "today") { setCalendarDate(new Date()); return; }
    setCalendarDate(dir === "prev" ? subMonths(calendarDate, 1) : addMonths(calendarDate, 1));
  };

  const monthStart = startOfMonth(calendarDate);
  const monthEnd = endOfMonth(calendarDate);
  const calStart = startOfWeek(monthStart, { locale: ptBR });
  const calEnd = endOfWeek(monthEnd, { locale: ptBR });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const getSchedulesForDay = (day: Date) => filtered.filter(s => isSameDay(new Date(s.send_at), day));

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-blue-600">Agendamentos</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => loadSchedules()}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white uppercase text-xs font-semibold gap-1.5">
            <Plus className="h-4 w-4" /> NOVO AGENDAMENTO
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {/* Search */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone, mensagem ou status..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 border-0 bg-transparent shadow-none"
            />
          </div>
        </div>

        {/* View tabs */}
        <div className="flex justify-center">
          <div className="flex border border-border rounded-md overflow-hidden">
            {([
              { key: "month" as const, icon: CalendarIcon, label: "MÊS" },
              { key: "day" as const, icon: List, label: "DIA" },
              { key: "history" as const, icon: Clock, label: "HISTÓRICO" },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setViewMode(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold ${viewMode === tab.key ? "bg-blue-600 text-white" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                <tab.icon className="h-3.5 w-3.5" /> {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateCal("prev")}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" className="text-xs font-semibold uppercase" onClick={() => navigateCal("today")}>HOJE</Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateCal("next")}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <h2 className="text-lg font-bold text-foreground capitalize">
            {format(calendarDate, "MMMM yyyy", { locale: ptBR })}
          </h2>
          <div className="w-24" />
        </div>

        {/* Month calendar */}
        {viewMode === "month" && (
          <div className="rounded-lg border border-border overflow-hidden bg-card">
            <div className="grid grid-cols-7">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => (
                <div key={d} className="text-center text-xs font-bold text-muted-foreground py-2.5 border-b border-border bg-muted/20">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {calDays.map((day, i) => {
                const daySchedules = getSchedulesForDay(day);
                const inMonth = isSameMonth(day, calendarDate);
                const today = isToday(day);
                return (
                  <div
                    key={i}
                    className={`min-h-[90px] border-b border-r border-border p-2 cursor-pointer hover:bg-muted/20 transition-colors ${!inMonth ? "bg-muted/10" : ""} ${today ? "ring-2 ring-inset ring-blue-500" : ""}`}
                    onClick={() => { setCalendarDate(day); setViewMode("day"); }}
                  >
                    <p className={`text-sm font-semibold ${today ? "text-blue-600" : !inMonth ? "text-muted-foreground/40" : "text-foreground"}`}>
                      {format(day, "d")}
                    </p>
                    {daySchedules.map(s => (
                      <div key={s.id} className="bg-orange-400 text-white text-[10px] px-1.5 py-0.5 rounded mt-1 truncate flex items-center gap-1" onClick={(e) => { e.stopPropagation(); openEdit(s); }}>
                        {isRecurring(s) && <Repeat className="h-2.5 w-2.5 shrink-0" />}
                        {format(new Date(s.send_at), "HH:mm")} - {s.contact_name}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === "day" && (() => {
          const daySchedules = getSchedulesForDay(calendarDate);
          return (
            <div className="rounded-lg border border-border overflow-hidden bg-card">
              <div className="px-4 py-3 border-b border-border bg-muted/20">
                <p className="text-sm font-semibold text-foreground capitalize">
                  {format(calendarDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </p>
              </div>
              {daySchedules.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <CalendarIcon className="h-12 w-12 mb-3 opacity-20" />
                  <p className="font-medium">Nenhum agendamento neste dia</p>
                  <p className="text-xs mt-1">Navegue para outro dia ou crie um agendamento</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {daySchedules.map(s => (
                    <div key={s.id} className="flex items-center gap-4 px-4 py-3">
                      <div className="text-sm font-bold text-blue-600 w-12 shrink-0">
                        {format(new Date(s.send_at), "HH:mm")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate flex items-center gap-1.5">
                          {s.contact_name}
                          {isRecurring(s) && <Repeat className="h-3.5 w-3.5 text-blue-400 shrink-0" title="Recorrente" />}
                        </p>
                        {s.contact_phone && <p className="text-xs text-muted-foreground">{s.contact_phone}</p>}
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{s.message}</p>
                      </div>
                      <div className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        s.status === "sent" ? "bg-green-100 text-green-700" :
                        s.status === "failed" ? "bg-red-100 text-red-700" :
                        "bg-orange-100 text-orange-700"
                      }`}>
                        {s.status === "sent" ? "Enviado" : s.status === "failed" ? "Falhou" : "Pendente"}
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        {s.status === "pending" && (
                          <button
                            onClick={() => handleSendNow(s)}
                            disabled={!!sendingIds[s.id]}
                            title="Enviar agora"
                            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                          >
                            <Send className="h-3 w-3" />
                            {sendingIds[s.id] ? "Enviando..." : "Enviar agora"}
                          </button>
                        )}
                        <button onClick={() => openEdit(s)} className="p-1 text-muted-foreground hover:text-blue-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeleteScheduleId(s.id)} className="p-1 text-muted-foreground hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {viewMode === "history" && (() => {
          const past = filtered.filter(s => s.status === "sent" || s.status === "failed" || new Date(s.send_at) < new Date());
          return (
            <div className="rounded-lg border border-border overflow-hidden bg-card">
              <div className="px-4 py-3 border-b border-border bg-muted/20">
                <p className="text-sm font-semibold text-foreground">Histórico de agendamentos</p>
              </div>
              {past.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Clock className="h-12 w-12 mb-3 opacity-20" />
                  <p className="font-medium">Nenhum agendamento no histórico</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {past.map(s => (
                    <div key={s.id} className="flex items-center gap-4 px-4 py-3">
                      <div className="text-xs text-muted-foreground w-32 shrink-0">
                        {format(new Date(s.send_at), "dd/MM/yyyy HH:mm")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate flex items-center gap-1.5">
                          {s.contact_name}
                          {isRecurring(s) && <Repeat className="h-3.5 w-3.5 text-blue-400 shrink-0" title="Recorrente" />}
                        </p>
                        {s.contact_phone && <p className="text-xs text-muted-foreground">{s.contact_phone}</p>}
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{s.message}</p>
                      </div>
                      <div className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                        s.status === "sent" ? "bg-green-100 text-green-700" :
                        s.status === "failed" ? "bg-red-100 text-red-700" :
                        "bg-orange-100 text-orange-700"
                      }`}>
                        {s.status === "sent" ? "Enviado" : s.status === "failed" ? "Falhou" : "Pendente"}
                      </div>
                      <div className="flex items-center gap-1 ml-2">
                        {s.status === "pending" && (
                          <button
                            onClick={() => handleSendNow(s)}
                            disabled={!!sendingIds[s.id]}
                            title="Enviar agora"
                            className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                          >
                            <Send className="h-3 w-3" />
                            {sendingIds[s.id] ? "Enviando..." : "Enviar agora"}
                          </button>
                        )}
                        <button onClick={() => openEdit(s)} className="p-1 text-muted-foreground hover:text-blue-600 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setDeleteScheduleId(s.id)} className="p-1 text-muted-foreground hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* New Schedule Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 px-6 py-4 flex items-center gap-3">
            <CalendarIcon className="h-5 w-5 text-white" />
            <h2 className="text-lg font-bold text-white flex-1">{editingSchedule ? "Editar Agendamento" : "Novo Agendamento"}</h2>
            <button onClick={() => setDialogOpen(false)} className="text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
            {/* Informações do Contato */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <User className="h-4 w-4" /> Informações do Contato
              </h3>
              <div className="relative">
                <FloatingInput
                  label="Digite o nome do contato..."
                  value={contactSearch}
                  onChange={(e) => searchContacts(e.target.value)}
                />
                {showContactDropdown && contacts.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {contacts.map(c => (
                      <button key={c.id} onClick={() => selectContact(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted">
                        {c.name} - {c.phone}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Search className="h-3 w-3" /> Digite pelo menos 3 letras para buscar contatos
                </p>
              </div>
            </div>

            {/* Conexão e Fila */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                🔌 Conexão e Fila
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <FloatingSelectWrapper label="Conexão *" hasValue={!!formConnection}>
                  <Select value={formConnection} onValueChange={setFormConnection}>
                    <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                    <SelectContent>
                      {connections.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FloatingSelectWrapper>
                <FloatingSelectWrapper label="Fila" hasValue={!!formQueue}>
                  <Select value={formQueue} onValueChange={setFormQueue}>
                    <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Padrão</SelectItem>
                    </SelectContent>
                  </Select>
                </FloatingSelectWrapper>
              </div>
            </div>

            {/* Mensagem */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <MessageSquare className="h-4 w-4" /> Mensagem
              </h3>
              <FloatingTextarea label="Mensagem" value={formMessage} onChange={(e) => setFormMessage(e.target.value)} rows={4} />
            </div>

            {/* Data e Horário */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <CalendarIcon className="h-4 w-4" /> Data e Horário
              </h3>
              <FloatingInput
                label="Data e Horário do Envio"
                type="datetime-local"
                value={formDateTime}
                onChange={(e) => setFormDateTime(e.target.value)}
              />
            </div>

            {/* Recorrência */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <Repeat className="h-4 w-4" /> Recorrência
              </h3>
              <div className="space-y-4">
                {/* Intervalo */}
                <FloatingSelectWrapper label="Intervalo" hasValue={true}>
                  <Select value={formRepeatInterval} onValueChange={(v) => { setFormRepeatInterval(v); if (v !== "weekly") setFormRepeatDays([]); }}>
                    <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sem repetição</SelectItem>
                      <SelectItem value="daily">Diário</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensal</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </FloatingSelectWrapper>

                {/* Dias da semana — only for weekly */}
                {formRepeatInterval === "weekly" && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Dias da semana</p>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map(wd => (
                        <button
                          key={wd.value}
                          type="button"
                          onClick={() => toggleWeekday(wd.value)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                            formRepeatDays.includes(wd.value)
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-card text-muted-foreground border-border hover:border-blue-400"
                          }`}
                        >
                          {wd.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Repetir até */}
                <div className="grid grid-cols-2 gap-4">
                  <FloatingSelectWrapper label="Repetir até" hasValue={true}>
                    <Select value={formRepeatCountMode} onValueChange={setFormRepeatCountMode}>
                      <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unlimited">Sem limite</SelectItem>
                        <SelectItem value="count">Número de vezes</SelectItem>
                      </SelectContent>
                    </Select>
                  </FloatingSelectWrapper>

                  {/* Quantidade — only when count mode */}
                  {formRepeatCountMode === "count" && (
                    <FloatingInput
                      label="Quantidade"
                      type="number"
                      min="1"
                      value={formRepeatCountValue}
                      onChange={(e) => setFormRepeatCountValue(e.target.value)}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Configurações Avançadas */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <Settings className="h-4 w-4" /> Configurações Avançadas
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <FloatingSelectWrapper label="Abrir Ticket?" hasValue={true}>
                  <Select value={formOpenTicket} onValueChange={setFormOpenTicket}>
                    <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">Não</SelectItem>
                      <SelectItem value="yes">Sim</SelectItem>
                    </SelectContent>
                  </Select>
                </FloatingSelectWrapper>
                <FloatingSelectWrapper label="Criar Anotação" hasValue={true}>
                  <Select value={formCreateNote} onValueChange={setFormCreateNote}>
                    <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">Não</SelectItem>
                      <SelectItem value="yes">Sim</SelectItem>
                    </SelectContent>
                  </Select>
                </FloatingSelectWrapper>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <Button variant="outline" className="gap-1.5 text-xs font-semibold uppercase">
              <Paperclip className="h-4 w-4" /> ANEXAR ARQUIVO
            </Button>
            <div className="flex gap-3">
              <Button variant="outline" className="uppercase font-semibold text-xs" onClick={() => setDialogOpen(false)}>CANCELAR</Button>
              <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white uppercase font-semibold text-xs px-6">{editingSchedule ? "SALVAR" : "ADICIONAR"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Schedule Dialog */}
      <Dialog open={!!deleteScheduleId} onOpenChange={(o) => !o && setDeleteScheduleId(null)}>
        <DialogContent className="sm:max-w-md">
          <div className="p-6">
            <h3 className="text-lg font-bold text-foreground mb-2">Excluir agendamento</h3>
            <p className="text-sm text-muted-foreground mb-6">Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteScheduleId(null)}>Cancelar</Button>
              <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDeleteSchedule} disabled={deletingSchedule}>
                {deletingSchedule ? "Excluindo..." : "Excluir"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Schedules;
