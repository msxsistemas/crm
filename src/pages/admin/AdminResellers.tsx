import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search } from "lucide-react";

interface ResellerAccount {
  id: string;
  user_id: string;
  company_name: string | null;
  is_active: boolean;
  plan_id: string | null;
  expires_at: string | null;
  created_at: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;
}

const AdminResellers = () => {
  const [resellers, setResellers] = useState<ResellerAccount[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ResellerAccount | null>(null);
  const [form, setForm] = useState({ user_id: "", company_name: "", plan_id: "", expires_at: "", new_email: "", new_password: "", new_name: "" });
  const [createMode, setCreateMode] = useState<"existing" | "new">("new");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [r, p, prof] = await Promise.all([
      supabase.from("reseller_accounts").select("*").order("created_at", { ascending: false }),
      supabase.from("reseller_plans").select("id, name, price").order("name"),
      supabase.from("profiles").select("id, full_name"),
    ]);
    setResellers((r.data as any[]) || []);
    setPlans((p.data as any[]) || []);
    setProfiles((prof.data as any[]) || []);
    setLoading(false);
  };

  const toggleReseller = async (id: string, is_active: boolean) => {
    await supabase.from("reseller_accounts").update({ is_active, updated_at: new Date().toISOString() }).eq("id", id);
    toast.success(is_active ? "Revendedor ativado" : "Revendedor desativado");
    loadData();
  };

  const resetForm = () => setForm({ user_id: "", company_name: "", plan_id: "", expires_at: "", new_email: "", new_password: "", new_name: "" });

  const createReseller = async () => {
    if (!form.company_name) return toast.error("Nome da empresa obrigatório");

    if (createMode === "new") {
      if (!form.new_email || !form.new_password) return toast.error("Email e senha são obrigatórios");
      if (form.new_password.length < 6) return toast.error("Senha deve ter no mínimo 6 caracteres");
    } else {
      if (!form.user_id) return toast.error("Selecione um usuário");
    }

    const { data, error } = await supabase.functions.invoke("create-reseller", {
      body: {
        mode: createMode,
        user_id: createMode === "existing" ? form.user_id : undefined,
        email: form.new_email,
        password: form.new_password,
        name: form.new_name,
        company_name: form.company_name,
        plan_id: form.plan_id || null,
        expires_at: form.expires_at || null,
      },
    });

    if (error) return toast.error("Erro: " + error.message);
    if (data?.error) return toast.error(data.error);

    toast.success("Revendedor criado!");
    setDialogOpen(false);
    resetForm();
    loadData();
  };

  const updateReseller = async () => {
    if (!editing) return;
    const { error } = await supabase.from("reseller_accounts").update({
      company_name: form.company_name,
      plan_id: form.plan_id || null,
      expires_at: form.expires_at || null,
      updated_at: new Date().toISOString(),
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Revendedor atualizado!");
    setEditDialogOpen(false);
    setEditing(null);
    loadData();
  };

  const deleteReseller = async (r: ResellerAccount) => {
    if (!confirm("Tem certeza que deseja remover este revendedor?")) return;
    await supabase.from("reseller_accounts").delete().eq("id", r.id);
    await supabase.from("user_roles").delete().eq("user_id", r.user_id).eq("role", "reseller" as any);
    toast.success("Revendedor removido!");
    loadData();
  };

  const getProfileName = (userId: string) => {
    const p = profiles.find(p => p.id === userId);
    return p?.full_name || "Sem nome";
  };

  const getPlanName = (planId: string | null) => {
    if (!planId) return "Nenhum";
    const p = plans.find(p => p.id === planId);
    return p?.name || "Desconhecido";
  };

  const existingResellerUserIds = resellers.map(r => r.user_id);
  const availableUsers = profiles.filter(p => !existingResellerUserIds.includes(p.id));

  const filtered = resellers.filter(r =>
    (r.company_name || "").toLowerCase().includes(search.toLowerCase()) ||
    getProfileName(r.user_id).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Revendedores</h1>
          <p className="text-muted-foreground">Gerencie todos os revendedores do sistema</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Novo Revendedor</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Revendedor</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button type="button" variant={createMode === "new" ? "default" : "outline"} className="flex-1" onClick={() => setCreateMode("new")}>Novo Usuário</Button>
                <Button type="button" variant={createMode === "existing" ? "default" : "outline"} className="flex-1" onClick={() => setCreateMode("existing")}>Usuário Existente</Button>
              </div>
              {createMode === "new" ? (
                <>
                  <div>
                    <Label>Nome</Label>
                    <Input value={form.new_name} onChange={e => setForm(f => ({ ...f, new_name: e.target.value }))} placeholder="Nome completo" />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={form.new_email} onChange={e => setForm(f => ({ ...f, new_email: e.target.value }))} placeholder="email@exemplo.com" />
                  </div>
                  <div>
                    <Label>Senha</Label>
                    <Input type="password" value={form.new_password} onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))} placeholder="Mínimo 6 caracteres" />
                  </div>
                </>
              ) : (
                <div>
                  <Label>Usuário</Label>
                  <Select value={form.user_id} onValueChange={v => setForm(f => ({ ...f, user_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                    <SelectContent>
                      {availableUsers.map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name || u.id.slice(0, 8)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Nome da Empresa</Label>
                <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Nome da empresa" />
              </div>
              <div>
                <Label>Plano</Label>
                <Select value={form.plan_id} onValueChange={v => setForm(f => ({ ...f, plan_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione um plano (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {plans.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name} - R$ {Number(p.price).toFixed(2)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expira em (opcional)</Label>
                <Input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
              </div>
              <Button className="w-full" onClick={createReseller}>Criar Revendedor</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar revendedor..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Revendedores Cadastrados ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum revendedor encontrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expira em</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.company_name || "Sem nome"}</TableCell>
                    <TableCell className="text-sm">{getProfileName(r.user_id)}</TableCell>
                    <TableCell><Badge variant="outline">{getPlanName(r.plan_id)}</Badge></TableCell>
                    <TableCell><Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Ativo" : "Inativo"}</Badge></TableCell>
                    <TableCell>{r.expires_at ? new Date(r.expires_at).toLocaleDateString("pt-BR") : "-"}</TableCell>
                    <TableCell>{new Date(r.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Switch checked={r.is_active} onCheckedChange={(v) => toggleReseller(r.id, v)} />
                        <Button variant="ghost" size="icon" onClick={() => {
                          setEditing(r);
                          setForm({ user_id: r.user_id, company_name: r.company_name || "", plan_id: r.plan_id || "", expires_at: r.expires_at?.split("T")[0] || "", new_email: "", new_password: "", new_name: "" });
                          setEditDialogOpen(true);
                        }}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteReseller(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={o => { setEditDialogOpen(o); if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Revendedor</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome da Empresa</Label>
              <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
            </div>
            <div>
              <Label>Plano</Label>
              <Select value={form.plan_id} onValueChange={v => setForm(f => ({ ...f, plan_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
                <SelectContent>
                  {plans.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} - R$ {Number(p.price).toFixed(2)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expira em</Label>
              <Input type="date" value={form.expires_at} onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={updateReseller}>Salvar Alterações</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminResellers;
