import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Users, ShieldCheck, Store } from "lucide-react";

interface Profile {
  id: string;
  full_name: string | null;
  created_at: string;
}

interface UserRole {
  user_id: string;
  role: string;
}

const AdminUsers = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [p, r] = await Promise.all([
      db.from("profiles").select("id, full_name, created_at"),
      db.from("user_roles").select("user_id, role"),
    ]);
    setProfiles((p.data as any[]) || []);
    setRoles((r.data as any[]) || []);
    setLoading(false);
  };

  const getUserRole = (userId: string) => {
    const r = roles.find(r => r.user_id === userId);
    return r?.role || "user";
  };

  const changeRole = async (userId: string, newRole: string) => {
    await db.from("user_roles").delete().eq("user_id", userId);
    if (newRole !== "user") {
      const { error } = await db.from("user_roles").insert({ user_id: userId, role: newRole } as any);
      if (error) return toast.error(error.message);
    }
    toast.success("Role atualizada!");
    loadData();
  };

  const filtered = profiles.filter(p =>
    (p.full_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalAdmins = profiles.filter(p => getUserRole(p.id) === "admin").length;
  const totalResellers = profiles.filter(p => getUserRole(p.id) === "reseller").length;
  const totalUsers = profiles.filter(p => getUserRole(p.id) === "user").length;

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usuários</h1>
        <p className="text-muted-foreground">Gerencie todos os usuários e suas permissões</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10"><ShieldCheck className="h-6 w-6 text-primary" /></div>
            <div><p className="text-sm text-muted-foreground">Admins</p><p className="text-2xl font-bold">{totalAdmins}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10"><Store className="h-6 w-6 text-amber-500" /></div>
            <div><p className="text-sm text-muted-foreground">Revendedores</p><p className="text-2xl font-bold">{totalResellers}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10"><Users className="h-6 w-6 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Usuários</p><p className="text-2xl font-bold">{totalUsers}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar usuário..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Todos os Usuários ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum usuário encontrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Role Atual</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Alterar Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.full_name || "Sem nome"}</TableCell>
                    <TableCell>
                      <Badge variant={getUserRole(p.id) === "admin" ? "default" : getUserRole(p.id) === "reseller" ? "outline" : "secondary"}>
                        {getUserRole(p.id) === "admin" ? "Admin" : getUserRole(p.id) === "reseller" ? "Revendedor" : "Usuário"}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(p.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>
                      <Select value={getUserRole(p.id)} onValueChange={(v) => changeRole(p.id, v)}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Usuário</SelectItem>
                          <SelectItem value="reseller">Revendedor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
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

export default AdminUsers;
