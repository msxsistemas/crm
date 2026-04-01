import { useState, useEffect, useMemo } from "react";
import {
  Search, Plus, X, ClipboardList, CheckCircle2, Clock, AlertCircle,
  AlertTriangle, TrendingUp, LayoutGrid, List, CalendarDays,
  MessageSquare, Share2, Pencil, Trash2, User, Bell, Repeat, ChevronLeft, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FloatingInput, FloatingTextarea, FloatingSelectWrapper } from "@/components/ui/floating-input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, addMonths, subMonths, isToday,
  isSameMonth, isSameDay, addWeeks, subWeeks, addDays, subDays
} from "date-fns";
import { ptBR } from "date-fns/locale";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: "low" | "medium" | "high";
  status: "pending" | "done";
  due_date: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  creator_name: string | null;
  created_at: string;
}

// We'll store tasks in-memory since there's no tasks table yet
// In production, this would use Supabase

const Tasks = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "calendar">("grid");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("due_date");
  const [userFilter, setUserFilter] = useState("");

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPriority, setFormPriority] = useState<"low" | "medium" | "high">("medium");
  const [formDueDate, setFormDueDate] = useState("");
  const [formAssignee, setFormAssignee] = useState("");
  const [formHoursEnabled, setFormHoursEnabled] = useState(false);
  const [formReminder, setFormReminder] = useState("");
  const [formRepeat, setFormRepeat] = useState(false);

  // Delete
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  // Calendar
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calView, setCalView] = useState<"month" | "week" | "day" | "agenda">("month");

  // Users for assignee
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    const fetchUsers = async () => {
      const { data } = await supabase.from("profiles").select("id, full_name");
      if (data) setUsers(data.map(u => ({ id: u.id, name: u.full_name || "Sem nome" })));
    };
    fetchUsers();
  }, []);

  const currentUserName = useMemo(() => {
    return users.find(u => u.id === user?.id)?.name || "Usuário";
  }, [users, user]);

  const filtered = useMemo(() => {
    let list = [...tasks];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(s));
    }
    if (statusFilter !== "all") list = list.filter(t => t.status === statusFilter);
    if (priorityFilter !== "all") list = list.filter(t => t.priority === priorityFilter);
    if (userFilter) list = list.filter(t => t.assigned_to === userFilter);

    list.sort((a, b) => {
      if (sortBy === "due_date") {
        return (a.due_date || "9999").localeCompare(b.due_date || "9999");
      }
      return a.created_at.localeCompare(b.created_at);
    });
    return list;
  }, [tasks, search, statusFilter, priorityFilter, sortBy, userFilter]);

  const stats = useMemo(() => ({
    total: tasks.length,
    done: tasks.filter(t => t.status === "done").length,
    pending: tasks.filter(t => t.status === "pending").length,
    high: tasks.filter(t => t.priority === "high").length,
    medium: tasks.filter(t => t.priority === "medium").length,
    low: tasks.filter(t => t.priority === "low").length,
  }), [tasks]);

  const resetForm = () => {
    setFormTitle("");
    setFormDesc("");
    setFormPriority("medium");
    setFormDueDate("");
    setFormAssignee(user?.id || "");
    setFormHoursEnabled(false);
    setFormReminder("");
    setFormRepeat(false);
    setEditingTask(null);
  };

  const openNew = () => {
    resetForm();
    setFormAssignee(user?.id || "");
    setDialogOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditingTask(t);
    setFormTitle(t.title);
    setFormDesc(t.description || "");
    setFormPriority(t.priority);
    setFormDueDate(t.due_date || "");
    setFormAssignee(t.assigned_to || "");
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!formTitle.trim()) {
      toast.error("Título é obrigatório");
      return;
    }
    const assigneeName = users.find(u => u.id === formAssignee)?.name || "";

    if (editingTask) {
      setTasks(prev => prev.map(t => t.id === editingTask.id ? {
        ...t,
        title: formTitle,
        description: formDesc || null,
        priority: formPriority,
        due_date: formDueDate || null,
        assigned_to: formAssignee || null,
        assigned_name: assigneeName || null,
      } : t));
      toast.success("Tarefa atualizada!");
    } else {
      const newTask: Task = {
        id: crypto.randomUUID(),
        title: formTitle,
        description: formDesc || null,
        priority: formPriority,
        status: "pending",
        due_date: formDueDate || null,
        assigned_to: formAssignee || null,
        assigned_name: assigneeName || null,
        creator_name: currentUserName,
        created_at: new Date().toISOString(),
      };
      setTasks(prev => [...prev, newTask]);
      toast.success("Tarefa criada!");
    }
    setDialogOpen(false);
  };

  const toggleStatus = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: t.status === "done" ? "pending" : "done" } : t));
  };

  const confirmDelete = (t: Task) => {
    setTaskToDelete(t);
    setDeleteOpen(true);
  };

  const handleDelete = () => {
    if (!taskToDelete) return;
    setTasks(prev => prev.filter(t => t.id !== taskToDelete.id));
    toast.success("Tarefa excluída");
    setDeleteOpen(false);
  };

  const priorityLabel = (p: string) => p === "high" ? "Alta" : p === "medium" ? "Média" : "Baixa";
  const priorityColor = (p: string) => p === "high" ? "bg-red-100 text-red-700 border-red-200" : p === "medium" ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-green-100 text-green-700 border-green-200";

  const statCards = [
    { label: "Total de Tarefas", value: stats.total, icon: ClipboardList, iconBg: "bg-blue-100", iconColor: "text-blue-600" },
    { label: "Concluídas", value: stats.done, icon: CheckCircle2, iconBg: "bg-green-100", iconColor: "text-green-600" },
    { label: "Pendentes", value: stats.pending, icon: Clock, iconBg: "bg-orange-100", iconColor: "text-orange-600" },
    { label: "Alta Prioridade", value: stats.high, icon: AlertCircle, iconBg: "bg-red-100", iconColor: "text-red-600" },
    { label: "Média Prioridade", value: stats.medium, icon: AlertTriangle, iconBg: "bg-orange-100", iconColor: "text-orange-600" },
    { label: "Baixa Prioridade", value: stats.low, icon: AlertTriangle, iconBg: "bg-green-100", iconColor: "text-green-600" },
  ];

  // Calendar helpers
  const monthStart = startOfMonth(calendarDate);
  const monthEnd = endOfMonth(calendarDate);
  const calStart = startOfWeek(monthStart, { locale: ptBR });
  const calEnd = endOfWeek(monthEnd, { locale: ptBR });
  const calDays = eachDayOfInterval({ start: calStart, end: calEnd });

  const navigateCal = (dir: "prev" | "next" | "today") => {
    if (dir === "today") { setCalendarDate(new Date()); return; }
    if (calView === "month") setCalendarDate(dir === "prev" ? subMonths(calendarDate, 1) : addMonths(calendarDate, 1));
    else if (calView === "week") setCalendarDate(dir === "prev" ? subWeeks(calendarDate, 1) : addWeeks(calendarDate, 1));
    else setCalendarDate(dir === "prev" ? subDays(calendarDate, 1) : addDays(calendarDate, 1));
  };

  const getTasksForDay = (day: Date) => filtered.filter(t => t.due_date && isSameDay(new Date(t.due_date), day));

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-blue-600">Tarefas</h1>
        <div className="flex items-center gap-2">
          <div className="relative w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar tarefas..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 rounded-md" />
          </div>
          <div className="flex border border-border rounded-md overflow-hidden">
            {([["grid", LayoutGrid], ["list", List], ["calendar", CalendarDays]] as const).map(([mode, Icon]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`p-2 ${viewMode === mode ? "bg-blue-600 text-white" : "bg-card text-muted-foreground hover:bg-muted"}`}
                title={mode === "grid" ? "Visualização em Cards" : mode === "list" ? "Visualização em Lista" : "Visualização em Calendário"}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
          <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white uppercase text-xs font-semibold gap-1.5">
            <Plus className="h-4 w-4" /> NOVA TAREFA
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {/* Stats */}
        {viewMode !== "calendar" && (
          <div className="grid grid-cols-6 gap-3 p-4 rounded-lg border border-border bg-card">
            {statCards.map((card, i) => (
              <div key={i} className="space-y-1">
                <div className={`h-8 w-8 rounded-full ${card.iconBg} flex items-center justify-center`}>
                  <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                </div>
                <p className="text-2xl font-bold text-foreground">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="grid grid-cols-4 gap-4 p-4 rounded-lg border border-border bg-card">
          <FloatingSelectWrapper label="Status" hasValue={statusFilter !== "all"}>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="done">Concluída</SelectItem>
              </SelectContent>
            </Select>
          </FloatingSelectWrapper>
          <FloatingSelectWrapper label="Prioridade" hasValue={priorityFilter !== "all"}>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </FloatingSelectWrapper>
          <FloatingSelectWrapper label="Ordenar por" hasValue={true}>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="due_date">Vencimento</SelectItem>
                <SelectItem value="created_at">Criação</SelectItem>
              </SelectContent>
            </Select>
          </FloatingSelectWrapper>
          <FloatingSelectWrapper label="Usuário" hasValue={!!userFilter}>
            <Select value={userFilter || "all"} onValueChange={(v) => setUserFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder="Usuário" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FloatingSelectWrapper>
        </div>

        {/* Content */}
        {viewMode === "grid" && (
          <div>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <CheckCircle2 className="h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg font-semibold text-foreground">Nenhuma tarefa encontrada</p>
                <p className="text-sm">Clique no botão acima para criar sua primeira tarefa</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(task => (
                  <div key={task.id} className="rounded-lg border-l-4 border-orange-400 bg-orange-50/50 p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        <TrendingUp className="h-5 w-5 text-orange-500 mt-0.5" />
                        <div>
                          <p className="font-semibold text-foreground">{task.title}</p>
                          <Badge className={`${priorityColor(task.priority)} text-[10px] mt-1`}>{priorityLabel(task.priority)}</Badge>
                        </div>
                      </div>
                      <button onClick={() => toggleStatus(task.id)} className={`h-5 w-5 rounded-full border-2 ${task.status === "done" ? "bg-green-500 border-green-500" : "border-muted-foreground/40"}`} />
                    </div>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p className="flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Responsável: <strong className="text-foreground">{task.assigned_name || "-"}</strong></p>
                      <p className="flex items-center gap-1.5">
                        <Avatar className="h-4 w-4"><AvatarFallback className="bg-blue-500 text-white text-[8px]">{(task.creator_name || "U").charAt(0)}</AvatarFallback></Avatar>
                        Criado por: <strong className="text-foreground">{task.creator_name || "-"}</strong>
                      </p>
                    </div>
                    <div className="flex items-center gap-1 pt-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"><MessageSquare className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"><Share2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" onClick={() => openEdit(task)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => confirmDelete(task)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {viewMode === "list" && (
          <div>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <CheckCircle2 className="h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg font-semibold text-foreground">Nenhuma tarefa encontrada</p>
                <p className="text-sm">Clique no botão acima para criar sua primeira tarefa</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(task => (
                  <div key={task.id} className="rounded-lg border-l-4 border-orange-400 bg-orange-50/50 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="h-5 w-5 text-orange-500" />
                      <div>
                        <p className="font-semibold text-foreground">{task.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className={`${task.status === "pending" ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-green-100 text-green-700 border-green-200"} text-[10px]`}>
                            {task.status === "pending" ? "Pendente" : "Concluída"}
                          </Badge>
                          <Badge className={`${priorityColor(task.priority)} text-[10px]`}>{priorityLabel(task.priority)}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><User className="h-3 w-3" /> {task.assigned_name || "-"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><MessageSquare className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground"><Share2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => openEdit(task)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => confirmDelete(task)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {viewMode === "calendar" && (
          <div className="space-y-3">
            {/* Calendar toolbar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => navigateCal("today")}>Hoje</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateCal("prev")}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateCal("next")}><ChevronRight className="h-4 w-4" /></Button>
              </div>
              <h2 className="text-lg font-semibold text-foreground capitalize">
                {format(calendarDate, calView === "day" ? "dd MMMM yyyy" : "MMMM yyyy", { locale: ptBR })}
              </h2>
              <div className="flex border border-border rounded-md overflow-hidden">
                {(["month", "week", "day", "agenda"] as const).map(v => (
                  <button
                    key={v}
                    onClick={() => setCalView(v)}
                    className={`px-3 py-1 text-xs font-medium ${calView === v ? "bg-blue-600 text-white" : "bg-card text-muted-foreground hover:bg-muted"}`}
                  >
                    {v === "month" ? "Mês" : v === "week" ? "Semana" : v === "day" ? "Dia" : "Agenda"}
                  </button>
                ))}
              </div>
            </div>

            {/* Month view */}
            {calView === "month" && (
              <div className="border border-border rounded-lg overflow-hidden">
                <div className="grid grid-cols-7">
                  {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map(d => (
                    <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2 border-b border-border bg-muted/30">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {calDays.map((day, i) => {
                    const dayTasks = getTasksForDay(day);
                    const inMonth = isSameMonth(day, calendarDate);
                    return (
                      <div key={i} className={`min-h-[80px] border-b border-r border-border p-1 ${!inMonth ? "bg-muted/20" : ""}`}>
                        <p className={`text-xs text-right pr-1 ${isToday(day) ? "text-blue-600 font-bold" : !inMonth ? "text-muted-foreground/50" : "text-muted-foreground"} ${[0, 6].includes(day.getDay()) && inMonth ? "text-red-500" : ""}`}>
                          {format(day, "dd")}
                        </p>
                        {dayTasks.map(t => (
                          <div key={t.id} className="bg-orange-400 text-white text-[10px] px-1 py-0.5 rounded truncate mt-0.5 cursor-pointer" onClick={() => openEdit(t)}>
                            {t.title}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {calView !== "month" && (
              <div className="border border-border rounded-lg p-6 text-center text-muted-foreground">
                Visualização de {calView === "week" ? "Semana" : calView === "day" ? "Dia" : "Agenda"} — em breve
              </div>
            )}
          </div>
        )}
      </div>

      {/* New/Edit Task Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 px-6 py-4 flex items-center gap-3">
            <ClipboardList className="h-5 w-5 text-white" />
            <h2 className="text-lg font-bold text-white flex-1">{editingTask ? "Editar Tarefa" : "Nova Tarefa"}</h2>
            <button onClick={() => setDialogOpen(false)} className="text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
            <FloatingInput label="Título da Tarefa *" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} />
            <FloatingTextarea label="Descrição" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={3} />

            {/* Priority */}
            <div>
              <p className="text-sm font-medium text-foreground flex items-center gap-1.5 mb-2">
                <AlertCircle className="h-4 w-4 text-red-500" /> Prioridade
              </p>
              <div className="flex gap-2">
                {(["low", "medium", "high"] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setFormPriority(p)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      formPriority === p
                        ? p === "low" ? "bg-green-500 text-white border-green-500"
                        : p === "medium" ? "bg-orange-500 text-white border-orange-500"
                        : "bg-red-500 text-white border-red-500"
                        : "border-border text-foreground hover:bg-muted"
                    }`}
                  >
                    {priorityLabel(p)}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FloatingInput label="Data de Vencimento" type="date" value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} />
              <FloatingSelectWrapper label="Atribuir para" hasValue={!!formAssignee}>
                <Select value={formAssignee} onValueChange={setFormAssignee}>
                  <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                  <SelectContent>
                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FloatingSelectWrapper>
            </div>

            {/* Horários */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Horários
              </p>
              <Switch checked={formHoursEnabled} onCheckedChange={setFormHoursEnabled} />
            </div>

            {/* Lembrete */}
            <div>
              <p className="text-sm font-medium text-foreground flex items-center gap-1.5 mb-2">
                <Bell className="h-4 w-4" /> Lembrete
              </p>
              <FloatingSelectWrapper label="Notificar antes (minutos)" hasValue={!!formReminder}>
                <Select value={formReminder} onValueChange={setFormReminder}>
                  <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 minutos</SelectItem>
                    <SelectItem value="10">10 minutos</SelectItem>
                    <SelectItem value="15">15 minutos</SelectItem>
                    <SelectItem value="30">30 minutos</SelectItem>
                    <SelectItem value="60">1 hora</SelectItem>
                  </SelectContent>
                </Select>
              </FloatingSelectWrapper>
              <p className="text-xs text-muted-foreground mt-1">Você receberá uma notificação antes da tarefa</p>
            </div>

            {/* Repetir */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Repeat className="h-4 w-4" /> Repetir
              </p>
              <Switch checked={formRepeat} onCheckedChange={setFormRepeat} />
            </div>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
            <Button variant="outline" className="uppercase font-semibold text-xs" onClick={() => setDialogOpen(false)}>CANCELAR</Button>
            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white uppercase font-semibold text-xs px-6">
              {editingTask ? "SALVAR" : "CRIAR TAREFA"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-xl p-0 gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Excluir tarefa</h3>
              <p className="text-xs text-white/80">Esta ação não pode ser desfeita</p>
            </div>
            <button onClick={() => setDeleteOpen(false)} className="text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-foreground">A tarefa <strong>{taskToDelete?.title}</strong> será excluída permanentemente.</p>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-4">
            <Button variant="outline" className="uppercase font-semibold text-xs" onClick={() => setDeleteOpen(false)}>CANCELAR</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white uppercase font-semibold text-xs px-6" onClick={handleDelete}>EXCLUIR</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Tasks;
