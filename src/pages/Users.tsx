import { useState, useEffect } from "react";
import {
  Search, Users as UsersIcon,
  Pencil, Trash2, LayoutGrid, List, Mail, Settings2, ShieldCheck, AlertTriangle, RefreshCw,
  KeyRound
} from "lucide-react";
import AgentStatus from "@/components/AgentStatus";
import { isAgentInShift, type AgentSchedule } from "@/pages/AgentSchedules";

const MODULES = [
  { key: "inbox", label: "Caixa de Entrada" },
  { key: "contacts", label: "Contatos" },
  { key: "tasks", label: "Tarefas" },
  { key: "campaigns", label: "Campanhas" },
  { key: "chatbot", label: "Chatbot" },
  { key: "reports", label: "Relatórios" },
  { key: "schedules", label: "Agendamentos" },
  { key: "funnel", label: "Funil de Vendas" },
  { key: "users", label: "Usuários" },
  { key: "settings", label: "Configurações" },
];

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import UserFormDialog from "@/components/users/UserFormDialog";
import { AgentPermissions, DEFAULT_PERMISSIONS } from "@/hooks/usePermissions";

// ─── Page permission definitions ───
const PAGE_PERMISSIONS: { key: keyof AgentPermissions["pages"]; label: string; description: string }[] = [
  { key: "inbox", label: "Caixa de Entrada", description: "Visualizar e responder conversas" },
  { key: "contacts", label: "Contatos", description: "Gerenciar contatos e segmentos" },
  { key: "kanban", label: "Kanban", description: "Visualizar e mover cards no Kanban" },
  { key: "campaigns", label: "Campanhas", description: "Criar e enviar campanhas em massa" },
  { key: "reports", label: "Relatórios", description: "Acessar relatórios e avaliações" },
  { key: "financial", label: "Financeiro", description: "Acessar propostas e metas de vendas" },
  { key: "supervisor", label: "Supervisor", description: "Acessar central do supervisor" },
  { key: "settings", label: "Configurações", description: "Acessar configurações do sistema" },
  { key: "bots", label: "Bots & Automação", description: "Gerenciar chatbots e fluxos" },
];

const ACTION_PERMISSIONS: { key: keyof AgentPermissions["actions"]; label: string; description: string }[] = [
  { key: "export_contacts", label: "Exportar Contatos", description: "Exportar lista de contatos como CSV" },
  { key: "delete_contacts", label: "Excluir Contatos", description: "Excluir contatos do sistema" },
  { key: "send_campaigns", label: "Enviar Campanhas", description: "Disparar campanhas para contatos" },
  { key: "view_all_conversations", label: "Ver Todas as Conversas", description: "Se desativado, vê apenas as conversas atribuídas a si" },
  { key: "transfer_conversations", label: "Transferir Conversas", description: "Transferir conversas para outros agentes" },
  { key: "close_conversations", label: "Encerrar Conversas", description: "Encerrar conversas abertas" },
  { key: "manage_tags", label: "Gerenciar Tags", description: "Criar, editar e excluir tags" },
];

const PRESETS: { label: string; value: AgentPermissions }[] = [
  {
    label: "Agente Básico",
    value: {
      pages: { inbox: true, contacts: true, campaigns: false, reports: false, financial: false, settings: false, supervisor: false, kanban: true, bots: false },
      actions: { export_contacts: false, delete_contacts: false, send_campaigns: false, view_all_conversations: false, transfer_conversations: true, close_conversations: true, manage_tags: false },
    },
  },
  {
    label: "Agente Completo",
    value: {
      pages: { inbox: true, contacts: true, campaigns: true, reports: true, financial: false, settings: false, supervisor: false, kanban: true, bots: false },
      actions: { export_contacts: true, delete_contacts: false, send_campaigns: true, view_all_conversations: true, transfer_conversations: true, close_conversations: true, manage_tags: true },
    },
  },
  {
    label: "Supervisor",
    value: {
      pages: { inbox: true, contacts: true, campaigns: true, reports: true, financial: true, settings: false, supervisor: true, kanban: true, bots: true },
      actions: { export_contacts: true, delete_contacts: false, send_campaigns: true, view_all_conversations: true, transfer_conversations: true, close_conversations: true, manage_tags: true },
    },
  },
];

