import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";

const ResellerSubUsers = () => {
  const { user } = useAuth();
  const [subUsers, setSubUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadSubUsers();
  }, [user]);

  const loadSubUsers = async () => {
    setLoading(true);
    const { data } = await db.from("reseller_sub_users").select("*").eq("reseller_id", user!.id);
    setSubUsers(data || []);
    setLoading(false);
  };

  const toggleUser = async (id: string, is_active: boolean) => {
    await db.from("reseller_sub_users").update({ is_active }).eq("id", id);
    toast.success(is_active ? "Usuário ativado" : "Usuário desativado");
    loadSubUsers();
  };

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Sub-Usuários</h1>
        <p className="text-muted-foreground">Gerencie os atendentes da sua revenda</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Meus Sub-Usuários</CardTitle></CardHeader>
        <CardContent>
          {subUsers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum sub-usuário cadastrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subUsers.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.sub_user_id}</TableCell>
                    <TableCell><Badge variant={s.is_active ? "default" : "secondary"}>{s.is_active ? "Ativo" : "Inativo"}</Badge></TableCell>
                    <TableCell>{new Date(s.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell><Switch checked={s.is_active} onCheckedChange={(v) => toggleUser(s.id, v)} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResellerSubUsers;
