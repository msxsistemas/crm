import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Search, Smartphone, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

const AdminConnections = () => {
  const [connections, setConnections] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { loadConnections(); }, []);

  const loadConnections = async () => {
    setLoading(true);
    const [evo, prof] = await Promise.all([
      supabase.from("evolution_connections").select("*"),
      supabase.from("profiles").select("id, full_name"),
    ]);
    const all = ((evo.data || []) as any[]).map(c => ({ ...c, provider: "Evolution" }));
    setConnections(all);
    setProfiles((prof.data as any[]) || []);
    setLoading(false);
  };

  const getOwner = (userId: string) => {
    const p = profiles.find(p => p.id === userId);
    return p?.full_name || "Desconhecido";
  };

  const deleteConnection = async (conn: any) => {
    if (!confirm("Remover esta conexão?")) return;
    await supabase.from("evolution_connections").delete().eq("id", conn.id);
    toast.success("Conexão removida!");
    loadConnections();
  };

  const isConnected = (c: any) => c.status === "open" || c.status === "connected" || c.connected;

  const filtered = connections.filter(c =>
    (c.instance_name || c.label || "").toLowerCase().includes(search.toLowerCase()) ||
    getOwner(c.user_id).toLowerCase().includes(search.toLowerCase())
  );

  const totalConnected = connections.filter(isConnected).length;

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Conexões</h1>
        <p className="text-muted-foreground">Visualize e gerencie todas as conexões WhatsApp do sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-primary/10"><Smartphone className="h-6 w-6 text-primary" /></div>
            <div><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-bold">{connections.length}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-500/10"><Wifi className="h-6 w-6 text-green-500" /></div>
            <div><p className="text-sm text-muted-foreground">Conectadas</p><p className="text-2xl font-bold">{totalConnected}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-destructive/10"><WifiOff className="h-6 w-6 text-destructive" /></div>
            <div><p className="text-sm text-muted-foreground">Desconectadas</p><p className="text-2xl font-bold">{connections.length - totalConnected}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar conexão..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <Card>
        <CardHeader><CardTitle>Todas as Conexões ({filtered.length})</CardTitle></CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhuma conexão encontrada</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Provedor</TableHead>
                  <TableHead>Proprietário</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Número</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.instance_name || c.label}</TableCell>
                    <TableCell><Badge variant="outline">{c.provider}</Badge></TableCell>
                    <TableCell className="text-sm">{getOwner(c.user_id)}</TableCell>
                    <TableCell>
                      <Badge variant={isConnected(c) ? "default" : "secondary"}>
                        {isConnected(c) ? "Conectado" : "Desconectado"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{c.owner_jid || "-"}</TableCell>
                    <TableCell>{new Date(c.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => deleteConnection(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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

export default AdminConnections;
