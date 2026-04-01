import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ResellerConnections = () => {
  const { user } = useAuth();
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadConnections();
  }, [user]);

  const loadConnections = async () => {
    setLoading(true);
    const [evo, zapi] = await Promise.all([
      supabase.from("evolution_connections").select("*").eq("user_id", user!.id),
      supabase.from("zapi_connections").select("*").eq("user_id", user!.id),
    ]);
    const all = [
      ...((evo.data || []) as any[]).map(c => ({ ...c, provider: "Evolution" })),
      ...((zapi.data || []) as any[]).map(c => ({ ...c, provider: "Z-API", instance_name: c.label })),
    ];
    setConnections(all);
    setLoading(false);
  };

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Conexões</h1>
        <p className="text-muted-foreground">Gerencie suas conexões WhatsApp</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Minhas Conexões WhatsApp</CardTitle></CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nenhuma conexão encontrada</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instância</TableHead>
                  <TableHead>Provedor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Número</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.instance_name || c.label}</TableCell>
                    <TableCell><Badge variant="outline">{c.provider}</Badge></TableCell>
                    <TableCell><Badge variant={c.status === "open" || c.connected ? "default" : "secondary"}>{c.status || (c.connected ? "Conectado" : "Desconectado")}</Badge></TableCell>
                    <TableCell>{c.owner_jid || "-"}</TableCell>
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

export default ResellerConnections;
