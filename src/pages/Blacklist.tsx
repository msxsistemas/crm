import { useState, useEffect, useCallback } from "react";
import { Ban, Plus, Search, Trash2, Pencil, RefreshCw, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface BlacklistEntry {
  id: string;
  phone: string;
  reason: string | null;
  blocked_by: string | null;
  blocked_by_name: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

type StatusFilter = "todos" | "ativo" | "expirado";
type ExpirationOption = "nunca" | "7" | "30" | "90" | "custom";

function getEntryStatus(entry: BlacklistEntry): "ativo" | "expirando" | "expirado" {
  if (!entry.is_active) return "expirado";
  if (!entry.expires_at) return "ativo";
  const now = new Date();
  const exp = new Date(entry.expires_at);
  if (exp < now) return "expirado";
  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) return "expirando";
  return "ativo";
}

function StatusBadge({ entry }: { entry: BlacklistEntry }) {
  const status = getEntryStatus(entry);
  if (status === "ativo") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Bloqueado
      </span>
    );
  }
  if (status === "expirando") {
    const diffDays = Math.ceil((new Date(entry.expires_at!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
        <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" /> Expira em {diffDays}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> Expirado
    </span>
  );
}

const BlacklistPage = () => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");

  // Block dialog
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockPhone, setBlockPhone] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockExpiration, setBlockExpiration] = useState<ExpirationOption>("nunca");
  const [blockCustomDate, setBlockCustomDate] = useState("");
  const [blocking, setBlocking] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<BlacklistEntry | null>(null);
  const [editReason, setEditReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Unblock confirm
  const [unblockOpen, setUnblockOpen] = useState(false);
  const [unblockEntry, setUnblockEntry] = useState<BlacklistEntry | null>(null);
  const [unblocking, setUnblocking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("blacklist" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar lista negra");
    } else {
      setEntries((data as BlacklistEntry[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = entries.filter(e => {
    const matchSearch =
      e.phone.toLowerCase().includes(search.toLowerCase()) ||
      (e.reason || "").toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (statusFilter === "ativo") {
      const s = getEntryStatus(e);
      return s === "ativo" || s === "expirando";
    }
    if (statusFilter === "expirado") {
      return getEntryStatus(e) === "expirado";
    }
    return true;
  });

  const total = entries.length;
  const ativos = entries.filter(e => {
    const s = getEntryStatus(e);
    return s === "ativo" || s === "expirando";
  }).length;
  const expirados = entries.filter(e => getEntryStatus(e) === "expirado").length;

  const computeExpiresAt = (): string | null => {
    if (blockExpiration === "nunca") return null;
    if (blockExpiration === "custom") return blockCustomDate ? new Date(blockCustomDate).toISOString() : null;
    const days = parseInt(blockExpiration);
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
  };

  const handleBlock = async () => {
    if (!blockPhone.trim()) { toast.error("Informe o número de telefone"); return; }
    if (!blockReason.trim()) { toast.error("Motivo é obrigatório"); return; }
    setBlocking(true);
    const expiresAt = computeExpiresAt();
    const profileName = user?.user_metadata?.full_name || user?.email || null;
    const { error } = await supabase.from("blacklist" as any).upsert({
      phone: blockPhone.trim(),
      reason: blockReason.trim(),
      blocked_by: user?.id || null,
      blocked_by_name: profileName,
      expires_at: expiresAt,
      is_active: true,
    }, { onConflict: "phone" });
    setBlocking(false);
    if (error) {
      toast.error("Erro ao bloquear número: " + error.message);
    } else {
      toast.success("Número bloqueado com sucesso!");
      setBlockOpen(false);
      setBlockPhone("");
      setBlockReason("");
      setBlockExpiration("nunca");
      setBlockCustomDate("");
      load();
    }
  };

  const handleUnblock = async () => {
    if (!unblockEntry) return;
    setUnblocking(true);
    const { error } = await supabase
      .from("blacklist" as any)
      .update({ is_active: false })
      .eq("id", unblockEntry.id);
    setUnblocking(false);
    if (error) {
      toast.error("Erro ao desbloquear");
    } else {
      toast.success("Número desbloqueado!");
      setUnblockOpen(false);
      setUnblockEntry(null);
      load();
    }
  };

  const openEdit = (e: BlacklistEntry) => {
    setEditEntry(e);
    setEditReason(e.reason || "");
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editEntry) return;
    setSaving(true);
    const { error } = await supabase
      .from("blacklist" as any)
      .update({ reason: editReason.trim() })
      .eq("id", editEntry.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar motivo");
    } else {
      toast.success("Motivo atualizado!");
      setEditOpen(false);
      setEditEntry(null);
      load();
    }
  };

  const openBlock = (phone?: string) => {
    setBlockPhone(phone || "");
    setBlockReason("");
    setBlockExpiration("nunca");
    setBlockCustomDate("");
    setBlockOpen(true);
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-red-500" />
            <h1 className="text-xl font-bold text-blue-600">Lista Negra (Blacklist)</h1>
          </div>
          <Button variant="action" className="gap-2 uppercase text-xs px-5" onClick={() => openBlock()}>
            <Plus className="h-4 w-4" /> Bloquear número
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-foreground">{total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Total bloqueados</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{ativos}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Bloqueios ativos</p>
            </Card>
            <Card className="p-4 text-center">
              <p className="text-2xl font-bold text-gray-400">{expirados}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Expirados</p>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por número ou motivo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="ativo">Ativos</SelectItem>
                <SelectItem value="expirado">Expirados</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={load} title="Atualizar">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShieldOff className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>Nenhum número encontrado</p>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Telefone</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Motivo</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Bloqueado por</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Data</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Expira em</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(entry => (
                    <tr key={entry.id} className="bg-card hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium">{entry.phone}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{entry.reason || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{entry.blocked_by_name || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(entry.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {entry.expires_at
                          ? new Date(entry.expires_at).toLocaleDateString("pt-BR")
                          : "Nunca"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge entry={entry} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Editar motivo"
                            onClick={() => openEdit(entry)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-red-600"
                            title="Desbloquear"
                            onClick={() => { setUnblockEntry(entry); setUnblockOpen(true); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Block Dialog */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-500" /> Bloquear número
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="block-phone">Telefone</Label>
              <Input
                id="block-phone"
                placeholder="Ex: 5511999999999"
                value={blockPhone}
                onChange={e => setBlockPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Use o formato internacional (ex: 5511999999999)</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="block-reason">Motivo <span className="text-red-500">*</span></Label>
              <Textarea
                id="block-reason"
                placeholder="Descreva o motivo do bloqueio..."
                value={blockReason}
                onChange={e => setBlockReason(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expiração</Label>
              <Select value={blockExpiration} onValueChange={v => setBlockExpiration(v as ExpirationOption)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nunca">Nunca</SelectItem>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                  <SelectItem value="custom">Data específica</SelectItem>
                </SelectContent>
              </Select>
              {blockExpiration === "custom" && (
                <Input
                  type="date"
                  value={blockCustomDate}
                  onChange={e => setBlockCustomDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockOpen(false)}>Cancelar</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleBlock}
              disabled={blocking}
            >
              {blocking ? "Bloqueando..." : "Bloquear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Reason Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar motivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground font-mono">{editEntry?.phone}</p>
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Textarea
                value={editReason}
                onChange={e => setEditReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unblock Confirm */}
      <AlertDialog open={unblockOpen} onOpenChange={setUnblockOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desbloquear número?</AlertDialogTitle>
            <AlertDialogDescription>
              O número <span className="font-mono font-semibold">{unblockEntry?.phone}</span> será desbloqueado e poderá entrar no sistema novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleUnblock}
              disabled={unblocking}
            >
              {unblocking ? "Desbloqueando..." : "Desbloquear"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default BlacklistPage;