interface UserProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  role: string;
  status: string;
  permissions: Record<string, boolean>;
  granularPermissions: AgentPermissions;
}

const getInitials = (name: string | null) => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const UsersPage = () => {
  const { user, session } = useAuth();
  const { isAdmin } = useUserRole();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editUserEmail, setEditUserEmail] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUser, setDeleteUser] = useState<UserProfile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [closeTicketsOpen, setCloseTicketsOpen] = useState(false);
  const [closeTicketsUser, setCloseTicketsUser] = useState<UserProfile | null>(null);
  const [closingTickets, setClosingTickets] = useState(false);

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferUser, setTransferUser] = useState<UserProfile | null>(null);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [transferring, setTransferring] = useState(false);

  const [agentSchedules, setAgentSchedules] = useState<Record<string, AgentSchedule>>({});

  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<UserProfile | null>(null);
  const [editingPerms, setEditingPerms] = useState<AgentPermissions>(DEFAULT_PERMISSIONS);
  const [savingPerms, setSavingPerms] = useState(false);
  const [presetLabel, setPresetLabel] = useState<string>("Personalizado");

  const openPermissions = (u: UserProfile) => {
    setPermissionsUser(u);
    setEditingPerms(u.granularPermissions);
    const matchedPreset = PRESETS.find(p =>
      JSON.stringify(p.value) === JSON.stringify(u.granularPermissions)
    );
    setPresetLabel(matchedPreset?.label ?? "Personalizado");
    setPermissionsOpen(true);
  };

  const applyPreset = (preset: typeof PRESETS[0]) => {
    setEditingPerms(preset.value);
    setPresetLabel(preset.label);
  };

  const togglePage = (key: keyof AgentPermissions["pages"]) => {
    setEditingPerms(prev => ({
      ...prev,
      pages: { ...prev.pages, [key]: !prev.pages[key] },
    }));
    setPresetLabel("Personalizado");
  };

  const toggleAction = (key: keyof AgentPermissions["actions"]) => {
    setEditingPerms(prev => ({
      ...prev,
      actions: { ...prev.actions, [key]: !prev.actions[key] },
    }));
    setPresetLabel("Personalizado");
  };

  const handleSavePermissions = async () => {
    if (!permissionsUser) return;
    setSavingPerms(true);
    const { error } = await supabase
      .from("profiles")
      .update({ permissions: editingPerms } as any)
      .eq("id", permissionsUser.id);
    setSavingPerms(false);
    if (error) {
      toast.error("Erro ao salvar permissões");
    } else {
      toast.success(`Permissões de ${permissionsUser.full_name || "usuário"} atualizadas!`);
      setPermissionsOpen(false);
      setUsers(prev => prev.map(u =>
        u.id === permissionsUser.id
          ? { ...u, granularPermissions: editingPerms }
          : u
      ));
    }
  };

  useEffect(() => { loadData(); }, [session]);

  // Realtime: atualiza status quando perfil muda
  useEffect(() => {
    const channel = supabase
      .channel("users-profiles-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const updated = payload.new as any;
          setUsers(prev => prev.map(u =>
            u.id === updated.id
              ? { ...u, full_name: updated.full_name ?? u.full_name, status: updated.status ?? u.status, avatar_url: updated.avatar_url ?? u.avatar_url }
              : u
          ));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadData = async () => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);

    try {
      const [p, r, emailRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url, status, email, permissions"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.functions.invoke("manage-users", {
          method: "GET",
          headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
        }),
      ]);

      if (p.error) throw new Error(p.error.message);

      const profiles = (p.data || []) as any[];
      const userRoles = (r.data || []) as { user_id: string; role: string }[];
      const emailMap = new Map<string, string>();

      if (emailRes.data?.users) {
        for (const u of emailRes.data.users) {
          emailMap.set(u.id, u.email);
        }
      }

      // Load agent schedules
      const schedRes = await supabase.from("agent_schedules" as any).select("*");
      if (schedRes.data) {
        const map: Record<string, AgentSchedule> = {};
        for (const s of schedRes.data as AgentSchedule[]) {
          map[s.agent_id] = s;
        }
        setAgentSchedules(map);
      }

      setUsers(profiles.map((prof) => {
        const rawPerms = prof.permissions || {};
        // Legacy flat permissions (boolean per module key)
        const legacyPerms: Record<string, boolean> =
          (rawPerms && Object.keys(rawPerms).length > 0 && typeof Object.values(rawPerms)[0] === "boolean")
            ? rawPerms as Record<string, boolean>
            : Object.fromEntries(MODULES.map(m => [m.key, true]));

        // Granular permissions (pages/actions structure)
        const granular: AgentPermissions =
          (rawPerms && "pages" in rawPerms && "actions" in rawPerms)
            ? rawPerms as unknown as AgentPermissions
            : DEFAULT_PERMISSIONS;

        return {
          id: prof.id,
          full_name: prof.full_name,
          avatar_url: prof.avatar_url,
          email: emailMap.get(prof.id) || prof.email || null,
          role: userRoles.find(ur => ur.user_id === prof.id)?.role || "user",
          status: prof.status || "offline",
          permissions: legacyPerms,
          granularPermissions: granular,
        };
      }));
    } catch (err: any) {
      console.error("Error loading users:", err);
      setLoadError(err.message || "Erro ao carregar usuários. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = users.filter(u =>
    (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const openAdd = () => { setEditUserId(null); setEditUserEmail(null); setFormOpen(true); };
  const openEdit = (u: UserProfile) => { setEditUserId(u.id); setEditUserEmail(u.email); setFormOpen(true); };
  const openDelete = (u: UserProfile) => { setDeleteUser(u); setDeleteOpen(true); };
  const openCloseTickets = (u: UserProfile) => { setCloseTicketsUser(u); setCloseTicketsOpen(true); };
  const openTransfer = (u: UserProfile) => { setTransferUser(u); setTransferTargetId(""); setTransferOpen(true); };

  const handleTransferTickets = async () => {
    if (!transferUser || !transferTargetId || !session) return;
    setTransferring(true);
    try {
      const { error } = await supabase
        .from("conversations")
        .update({ assigned_to: transferTargetId } as any)
        .eq("assigned_to", transferUser.id)
        .in("status", ["open", "attending"]);
      if (error) throw error;
      toast.success(`Tickets de ${transferUser.full_name || "usuário"} transferidos com sucesso!`);
      setTransferOpen(false);
      setTransferUser(null);
      setTransferTargetId("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao transferir tickets");
    } finally {
      setTransferring(false);
    }
  };

  const handleCloseTickets = async () => {
    if (!closeTicketsUser || !session) return;
    setClosingTickets(true);
    try {
      const { error } = await supabase
        .from("conversations")
        .update({ status: "closed" } as any)
        .eq("assigned_to", closeTicketsUser.id)
        .in("status", ["open", "attending"]);
      if (error) throw error;
      toast.success(`Tickets de ${closeTicketsUser.full_name || "usuário"} encerrados com sucesso!`);
      setCloseTicketsOpen(false);
      setCloseTicketsUser(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao encerrar tickets");
    } finally {
      setClosingTickets(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser || !session) return;
    setDeleting(true);
    try {
      const { error } = await supabase.functions.invoke("manage-users", {
        method: "POST",
        body: { action: "delete", userId: deleteUser.id },
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
      });
      if (error) throw error;
      toast.success("Usuário excluído com sucesso!");
      setDeleteOpen(false);
      setDeleteUser(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir usuário");
    } finally {
      setDeleting(false);
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: string) => {
    if (!session) return;
    try {
      const { error } = await supabase.functions.invoke("manage-users", {
        method: "POST",
        body: { action: "set-role", userId: targetUserId, role: newRole },
        headers: { Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}` },
      });
      if (error) throw error;
      toast.success("Role atualizada com sucesso!");
      setUsers(prev => prev.map(u => u.id === targetUserId ? { ...u, role: newRole } : u));
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar role");
    }
  };

  const getRoleLabel = (role: string) => {
    if (role === "admin") return "Administrador";
    if (role === "reseller") return "Revendedor";
    return "Usuário";
  };

  const getRoleColor = (role: string) => {
    if (role === "admin") return "text-red-500";
    if (role === "reseller") return "text-amber-600";
    return "text-green-600";
  };

  const getStatusBadges = (status: string) => {
    const normalizedStatus = (status || "").toLowerCase();

    if (normalizedStatus === "ausente" || normalizedStatus === "away") {
      return (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-success text-success-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success-foreground" /> Online
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-warning text-warning-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-warning-foreground" /> Ausente
          </span>
        </div>
      );
    }

    if (normalizedStatus === "online") {
      return (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-success text-success-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success-foreground" /> Online
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> Offline
      </span>
    );
  };

  const RoleSelector = ({ u }: { u: UserProfile }) => {
    if (!isAdmin) {
      return (
        <div className="flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
          <span className={cn("text-xs font-semibold", getRoleColor(u.role))}>{getRoleLabel(u.role)}</span>
        </div>
      );
    }
    return (
      <Select value={u.role} onValueChange={(v) => handleRoleChange(u.id, v)}>
        <SelectTrigger className="h-7 w-auto gap-1 border-none bg-transparent px-1 text-xs font-semibold shadow-none focus:ring-0">
          <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
          <span className={cn(getRoleColor(u.role))}>{getRoleLabel(u.role)}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Administrador</SelectItem>
          <SelectItem value="reseller">Revendedor</SelectItem>
          <SelectItem value="user">Usuário</SelectItem>
        </SelectContent>
      </Select>
    );
  };

  const PermissionsBadges = ({ u }: { u: UserProfile }) => {
    const disabled = MODULES.filter(m => !(u.permissions[m.key] ?? true));
    if (disabled.length === 0) return null;
    return (
      <div className="mt-2 flex flex-wrap gap-1">
        {MODULES.map(m => {
          const enabled = u.permissions[m.key] ?? true;
          return (
            <span
              key={m.key}
              title={`${m.label}: ${enabled ? "Habilitado" : "Desabilitado"}`}
              className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600 line-through opacity-70"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-green-500" : "bg-red-400"}`} />
              {m.label}
            </span>
          );
        })}
      </div>
    );
  };

  const UserCardGrid = ({ u }: { u: UserProfile }) => (
    <Card className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-5 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="relative shrink-0">
            <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-base">
              {getInitials(u.full_name)}
            </div>
            <span className="absolute bottom-0 right-0">
              <AgentStatus
                status={u.status === "online" ? "online" : u.status === "ausente" || u.status === "away" ? "away" : "offline"}
                size="sm"
                className="ring-2 ring-card rounded-full"
              />
            </span>
          </div>
          <p className="font-bold text-foreground text-sm">{u.full_name || "Sem nome"}</p>
        </div>
        <div className="mb-1"><RoleSelector u={u} /></div>
        <div className="mb-1 flex items-center gap-1.5 flex-wrap">
          {getStatusBadges(u.status)}
          {agentSchedules[u.id] && (
            isAgentInShift(agentSchedules[u.id])
              ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />Em turno</span>
              : <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"><span className="h-1.5 w-1.5 rounded-full bg-gray-400" />Fora do turno</span>
          )}
        </div>
        <div className="mb-3"><PermissionsBadges u={u} /></div>
        <div className="space-y-0.5 text-xs text-muted-foreground mb-4">
          <p className="flex items-center gap-1.5"><Settings2 className="h-3 w-3" /> ID: {u.id.substring(0, 8)}</p>
          <p className="flex items-center gap-1.5"><Mail className="h-3 w-3" /> {u.email || "—"}</p>
        </div>
        <div className="space-y-2 mb-3">
          <Button variant="outline" size="sm" className="w-full gap-2 text-xs font-semibold uppercase h-9 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => openCloseTickets(u)}>
            ENCERRAR TICKETS
          </Button>
          <Button variant="outline" size="sm" className="w-full gap-2 text-xs font-semibold uppercase h-9 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => openTransfer(u)}>
            TRANSFERIR TICKETS
          </Button>
        </div>
        <div className="flex items-center justify-center gap-3">
          {isAdmin && (
            <button className="text-muted-foreground hover:text-blue-600 transition-colors" onClick={() => openPermissions(u)} title="Permissões">
              <KeyRound className="h-4 w-4" />
            </button>
          )}
          <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => openEdit(u)}>
            <Pencil className="h-4 w-4" />
          </button>
          <button className="text-muted-foreground hover:text-destructive transition-colors" onClick={() => openDelete(u)}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );

  const UserCardList = ({ u }: { u: UserProfile }) => (
    <Card className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-4 p-4">
        <div className="relative shrink-0">
          <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-base">
            {getInitials(u.full_name)}
          </div>
          <span className="absolute bottom-0 right-0">
            <AgentStatus
              status={u.status === "online" ? "online" : u.status === "ausente" || u.status === "away" ? "away" : "offline"}
              size="sm"
              className="ring-2 ring-card rounded-full"
            />
          </span>
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="font-bold text-foreground text-sm">{u.full_name || "Sem nome"}</p>
          <RoleSelector u={u} />
          <div className="flex items-center gap-1.5 flex-wrap">
            {getStatusBadges(u.status)}
            {agentSchedules[u.id] && (
              isAgentInShift(agentSchedules[u.id])
                ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700"><span className="h-1.5 w-1.5 rounded-full bg-green-500" />Em turno</span>
                : <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500"><span className="h-1.5 w-1.5 rounded-full bg-gray-400" />Fora do turno</span>
            )}
          </div>
          <PermissionsBadges u={u} />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Settings2 className="h-3 w-3" /> ID: {u.id.substring(0, 8)}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3 w-3" /> {u.email || "—"}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs font-semibold h-8 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => openCloseTickets(u)}>
            Encerrar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs font-semibold h-8 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => openTransfer(u)}>
            Transferir
          </Button>
          {isAdmin && (
            <button className="text-muted-foreground hover:text-blue-600 transition-colors" onClick={() => openPermissions(u)} title="Permissões">
              <KeyRound className="h-4 w-4" />
            </button>
          )}
          <button className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => openEdit(u)}>
            <Pencil className="h-4 w-4" />
          </button>
          <button className="text-muted-foreground hover:text-destructive transition-colors" onClick={() => openDelete(u)}>
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
          <h1 className="text-xl font-bold text-blue-600">Equipe</h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Pesquisar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-52" />
            </div>
            <div className="flex items-center border border-border rounded-md overflow-hidden">
              <button className={cn("p-2 transition-colors", viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => setViewMode("grid")}>
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button className={cn("p-2 transition-colors", viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")} onClick={() => setViewMode("list")}>
                <List className="h-4 w-4" />
              </button>
            </div>
            <Button variant="action" className="gap-2 uppercase text-xs px-5" onClick={openAdd}>
              ADICIONAR USUÁRIO
            </Button>
          </div>
        </div>

        <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <AlertTriangle className="h-12 w-12 text-amber-500 opacity-60" />
            <p className="font-medium text-foreground">Erro ao carregar usuários</p>
            <p className="text-sm text-center max-w-md">{loadError}</p>
            <Button variant="outline" size="sm" className="gap-2 mt-2" onClick={loadData}>
              <RefreshCw className="h-4 w-4" /> Tentar novamente
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <UsersIcon className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p>Nenhum usuário encontrado</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(u => <UserCardGrid key={u.id} u={u} />)}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(u => <UserCardList key={u.id} u={u} />)}
          </div>
        )}
        </div>
      </div>

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editUserId={editUserId}
        editUserEmail={editUserEmail}
        onSaved={loadData}
      />

      {/* Permissions Dialog */}
      <Dialog open={permissionsOpen} onOpenChange={setPermissionsOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-blue-600" />
              Permissões de {permissionsUser?.full_name || "usuário"}
            </DialogTitle>
          </DialogHeader>

          {/* Presets */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Presets rápidos</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p)}
                  className={cn(
                    "text-xs px-3 py-1.5 rounded-full border font-medium transition-colors",
                    presetLabel === p.label
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-border text-foreground hover:bg-muted"
                  )}
                >
                  {p.label}
                </button>
              ))}
              <span className={cn(
                "text-xs px-3 py-1.5 rounded-full border font-medium",
                presetLabel === "Personalizado"
                  ? "bg-muted text-foreground border-border"
                  : "border-transparent text-muted-foreground"
              )}>
                Personalizado
              </span>
            </div>
          </div>

          {/* Pages */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Páginas</p>
            <div className="space-y-2">
              {PAGE_PERMISSIONS.map(perm => (
                <div key={perm.key} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                  <div>
                    <p className="text-sm font-medium text-foreground">{perm.label}</p>
                    <p className="text-xs text-muted-foreground">{perm.description}</p>
                  </div>
                  <Switch
                    checked={editingPerms.pages[perm.key]}
                    onCheckedChange={() => togglePage(perm.key)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Ações</p>
            <div className="space-y-2">
              {ACTION_PERMISSIONS.map(perm => (
                <div key={perm.key} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
                  <div>
                    <p className="text-sm font-medium text-foreground">{perm.label}</p>
                    <p className="text-xs text-muted-foreground">{perm.description}</p>
                  </div>
                  <Switch
                    checked={editingPerms.actions[perm.key]}
                    onCheckedChange={() => toggleAction(perm.key)}
                  />
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setPermissionsOpen(false)}>Cancelar</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
              onClick={handleSavePermissions}
              disabled={savingPerms}
            >
              {savingPerms ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Salvar permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="sm:max-w-xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold bg-blue-600 text-white -mx-6 -mt-6 px-6 py-4 rounded-t-lg">
              Excluir {deleteUser?.full_name || "este usuário"}?
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-4 text-sm text-foreground leading-relaxed">
              Todos os dados do usuário serão perdidos. Os atendimentos abertos deste usuário serão movidos para a fila.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-2">
            <AlertDialogCancel disabled={deleting} className="uppercase font-semibold text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 text-white hover:bg-blue-700 uppercase font-semibold text-xs px-6"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Excluindo..." : "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={closeTicketsOpen} onOpenChange={setCloseTicketsOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">
              Encerrar Todos os Tickets
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2 text-sm text-foreground leading-relaxed">
              Tem certeza que deseja encerrar todos os tickets de <strong>{closeTicketsUser?.full_name || "este usuário"}</strong>?
              <span className="block text-muted-foreground text-xs mt-1">Esta ação não pode ser desfeita.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 pt-2">
            <AlertDialogCancel disabled={closingTickets} className="uppercase font-semibold text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 text-white hover:bg-blue-700 uppercase font-semibold text-xs px-6"
              onClick={handleCloseTickets}
              disabled={closingTickets}
            >
              {closingTickets ? "Encerrando..." : "CONFIRMAR"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={transferOpen} onOpenChange={setTransferOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">
              Transferir Todos os Tickets
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2 text-sm text-foreground leading-relaxed">
              Transferir todos os tickets de <strong>{transferUser?.full_name || "este usuário"}</strong> para:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Select value={transferTargetId} onValueChange={setTransferTargetId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Selecione o usuário destino" />
              </SelectTrigger>
              <SelectContent>
                {users
                  .filter(u => u.id !== transferUser?.id)
                  .map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email || u.id.substring(0, 8)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter className="gap-2 pt-2">
            <AlertDialogCancel disabled={transferring} className="uppercase font-semibold text-xs">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-blue-600 text-white hover:bg-blue-700 uppercase font-semibold text-xs px-6"
              onClick={handleTransferTickets}
              disabled={transferring || !transferTargetId}
            >
              {transferring ? "Transferindo..." : "TRANSFERIR"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default UsersPage;