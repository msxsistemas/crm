import { useEffect, useState } from "react";
import { supabase } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Search, CreditCard, CheckCircle, Clock, XCircle, MoreHorizontal, RefreshCw, Ban, ArrowRightLeft } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";

const AdminSubscriptions = () => {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Dialog states
  const [cancelDialog, setCancelDialog] = useState<any>(null);
  const [renewDialog, setRenewDialog] = useState<any>(null);
  const [changePlanDialog, setChangePlanDialog] = useState<any>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [subs, prof, pl] = await Promise.all([
      supabase.from("subscriptions").select("*"),
      supabase.from("profiles").select("id, full_name"),
      supabase.from("reseller_plans").select("id, name, price"),
    ]);
    setSubscriptions((subs.data as any[]) || []);
    setProfiles((prof.data as any[]) || []);
    setPlans((pl.data as any[]) || []);
    setLoading(false);
  };

  const getUserName = (userId: string) => {
    const p = profiles.find(p => p.id === userId);
    return p?.full_name || "Desconhecido";
  };

  const getPlanName = (planId: string | null) => {
    if (!planId) return "—";
    const p = plans.find(p => p.id === planId);
    return p?.name || "—";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Ativo</Badge>;
      case "paid":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Pago</Badge>;
      case "pending":
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Pendente</Badge>;
      case "cancelled":
      case "canceled":
        return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Cancelado</Badge>;
      case "expired":
        return <Badge variant="secondary">Expirado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleCancel = async () => {
    if (!cancelDialog) return;
    setActionLoading(true);
    const { error } = await supabase.from("subscriptions").update({ status: "cancelled" }).eq("id", cancelDialog.id);
    setActionLoading(false);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível cancelar a assinatura.", variant: "destructive" });
    } else {
      toast({ title: "Sucesso", description: "Assinatura cancelada com sucesso." });
      loadData();
    }
    setCancelDialog(null);
  };

  const handleRenew = async () => {
    if (!renewDialog) return;
    setActionLoading(true);
    const newExpiry = new Date();
    newExpiry.setDate(newExpiry.getDate() + 30);
    const { error } = await supabase.from("subscriptions").update({
      status: "active",
      expires_at: newExpiry.toISOString(),
      paid_at: new Date().toISOString(),
    }).eq("id", renewDialog.id);
    setActionLoading(false);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível renovar a assinatura.", variant: "destructive" });
    } else {
      toast({ title: "Sucesso", description: "Assinatura renovada por +30 dias." });
      loadData();
    }
    setRenewDialog(null);
  };

  const handleChangePlan = async () => {
    if (!changePlanDialog || !selectedPlanId) return;
    setActionLoading(true);
    const { error } = await supabase.from("subscriptions").update({ plan_id: selectedPlanId }).eq("id", changePlanDialog.id);
    setActionLoading(false);
    if (error) {
      toast({ title: "Erro", description: "Não foi possível alterar o plano.", variant: "destructive" });
    } else {
      toast({ title: "Sucesso", description: "Plano alterado com sucesso." });
      loadData();
    }
    setChangePlanDialog(null);
    setSelectedPlanId("");
  };

  const filtered = subscriptions.filter(s => {
    const matchesSearch =
      getUserName(s.user_id).toLowerCase().includes(search.toLowerCase()) ||
      getPlanName(s.plan_id).toLowerCase().includes(search.toLowerCase()) ||
      s.status.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && (s.status === "active" || s.status === "paid")) ||
      (statusFilter === "pending" && s.status === "pending") ||
      (statusFilter === "cancelled" && (s.status === "cancelled" || s.status === "canceled")) ||
      (statusFilter === "expired" && s.status === "expired");
    return matchesSearch && matchesStatus;
  });

  const totalActive = subscriptions.filter(s => s.status === "active" || s.status === "paid").length;
  const totalPending = subscriptions.filter(s => s.status === "pending").length;
  const totalCancelled = subscriptions.filter(s => s.status === "cancelled" || s.status === "canceled").length;

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Assinaturas</h1>
        <p className="text-muted-foreground">Visualize e gerencie todas as assinaturas do sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10"><CreditCard className="h-6 w-6 text-primary" /></div>
            <div><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-bold">{subscriptions.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-500/10"><CheckCircle className="h-6 w-6 text-green-500" /></div>
            <div><p className="text-sm text-muted-foreground">Ativas</p><p className="text-2xl font-bold">{totalActive}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10"><Clock className="h-6 w-6 text-amber-500" /></div>
            <div><p className="text-sm text-muted-foreground">Pendentes</p><p className="text-2xl font-bold">{totalPending}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-destructive/10"><XCircle className="h-6 w-6 text-destructive" /></div>
            <div><p className="text-sm text-muted-foreground">Canceladas</p><p className="text-2xl font-bold">{totalCancelled}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar assinatura..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativo / Pago</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
            <SelectItem value="expired">Expirado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader><CardTitle>Todas as Assinaturas ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhuma assinatura encontrada</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{getUserName(s.user_id)}</TableCell>
                    <TableCell>{getPlanName(s.plan_id)}</TableCell>
                    <TableCell>{getStatusBadge(s.status)}</TableCell>
                    <TableCell className="text-sm">{s.payment_method || "—"}</TableCell>
                    <TableCell className="text-sm">{s.expires_at ? new Date(s.expires_at).toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell className="text-sm">{new Date(s.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setRenewDialog(s)}>
                            <RefreshCw className="h-4 w-4 mr-2" /> Renovar (+30 dias)
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setChangePlanDialog(s); setSelectedPlanId(s.plan_id || ""); }}>
                            <ArrowRightLeft className="h-4 w-4 mr-2" /> Alterar Plano
                          </DropdownMenuItem>
                          {s.status !== "cancelled" && s.status !== "canceled" && (
                            <DropdownMenuItem onClick={() => setCancelDialog(s)} className="text-destructive focus:text-destructive">
                              <Ban className="h-4 w-4 mr-2" /> Cancelar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cancel Dialog */}
      <Dialog open={!!cancelDialog} onOpenChange={() => setCancelDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Assinatura</DialogTitle>
            <DialogDescription>Tem certeza que deseja cancelar a assinatura de <strong>{cancelDialog && getUserName(cancelDialog.user_id)}</strong>?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(null)}>Voltar</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={actionLoading}>Cancelar Assinatura</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renew Dialog */}
      <Dialog open={!!renewDialog} onOpenChange={() => setRenewDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renovar Assinatura</DialogTitle>
            <DialogDescription>Renovar a assinatura de <strong>{renewDialog && getUserName(renewDialog.user_id)}</strong> por mais 30 dias?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenewDialog(null)}>Voltar</Button>
            <Button onClick={handleRenew} disabled={actionLoading}>Confirmar Renovação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Plan Dialog */}
      <Dialog open={!!changePlanDialog} onOpenChange={() => setChangePlanDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar Plano</DialogTitle>
            <DialogDescription>Selecione o novo plano para <strong>{changePlanDialog && getUserName(changePlanDialog.user_id)}</strong>:</DialogDescription>
          </DialogHeader>
          <Select value={selectedPlanId} onValueChange={setSelectedPlanId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um plano" />
            </SelectTrigger>
            <SelectContent>
              {plans.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name} — R$ {Number(p.price).toFixed(2)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanDialog(null)}>Voltar</Button>
            <Button onClick={handleChangePlan} disabled={actionLoading || !selectedPlanId}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminSubscriptions;
