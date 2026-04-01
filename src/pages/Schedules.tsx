import { useState, useEffect, useMemo } from "react";
import {
  Search, Plus, X, RefreshCw, ChevronLeft, ChevronRight,
  Calendar as CalendarIcon, List, Clock, User, MessageSquare,
  Paperclip, Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FloatingInput, FloatingTextarea, FloatingSelectWrapper } from "@/components/ui/floating-input";
import { supabase } from "@/integrations/supabase/client";
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

const Schedules = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"month" | "day" | "history">("month");
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formContact, setFormContact] = useState("");
  const [formConnection, setFormConnection] = useState("");
  const [formQueue, setFormQueue] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formDateTime, setFormDateTime] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [formOpenTicket, setFormOpenTicket] = useState("no");
  const [formCreateNote, setFormCreateNote] = useState("no");
  const [formRepeatInterval, setFormRepeatInterval] = useState("none");
  const [formRepeatDaily, setFormRepeatDaily] = useState("none");
  const [formRepeatCount, setFormRepeatCount] = useState("unlimited");

  // Contacts for search
  const [contacts, setContacts] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  // Connections
  const [connections, setConnections] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchConnections = async () => {
      const { data } = await supabase.from("evolution_connections").select("id, instance_name");
      if (data) setConnections(data.map(c => ({ id: c.id, name: c.instance_name })));
    };
    fetchConnections();
  }, []);

  const searchContacts = async (query: string) => {
    setContactSearch(query);
    if (query.length < 3) { setContacts([]); setShowContactDropdown(false); return; }
    const { data } = await supabase.from("contacts").select("id, name, phone").or(`name.ilike.%${query}%,phone.ilike.%${query}%`).limit(10);
    if (data) {
      setContacts(data.map(c => ({ id: c.id, name: c.name || c.phone, phone: c.phone })));
      setShowContactDropdown(true);
    }
  };

  const selectContact = (c: { id: string; name: string; phone: string }) => {
    setFormContact(c.name);
    setContactSearch(c.name);
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
    setFormContact("");
    setContactSearch("");
    setFormConnection("");
    setFormQueue("");
    setFormMessage("");
    setFormDateTime(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setFormOpenTicket("no");
    setFormCreateNote("no");
    setFormRepeatInterval("none");
    setFormRepeatDaily("none");
    setFormRepeatCount("unlimited");
  };

  const handleSave = () => {
    if (!contactSearch.trim()) { toast.error("Selecione um contato"); return; }
    if (!formConnection) { toast.error("Selecione uma conexão"); return; }

    const newSchedule: Schedule = {
      id: crypto.randomUUID(),
      contact_name: contactSearch,
      contact_phone: "",
      connection: formConnection,
      queue: formQueue,
      message: formMessage,
      send_at: formDateTime,
      status: "pending",
      open_ticket: formOpenTicket === "yes",
      create_note: formCreateNote === "yes",
      repeat_interval: formRepeatInterval,
      repeat_daily: formRepeatDaily,
      repeat_count: formRepeatCount,
    };
    setSchedules(prev => [...prev, newSchedule]);
    toast.success("Agendamento criado!");
    setDialogOpen(false);
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
          <Button variant="ghost" size="icon"><RefreshCw className="h-4 w-4" /></Button>
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
                  <div key={i} className={`min-h-[90px] border-b border-r border-border p-2 ${!inMonth ? "bg-muted/10" : ""} ${today ? "ring-2 ring-inset ring-blue-500" : ""}`}>
                    <p className={`text-sm font-semibold ${today ? "text-blue-600" : !inMonth ? "text-muted-foreground/40" : "text-foreground"}`}>
                      {format(day, "d")}
                    </p>
                    {daySchedules.map(s => (
                      <div key={s.id} className="bg-orange-400 text-white text-[10px] px-1.5 py-0.5 rounded mt-1 truncate">
                        {format(new Date(s.send_at), "HH:mm")} - {s.contact_name}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === "day" && (
          <div className="rounded-lg border border-border p-6 bg-card text-center text-muted-foreground">
            <p>Visualização por dia — selecione um dia no calendário</p>
          </div>
        )}

        {viewMode === "history" && (
          <div className="rounded-lg border border-border p-6 bg-card text-center text-muted-foreground">
            <p>Nenhum agendamento no histórico</p>
          </div>
        )}
      </div>

      {/* New Schedule Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 px-6 py-4 flex items-center gap-3">
            <CalendarIcon className="h-5 w-5 text-white" />
            <h2 className="text-lg font-bold text-white flex-1">Novo Agendamento</h2>
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

            {/* Configurações Avançadas */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <Settings className="h-4 w-4" /> Configurações Avançadas
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
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
              <div className="grid grid-cols-2 gap-4 mb-4">
                <FloatingSelectWrapper label="Repetir a cada" hasValue={true}>
                  <Select value={formRepeatInterval} onValueChange={setFormRepeatInterval}>
                    <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não Repetir</SelectItem>
                      <SelectItem value="daily">Diariamente</SelectItem>
                      <SelectItem value="weekly">Semanalmente</SelectItem>
                      <SelectItem value="monthly">Mensalmente</SelectItem>
                    </SelectContent>
                  </Select>
                </FloatingSelectWrapper>
                <FloatingSelectWrapper label="Repetir todo dia" hasValue={true}>
                  <Select value={formRepeatDaily} onValueChange={setFormRepeatDaily}>
                    <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não Repetir</SelectItem>
                      <SelectItem value="weekdays">Dias úteis</SelectItem>
                      <SelectItem value="all">Todos os dias</SelectItem>
                    </SelectContent>
                  </Select>
                </FloatingSelectWrapper>
              </div>
              <FloatingSelectWrapper label="Quantas vezes repetir" hasValue={true}>
                <Select value={formRepeatCount} onValueChange={setFormRepeatCount}>
                  <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unlimited">Ilimitado</SelectItem>
                    <SelectItem value="5">5 vezes</SelectItem>
                    <SelectItem value="10">10 vezes</SelectItem>
                    <SelectItem value="30">30 vezes</SelectItem>
                  </SelectContent>
                </Select>
              </FloatingSelectWrapper>
            </div>
          </div>

          <div className="flex items-center justify-between px-6 py-4 border-t border-border">
            <Button variant="outline" className="gap-1.5 text-xs font-semibold uppercase">
              <Paperclip className="h-4 w-4" /> ANEXAR ARQUIVO
            </Button>
            <div className="flex gap-3">
              <Button variant="outline" className="uppercase font-semibold text-xs" onClick={() => setDialogOpen(false)}>CANCELAR</Button>
              <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white uppercase font-semibold text-xs px-6">ADICIONAR</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Schedules;
