import { useEffect, useState } from "react";
import { supabase } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface ResellerPlan {
  id: string;
  name: string;
  description: string | null;
  price: number;
  max_connections: number;
  max_users: number;
  max_contacts: number;
  is_active: boolean;
}

const AdminPlans = () => {
  const [plans, setPlans] = useState<ResellerPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ResellerPlan | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: 0, max_connections: 1, max_users: 3, max_contacts: 5 });

  useEffect(() => { loadPlans(); }, []);

  const loadPlans = async () => {
    setLoading(true);
    const { data } = await supabase.from("reseller_plans").select("*").order("price");
    setPlans((data as any[]) || []);
    setLoading(false);
  };

  const savePlan = async () => {
    if (!form.name) return toast.error("Nome obrigatório");
    if (editing) {
      const { error } = await supabase.from("reseller_plans").update({ ...form, updated_at: new Date().toISOString() } as any).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Plano atualizado!");
    } else {
      const { error } = await supabase.from("reseller_plans").insert(form as any);
      if (error) return toast.error(error.message);
      toast.success("Plano criado!");
    }
    setDialogOpen(false);
    setEditing(null);
    setForm({ name: "", description: "", price: 0, max_connections: 1, max_users: 3, max_contacts: 5 });
    loadPlans();
  };

  const deletePlan = async (id: string) => {
    const { error } = await supabase.from("reseller_plans").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Plano removido!");
    loadPlans();
  };

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Planos</h1>
          <p className="text-muted-foreground">Gerencie os planos de revenda</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setEditing(null); setForm({ name: "", description: "", price: 0, max_connections: 1, max_users: 3, max_contacts: 5 }); } }}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Novo Plano</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar Plano" : "Novo Plano"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div><Label>Descrição</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Preço (R$)</Label><Input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: Number(e.target.value) }))} /></div>
                <div><Label>Máx. Conexões</Label><Input type="number" value={form.max_connections} onChange={e => setForm(p => ({ ...p, max_connections: Number(e.target.value) }))} /></div>
                <div><Label>Máx. Usuários</Label><Input type="number" value={form.max_users} onChange={e => setForm(p => ({ ...p, max_users: Number(e.target.value) }))} /></div>
                <div><Label>Máx. Contatos</Label><Input type="number" value={form.max_contacts} onChange={e => setForm(p => ({ ...p, max_contacts: Number(e.target.value) }))} /></div>
              </div>
              <Button className="w-full" onClick={savePlan}>{editing ? "Salvar" : "Criar Plano"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      {plans.length === 0 ? (
        <Card><CardContent className="py-8"><p className="text-muted-foreground text-center">Nenhum plano criado. Crie o primeiro!</p></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map(plan => (
            <Card key={plan.id} className="border-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => { setEditing(plan); setForm({ name: plan.name, description: plan.description || "", price: plan.price, max_connections: plan.max_connections, max_users: plan.max_users, max_contacts: plan.max_contacts }); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deletePlan(plan.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </div>
                {plan.description && <p className="text-sm text-muted-foreground">{plan.description}</p>}
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-primary">R$ {Number(plan.price).toFixed(2)}<span className="text-sm font-normal text-muted-foreground">/mês</span></p>
                <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                  <p>📱 {plan.max_connections} conexões</p>
                  <p>👥 {plan.max_users} usuários</p>
                  <p>👤 {plan.max_contacts} contatos</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminPlans;
