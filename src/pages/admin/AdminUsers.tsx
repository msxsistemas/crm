import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Users, ShieldCheck, Store } from "lucide-react";

interface Profile {
  id: string;
  name: string;
  full_name: string | null;
  email: string;
  role: string;
  created_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  agent: "Agente",
};

const AdminUsers = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await api.get<Profile[]>('/users');
      setProfiles(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Erro ao carregar usuários");
    } finally {
      setLoading(false);
    }
  };

  const changeRole = async (userId: string, newRole: string) => {
    try {
      await api.patch(`/users/${userId}`, { role: newRole });
      toast.success("Role atualizada!");
      setProfiles(prev => prev.map(p => p.id === userId ? { ...p, role: newRole } : p));
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar role");
    }
  };

  const filtered = profiles.filter(p =>
    (p.name || p.full_name || p.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalAdmins = profiles.filter(p => p.role === "admin").length;
  const totalSupervisors = profiles.filter(p => p.role === "supervisor").length;
  const totalAgents = profiles.filter(p => p.role === "agent").length;

  const formatDate = (d: string) => {
    if (!d) return "—";
    const date = new Date(d);
    return isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
  };

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
            <div><p className="text-sm text-muted-foreground">Supervisores</p><p className="text-2xl font-bold">{totalSupervisors}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10"><Users className="h-6 w-6 text-blue-500" /></div>
            <div><p className="text-sm text-muted-foreground">Agentes</p><p className="text-2xl font-bold">{totalAgents}</p></div>
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
          {loading ? (
            <p className="text-muted-foreground text-center py-8">Carregando...</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhum usuário encontrado</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Role Atual</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Alterar Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name || p.full_name || "Sem nome"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.email}</TableCell>
                    <TableCell>
                      <Badge variant={p.role === "admin" ? "default" : p.role === "supervisor" ? "outline" : "secondary"}>
                        {ROLE_LABELS[p.role] || p.role}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(p.created_at)}</TableCell>
                    <TableCell>
                      <Select value={p.role} onValueChange={(v) => changeRole(p.id, v)}>
                        <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="agent">Agente</SelectItem>
                          <SelectItem value="supervisor">Supervisor</SelectItem>
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
