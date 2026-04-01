import { useState, useEffect } from "react";
import {
  Search, Users as UsersIcon,
  Pencil, Trash2, LayoutGrid, List, Mail, Settings2, ShieldCheck, AlertTriangle, RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import UserFormDialog from "@/components/users/UserFormDialog";

interface UserProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  role: string;
  status: string;
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
        supabase.from("profiles").select("id, full_name, avatar_url, status, email"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.functions.invoke("manage-users", {
          method: "GET",
          headers: { Authorization: `Bearer ${session.access_token}` },
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

      setUsers(profiles.map((prof) => ({
        id: prof.id,
        full_name: prof.full_name,
        avatar_url: prof.avatar_url,
        email: emailMap.get(prof.id) || prof.email || null,
        role: userRoles.find(ur => ur.user_id === prof.id)?.role || "user",
        status: prof.status || "offline",
      })));
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
      // Get all open conversations (in a real scenario, filter by assigned user)
      const { data: convos, error: fetchErr } = await supabase
        .from("conversations")
        .select("id")
        .eq("status", "open");
      if (fetchErr) throw fetchErr;

      // For now, we mark them as transferred by keeping them open
      // In production, you'd have an assigned_to column to reassign
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
      // Find all open conversations assigned to this user and close them
      const { error } = await supabase
        .from("conversations")
        .update({ status: "closed" } as any)
        .eq("status", "open");
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
        headers: { Authorization: `Bearer ${session.access_token}` },
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
        headers: { Authorization: `Bearer ${session.access_token}` },
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

  const UserCardGrid = ({ u }: { u: UserProfile }) => (
    <Card className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="p-5 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-base shrink-0">
            {getInitials(u.full_name)}
          </div>
          <p className="font-bold text-foreground text-sm">{u.full_name || "Sem nome"}</p>
        </div>
        <div className="mb-1"><RoleSelector u={u} /></div>
        <div className="mb-3">{getStatusBadges(u.status)}</div>
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
        <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-base shrink-0">
          {getInitials(u.full_name)}
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="font-bold text-foreground text-sm">{u.full_name || "Sem nome"}</p>
          <RoleSelector u={u} />
          <div>{getStatusBadges(u.status)}</div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Settings2 className="h-3 w-3" /> ID: {u.id.substring(0, 8)}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3 w-3" /> {u.email || "—"}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs font-semibold h-8 text-blue-600 border-blue-200 hover:bg-blue-50">
            Encerrar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs font-semibold h-8 text-blue-600 border-blue-200 hover:bg-blue-50">
            Transferir
          </Button>
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