import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import {
  Search, Plus, X, ClipboardList, CheckCircle2, Clock, AlertCircle,
  AlertTriangle, TrendingUp, LayoutGrid, List, CalendarDays,
  MessageSquare, Share2, Pencil, Trash2, User, Bell, Repeat, ChevronLeft, ChevronRight,
  Columns
} from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FloatingInput, FloatingTextarea, FloatingSelectWrapper } from "@/components/ui/floating-input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  reminder_minutes: number | null;
}

const Tasks = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const PAGE_SIZE = 20;
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list" | "calendar" | "kanban">("grid");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortBy, setSortBy] = useState("due_date");
  const [userFilter, setUserFilter] = useState("");
  const [page, setPage] = useState(1);

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

  const notifiedRef = useRef<Set<string>>(new Set());

  // Request browser notification permission on mount
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // TanStack Query: tasks
  const { data: tasksData = [] } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: async () => {
      const rows = await api.get<any[]>('/tasks');
      return rows.map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: t.status,
        due_date: t.due_date,
        assigned_to: t.assigned_to,
        assigned_name: t.assigned_profile?.full_name || null,
        creator_name: t.creator_profile?.full_name || null,
        created_at: t.created_at,
        reminder_minutes: t.reminder_minutes ?? null,
      }));
    },
    enabled: !!user,
  });
  const tasks = tasksData;

  // TanStack Query: users for assignee selector
  const { data: usersData = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['users-list'],
    queryFn: async () => {
      const rows = await api.get<any[]>('/users');
      return rows.map(u => ({ id: u.id, name: u.full_name || u.name || 'Sem nome' }));
    },
    enabled: !!user,
  });
  const users = usersData;

  // Task mutations
  const saveMutation = useMutation({
    mutationFn: (payload: { id?: string; data: Partial<Task> & { user_id?: string } }) =>
      payload.id
        ? api.patch(`/tasks/${payload.id}`, payload.data)
        : api.post('/tasks', { ...payload.data, status: 'pending' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/tasks/${id}`, { status }),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      const prev = queryClient.getQueryData<Task[]>(['tasks']);
      queryClient.setQueryData<Task[]>(['tasks'], old => old?.map(t => t.id === id ? { ...t, status: status as Task['status'] } : t));
      return { prev };
    },
    onError: (_err, _vars, ctx) => queryClient.setQueryData(['tasks'], ctx?.prev),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  // Check for task reminders every 60 seconds
  useEffect(() => {
    if (tasks.length === 0) return;
    const interval = setInterval(() => {
      const now = new Date();
      tasks.forEach((task) => {
        if (!task.reminder_minutes || !task.due_date || task.status === "done") return;
        if (notifiedRef.current.has(task.id)) return;
        const dueDate = new Date(task.due_date);
        const minutesUntilDue = (dueDate.getTime() - now.getTime()) / 60000;
        if (minutesUntilDue <= task.reminder_minutes && minutesUntilDue >= 0) {
          notifiedRef.current.add(task.id);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("Lembrete de Tarefa", {
              body: `${task.title} vence em breve!`,
              icon: "/favicon.ico",
            });
          }
        }
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [tasks]);

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

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, statusFilter, priorityFilter, sortBy, userFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

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
    setFormReminder(t.reminder_minutes ? String(t.reminder_minutes) : "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) { toast.error("Título é obrigatório"); return; }
    if (!user) return;
    const payload = {
      title: formTitle,
      description: formDesc || null,
      priority: formPriority,
      due_date: formDueDate || null,
      assigned_to: formAssignee || null,
      reminder_minutes: formReminder ? parseInt(formReminder) : null,
    };
    try {
      if (editingTask) {
        await saveMutation.mutateAsync({ id: editingTask.id, data: payload });
        toast.success("Tarefa atualizada!");
      } else {
        await saveMutation.mutateAsync({ data: { ...payload, user_id: user.id } });
        toast.success("Tarefa criada!");
      }
      setDialogOpen(false);
    } catch { toast.error("Erro ao salvar tarefa"); }
  };

  const toggleStatus = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    toggleStatusMutation.mutate({ id, status: task.status === "done" ? "pending" : "done" });
  };

  const confirmDelete = (t: Task) => {
    setTaskToDelete(t);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!taskToDelete) return;
    try {
      await deleteMutation.mutateAsync(taskToDelete.id);
      toast.success("Tarefa excluída");
      setDeleteOpen(false);
    } catch { toast.error("Erro ao excluir tarefa"); }
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
            {([
              ["grid", LayoutGrid, "Visualização em Cards"],
              ["list", List, "Visualização em Lista"],
              ["calendar", CalendarDays, "Visualização em Calendário"],
              ["kanban", Columns, "Visualização Kanban"],
            ] as const).map(([mode, Icon, title]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`p-2 ${viewMode === mode ? "bg-blue-600 text-white" : "bg-card text-muted-foreground hover:bg-muted"}`}
                title={title}
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
        {viewMode !== "calendar" && viewMode !== "kanban" && (
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
                {paginated.map(task => (
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
                {paginated.map(task => (
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

            {/* Pagination */}
            {filtered.length > PAGE_SIZE && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de {filtered.length} tarefas
                </p>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-foreground px-2">{page} / {totalPages}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === "kanban" && (() => {
          const today = new Date();

          const kanbanColumns = [
            {
              id: "todo",
              title: "A fazer",
              color: "bg-blue-500",
              filter: (t: Task) => t.status === "pending" && (!t.due_date || new Date(t.due_date) >= today),
            },
            {
              id: "overdue",
              title: "Atrasadas",
              color: "bg-red-500",
              filter: (t: Task) => t.status === "pending" && t.due_date != null && new Date(t.due_date) < today,
            },
            {
              id: "done",
              title: "Concluídas",
              color: "bg-green-500",
              filter: (t: Task) => t.status === "done",
            },
          ];

          const handleKanbanDragEnd = async (result: DropResult) => {
            const { destination, draggableId } = result;
            if (!destination) return;

            const destColId = destination.droppableId;
            if (destColId === "overdue") return; // overdue is automatic

            const task = tasks.find(t => t.id === draggableId);
            if (!task) return;

            let newStatus: "pending" | "done" | null = null;

            if (destColId === "done" && task.status !== "done") {
              newStatus = "done";
            } else if (destColId === "todo" && task.status === "done") {
              newStatus = "pending";
            }

            if (newStatus !== null) {
              toggleStatusMutation.mutate({ id: draggableId, status: newStatus });
            }
          };

          return (
            <DragDropContext onDragEnd={handleKanbanDragEnd}>
              <div className="flex gap-4 overflow-x-auto pb-4">
                {kanbanColumns.map((col) => {
                  const colTasks = filtered.filter(col.filter);
                  return (
                    <div key={col.id} className="min-w-[300px] max-w-[340px] flex-1 flex flex-col bg-card rounded-lg border border-border">
                      {/* Column header */}
                      <div className="relative px-3 py-3 flex items-center justify-between rounded-t-lg">
                        <div className={`absolute top-0 left-0 right-0 h-[3px] rounded-t-lg ${col.color}`} />
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${col.color}`} />
                          <span className="text-sm font-semibold text-foreground">{col.title}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-foreground font-semibold border border-border">
                            {colTasks.length}
                          </span>
                        </div>
                      </div>

                      {/* Droppable area */}
                      <Droppable droppableId={col.id}>
                        {(provided, snap) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`flex-1 p-2 space-y-2 min-h-[120px] transition-colors duration-150 ${
                              snap.isDraggingOver ? "bg-primary/5 ring-2 ring-inset ring-primary/20 rounded-b-lg" : ""
                            }`}
                          >
                            {colTasks.length === 0 && !snap.isDraggingOver && (
                              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground/40">
                                <CheckCircle2 className="h-8 w-8 mb-2" />
                                <p className="text-xs font-medium">Nenhuma tarefa</p>
                              </div>
                            )}
                            {colTasks.map((task, index) => {
                              const isOverdue = task.due_date && new Date(task.due_date) < today && task.status !== "done";
                              return (
                                <Draggable key={task.id} draggableId={task.id} index={index}>
                                  {(prov, snap2) => (
                                    <div
                                      ref={prov.innerRef}
                                      {...prov.draggableProps}
                                      {...prov.dragHandleProps}
                                      className={`rounded-lg border bg-background p-3 space-y-2 cursor-grab active:cursor-grabbing transition-shadow ${
                                        snap2.isDragging ? "shadow-xl ring-2 ring-primary/30 border-primary/50" : "border-border hover:border-blue-400/60 hover:shadow-md"
                                      }`}
                                    >
                                      <div className="flex items-start gap-2">
                                        <button
                                          onClick={() => toggleStatus(task.id)}
                                          className={`h-4 w-4 rounded-full border-2 shrink-0 mt-0.5 ${
                                            task.status === "done" ? "bg-green-500 border-green-500" : "border-muted-foreground/40"
                                          }`}
                                        />
                                        <div className="flex-1 min-w-0">
                                          <p className={`text-sm font-semibold truncate ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                            {task.title}
                                          </p>
                                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                            <Badge className={`${priorityColor(task.priority)} text-[10px]`}>
                                              {priorityLabel(task.priority)}
                                            </Badge>
                                            {task.due_date && (
                                              <span className={`text-[10px] flex items-center gap-0.5 ${isOverdue ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
                                                <Clock className="h-2.5 w-2.5" />
                                                {task.due_date}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      {task.assigned_name && (
                                        <div className="flex items-center gap-1.5">
                                          <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                                            {(task.assigned_name || "U").charAt(0).toUpperCase()}
                                          </div>
                                          <span className="text-[10px] text-muted-foreground truncate">{task.assigned_name}</span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })}
                            {provided.placeholder}

                            {/* Add task button for non-done columns */}
                            {col.id !== "overdue" && col.id !== "done" && (
                              <button
                                onClick={openNew}
                                className="w-full flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg px-2 py-1.5 border border-dashed border-border/60 transition-colors mt-1"
                              >
                                <Plus className="h-3.5 w-3.5" /> Nova Tarefa
                              </button>
                            )}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}
              </div>
            </DragDropContext>
          );
        })()}

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

            {/* Week view */}
            {calView === "week" && (() => {
              const weekStart = startOfWeek(calendarDate, { locale: ptBR });
              const weekEnd = endOfWeek(calendarDate, { locale: ptBR });
              const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
              return (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-7 border-b border-border">
                    {weekDays.map((day, i) => (
                      <div key={i} className={`text-center py-2 border-r last:border-r-0 border-border bg-muted/30 ${isToday(day) ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                          {format(day, "EEE", { locale: ptBR })}
                        </p>
                        <p className={`text-sm font-bold mt-0.5 ${isToday(day) ? "text-blue-600" : "text-foreground"}`}>
                          {format(day, "dd")}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 min-h-[300px]">
                    {weekDays.map((day, i) => {
                      const dayTasks = getTasksForDay(day);
                      return (
                        <div key={i} className={`border-r last:border-r-0 border-border p-1.5 space-y-1 ${isToday(day) ? "bg-blue-50/50 dark:bg-blue-950/10" : ""}`}>
                          {dayTasks.length === 0 && (
                            <p className="text-[10px] text-muted-foreground/40 text-center mt-4">—</p>
                          )}
                          {dayTasks.map(t => (
                            <div
                              key={t.id}
                              onClick={() => openEdit(t)}
                              className={`text-[10px] px-1.5 py-1 rounded truncate cursor-pointer text-white font-medium ${priorityColor(t.priority).replace("bg-", "bg-").replace("text-", "").replace("border-", "")} ${t.priority === "high" ? "bg-red-400" : t.priority === "medium" ? "bg-orange-400" : "bg-green-400"}`}
                              title={t.title}
                            >
                              {t.title}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Day view */}
            {calView === "day" && (() => {
              const dayTasks = getTasksForDay(calendarDate);
              return (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className={`px-4 py-3 border-b border-border ${isToday(calendarDate) ? "bg-blue-50 dark:bg-blue-950/30" : "bg-muted/30"}`}>
                    <p className={`text-base font-semibold capitalize ${isToday(calendarDate) ? "text-blue-600" : "text-foreground"}`}>
                      {format(calendarDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{dayTasks.length} tarefa(s) neste dia</p>
                  </div>
                  {dayTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <CheckCircle2 className="h-12 w-12 mb-3 opacity-20" />
                      <p className="text-sm font-medium text-foreground">Nenhuma tarefa para este dia</p>
                      <p className="text-xs mt-1">Clique em "+ Nova Tarefa" para adicionar</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {dayTasks.map(task => (
                        <div key={task.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <button
                              onClick={() => toggleStatus(task.id)}
                              className={`h-5 w-5 rounded-full border-2 shrink-0 ${task.status === "done" ? "bg-green-500 border-green-500" : "border-muted-foreground/40"}`}
                            />
                            <div className="min-w-0">
                              <p className={`text-sm font-medium truncate ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                                {task.title}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge className={`${priorityColor(task.priority)} text-[10px]`}>{priorityLabel(task.priority)}</Badge>
                                {task.assigned_name && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <User className="h-3 w-3" /> {task.assigned_name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 shrink-0" onClick={() => openEdit(task)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Agenda view */}
            {calView === "agenda" && (() => {
              const withDate = [...filtered]
                .filter(t => t.due_date)
                .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
              const withoutDate = filtered.filter(t => !t.due_date);

              const grouped: { label: string; tasks: Task[] }[] = [];
              const seen = new Set<string>();
              for (const t of withDate) {
                const dateKey = t.due_date!;
                if (!seen.has(dateKey)) {
                  seen.add(dateKey);
                  grouped.push({ label: format(new Date(dateKey + "T00:00:00"), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR }), tasks: [] });
                }
                grouped[grouped.length - 1].tasks.push(t);
              }
              if (withoutDate.length > 0) {
                grouped.push({ label: "Sem data", tasks: withoutDate });
              }

              if (grouped.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border border-border rounded-lg">
                    <CheckCircle2 className="h-12 w-12 mb-3 opacity-20" />
                    <p className="text-sm font-medium text-foreground">Nenhuma tarefa encontrada</p>
                  </div>
                );
              }

              return (
                <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                  {grouped.map((group, gi) => (
                    <div key={gi}>
                      <div className="px-4 py-2 bg-muted/40 flex items-center gap-2">
                        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground capitalize">{group.label}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{group.tasks.length} tarefa(s)</span>
                      </div>
                      {group.tasks.map(task => (
                        <div key={task.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 border-t border-border/50 transition-colors">
                          <Badge className={`${priorityColor(task.priority)} text-[10px] shrink-0`}>{priorityLabel(task.priority)}</Badge>
                          <p className={`text-sm flex-1 truncate ${task.status === "done" ? "line-through text-muted-foreground" : "text-foreground"}`}>
                            {task.title}
                          </p>
                          {task.assigned_name && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                              <User className="h-3 w-3" /> {task.assigned_name}
                            </span>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 shrink-0" onClick={() => openEdit(task)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })()}
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
