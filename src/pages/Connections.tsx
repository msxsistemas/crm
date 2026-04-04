import { useState, useEffect, useCallback } from "react";
import {
  Smartphone, Plus, QrCode, RefreshCw, Trash2, CheckCircle, XCircle,
  Loader2, Wifi, WifiOff, Search, Key, Globe, Pencil, Signal, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  createInstance,
  getQRCode,
  getInstanceStatus,
  setupWebhook,
} from "@/lib/evolution-api";
import { getZApiQRCode, getZApiStatus } from "@/lib/zapi";

interface Instance {
  instanceName: string;
  status?: string;
  ownerJid?: string;
  profilePicUrl?: string;
}

interface ZApiConnection {
  id: string;
  label: string;
  instanceId: string;
  instanceToken: string;
  clientToken: string;
  status?: string;
  connected?: boolean;
}

const Connections = () => {
  // Evolution API state
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Z-API state
  const [zapiConnections, setZapiConnections] = useState<ZApiConnection[]>([]);
  const [zapiLoading, setZapiLoading] = useState(false);
  const [zapiNewOpen, setZapiNewOpen] = useState(false);
  const [zapiLabel, setZapiLabel] = useState("");
  const [zapiInstanceId, setZapiInstanceId] = useState("");
  const [zapiInstanceToken, setZapiInstanceToken] = useState("");
  const [zapiClientToken, setZapiClientToken] = useState("");
  const [zapiCreating, setZapiCreating] = useState(false);

  // Status check state
  const [checkingInstance, setCheckingInstance] = useState<string | null>(null);

  // Edit state
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editOriginalName, setEditOriginalName] = useState("");

  // Last checked timestamp
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  // Shared QR state
  const [qrOpen, setQrOpen] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [qrInstance, setQrInstance] = useState("");
  const [qrLoading, setQrLoading] = useState(false);
  const [qrProvider, setQrProvider] = useState<"evolution" | "zapi">("evolution");
  const [qrZapiConn, setQrZapiConn] = useState<ZApiConnection | null>(null);

  // Evolution API - fetch ONLY from DB, enrich with live status
  const fetchInstances = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      // Load saved instances from DB only
      const { data: dbInstances } = await supabase
        .from("evolution_connections" as any)
        .select("*")
        .eq("user_id", user.id);

      const allNames = (dbInstances || []).map((r: any) => r.instance_name as string);

      // Enrich with live status
      const enriched = await Promise.all(
        allNames.map(async (name) => {
          try {
            const statusResult = await getInstanceStatus(name);

            if (
              statusResult?.notFound ||
              statusResult?.exists === false ||
              statusResult?.instance?.state === "not_found"
            ) {
              return { instanceName: name, __missing: true } as any;
            }

            const status = statusResult?.instance?.state || statusResult?.state || "unknown";
            const ownerJid = statusResult?.instance?.owner || "";
            const profilePicUrl = statusResult?.instance?.profilePictureUrl || "";

            await supabase
              .from("evolution_connections" as any)
              .update({
                status,
                owner_jid: ownerJid,
                profile_pic_url: profilePicUrl,
                updated_at: new Date().toISOString(),
              } as any)
              .eq("user_id", user.id)
              .eq("instance_name", name);

            return { instanceName: name, status, ownerJid, profilePicUrl };
          } catch {
            return { instanceName: name, status: "disconnected" };
          }
        })
      );

      const missingNames = enriched
        .filter((item: any) => item?.__missing)
        .map((item: any) => item.instanceName as string);

      if (missingNames.length > 0) {
        await supabase
          .from("evolution_connections" as any)
          .delete()
          .eq("user_id", user.id)
          .in("instance_name", missingNames as any);
      }

      setInstances(enriched.filter((item: any) => item && !item.__missing) as Instance[]);
    } catch {
      setInstances([]);
    }
    setLoading(false);
    setLastChecked(new Date());
  }, []);

  useEffect(() => {
    fetchInstances();
    fetchZapiFromDb();
  }, [fetchInstances]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchInstances();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchInstances]);

  const fetchZapiFromDb = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("zapi_connections" as any)
        .select("*")
        .eq("user_id", user.id);
      if (error) throw error;
      const mapped: ZApiConnection[] = (data || []).map((r: any) => ({
        id: r.id,
        label: r.label,
        instanceId: r.instance_id,
        instanceToken: r.instance_token,
        clientToken: r.client_token,
        status: r.status || "disconnected",
        connected: r.connected || false,
      }));
      setZapiConnections(mapped);
    } catch (err) {
      console.warn("Failed to load Z-API connections:", err);
    }
  }, []);

  const handleCreateEvolution = async () => {
    if (!newName.trim()) {
      toast.error("Digite um nome para a instância");
      return;
    }
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Faça login primeiro"); setCreating(false); return; }
      
      // Save to DB first (upsert to avoid duplicate errors)
      await supabase.from("evolution_connections" as any).upsert({
        user_id: user.id,
        instance_name: newName.trim(),
      } as any, { onConflict: "user_id,instance_name" });

      // Create instance on Evolution API (ignore if already exists)
      try {
        await createInstance(newName.trim());
      } catch (e: any) {
        // Instance might already exist, continue to QR
        console.warn("Create instance:", e.message);
      }

      try {
        await setupWebhook(newName.trim());
      } catch (e: any) {
        console.warn("Setup webhook:", e.message);
      }

      toast.success("Instância criada com sucesso!");
      setNewOpen(false);
      const name = newName.trim();
      setNewName("");
      handleShowEvolutionQR(name);
      fetchInstances();
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar instância");
    }
    setCreating(false);
  };

  const handleRemoveEvolution = async (instanceName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("evolution_connections" as any).delete().eq("user_id", user.id).eq("instance_name", instanceName);
      setInstances((prev) => prev.filter((i) => i.instanceName !== instanceName));
      toast.success("Instância removida");
    } catch {
      toast.error("Erro ao remover instância");
    }
  };

  const handleEditEvolution = (instanceName: string) => {
    setEditOriginalName(instanceName);
    setEditName(instanceName);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("evolution_connections" as any).update({
        instance_name: editName.trim(),
        updated_at: new Date().toISOString(),
      } as any).eq("user_id", user.id).eq("instance_name", editOriginalName);
      setEditOpen(false);
      toast.success("Nome atualizado!");
      fetchInstances();
    } catch {
      toast.error("Erro ao editar instância");
    }
  };

  const handleCheckStatus = async (instanceName: string) => {
    setCheckingInstance(instanceName);
    try {
      const result = await getInstanceStatus(instanceName);

      if (result?.notFound || result?.exists === false || result?.instance?.state === "not_found") {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("evolution_connections" as any)
            .delete()
            .eq("user_id", user.id)
            .eq("instance_name", instanceName);
        }
        setInstances((prev) => prev.filter((item) => item.instanceName !== instanceName));
        toast.error(`Instância ${instanceName} não existe mais e foi removida da lista`);
        return;
      }

      const status = result?.instance?.state || result?.state || "unknown";
      const isConnected = status === "open";
      const ownerJid = result?.instance?.ownerJid || result?.ownerJid || null;
      
      // Update DB status + owner_jid
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const updateData: any = { 
          status: isConnected ? "connected" : "disconnected", 
          updated_at: new Date().toISOString() 
        };
        if (ownerJid) updateData.owner_jid = ownerJid;
        
        await supabase
          .from("evolution_connections" as any)
          .update(updateData)
          .eq("user_id", user.id)
          .eq("instance_name", instanceName);
      }

      // Update local state
      setInstances((prev) =>
        prev.map((inst) =>
          inst.instanceName === instanceName
            ? { ...inst, status: isConnected ? "connected" : "disconnected", ownerJid: ownerJid || inst.ownerJid }
            : inst
        )
      );

      if (isConnected) {
        toast.success(`${instanceName} conectado`, {
          description: "WhatsApp pronto para enviar e receber mensagens.",
        });
      } else {
        toast.warning(`${instanceName} desconectado`, {
          description: "Clique em \"Conectar\" para escanear o QR Code.",
        });
      }
    } catch {
      toast.error("Erro ao verificar status");
    }
    setCheckingInstance(null);
  };

  const handleShowEvolutionQR = async (instanceName: string) => {
    setQrProvider("evolution");
    setQrInstance(instanceName);
    setQrZapiConn(null);
    setQrOpen(true);
    setQrLoading(true);
    setQrData(null);

    try {
      const result = await getQRCode(instanceName);

      if (result?.notFound || result?.exists === false) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from("evolution_connections" as any)
            .delete()
            .eq("user_id", user.id)
            .eq("instance_name", instanceName);
        }
        setInstances((prev) => prev.filter((item) => item.instanceName !== instanceName));
        setQrOpen(false);
        toast.error(`Instância ${instanceName} não existe mais e foi removida da lista`);
        return;
      }

      setQrData(result?.qrcode?.base64 || result?.base64 || result?.code || null);
    } catch {
      toast.error("Erro ao gerar QR Code");
    } finally {
      setQrLoading(false);
    }
  };

  // Z-API
  const fetchZapiStatuses = useCallback(async () => {
    if (zapiConnections.length === 0) return;
    setZapiLoading(true);
    const updated = await Promise.all(
      zapiConnections.map(async (conn) => {
        try {
          const result = await getZApiStatus({
            instanceId: conn.instanceId,
            instanceToken: conn.instanceToken,
            clientToken: conn.clientToken,
          });
          const newStatus = result?.connected ? "connected" : result?.status || "disconnected";
          const isConnected = result?.connected === true;
          // Update status in DB
          await supabase.from("zapi_connections" as any).update({
            status: newStatus,
            connected: isConnected,
            updated_at: new Date().toISOString(),
          } as any).eq("id", conn.id);
          return { ...conn, status: newStatus, connected: isConnected };
        } catch {
          return { ...conn, status: "disconnected", connected: false };
        }
      })
    );
    setZapiConnections(updated);
    setZapiLoading(false);
  }, [zapiConnections.length]);

  useEffect(() => {
    if (zapiConnections.length > 0) fetchZapiStatuses();
  }, []);

  const handleCreateZapi = async () => {
    if (!zapiLabel.trim() || !zapiInstanceId.trim() || !zapiInstanceToken.trim() || !zapiClientToken.trim()) {
      toast.error("Preencha todos os campos");
      return;
    }
    setZapiCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Faça login primeiro"); setZapiCreating(false); return; }
      const { data, error } = await supabase.from("zapi_connections" as any).insert({
        user_id: user.id,
        label: zapiLabel.trim(),
        instance_id: zapiInstanceId.trim(),
        instance_token: zapiInstanceToken.trim(),
        client_token: zapiClientToken.trim(),
      } as any).select().single();
      if (error) throw error;
      const newConn: ZApiConnection = {
        id: (data as any).id,
        label: (data as any).label,
        instanceId: (data as any).instance_id,
        instanceToken: (data as any).instance_token,
        clientToken: (data as any).client_token,
        status: "disconnected",
        connected: false,
      };
      setZapiConnections((prev) => [...prev, newConn]);
      setZapiNewOpen(false);
      setZapiLabel("");
      setZapiInstanceId("");
      setZapiInstanceToken("");
      setZapiClientToken("");
      toast.success("Conexão Z-API adicionada!");
      handleShowZapiQR(newConn);
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar conexão");
    }
    setZapiCreating(false);
  };

  const handleShowZapiQR = async (conn: ZApiConnection) => {
    setQrProvider("zapi");
    setQrInstance(conn.label);
    setQrZapiConn(conn);
    setQrOpen(true);
    setQrLoading(true);
    setQrData(null);
    try {
      const result = await getZApiQRCode({
        instanceId: conn.instanceId,
        instanceToken: conn.instanceToken,
        clientToken: conn.clientToken,
      });
      setQrData(result?.value || result?.qrcode || result?.base64 || null);
    } catch {
      toast.error("Erro ao gerar QR Code da Z-API");
    }
    setQrLoading(false);
  };

  const handleRemoveZapi = async (id: string) => {
    try {
      await supabase.from("zapi_connections" as any).delete().eq("id", id);
      setZapiConnections((prev) => prev.filter((c) => c.id !== id));
      toast.success("Conexão removida");
    } catch {
      toast.error("Erro ao remover conexão");
    }
  };

  const refreshQR = () => {
    if (qrProvider === "evolution") {
      handleShowEvolutionQR(qrInstance);
    } else if (qrZapiConn) {
      handleShowZapiQR(qrZapiConn);
    }
  };

  const connectedCount = instances.filter((i) => i.status === "open" || i.status === "connected").length;
  const disconnectedCount = instances.filter((i) => i.status !== "open" && i.status !== "connected").length;
  const zapiConnectedCount = zapiConnections.filter((c) => c.connected).length;

  const filtered = instances.filter((i) =>
    i.instanceName?.toLowerCase().includes(search.toLowerCase())
  );
  const zapiFiltered = zapiConnections.filter((c) =>
    c.label.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status?: string, connected?: boolean) => {
    if (status === "open" || status === "connected" || connected) {
      return (
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1">
          <CheckCircle className="h-3 w-3" /> Conectado
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-red-500/20 text-red-400 border-red-500/30 gap-1">
        <XCircle className="h-3 w-3" /> Desconectado
      </Badge>
    );
  };

  const getStatusDot = (status?: string, connected?: boolean) => {
    if (status === "open" || status === "connected" || connected) {
      return <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Conectado" />;
    }
    if (status === "connecting") {
      return <span className="h-3 w-3 rounded-full bg-yellow-400 animate-pulse shrink-0" title="Conectando" />;
    }
    return <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse shrink-0" title="Desconectado" />;
  };

  const formatPhone = (jid?: string) => {
    if (!jid) return "—";
    return jid.replace("@s.whatsapp.net", "").replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, "+$1 ($2) $3-$4");
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-blue-600">Conexões</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => { fetchInstances(); fetchZapiStatuses(); }} disabled={loading || zapiLoading}>
            <RefreshCw className={cn("h-4 w-4", (loading || zapiLoading) && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center">
              <Smartphone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{instances.length + zapiConnections.length}</p>
              <p className="text-xs text-muted-foreground">Total de conexões</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Wifi className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{connectedCount + zapiConnectedCount}</p>
              <p className="text-xs text-muted-foreground">Conectadas</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <WifiOff className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{disconnectedCount + (zapiConnections.length - zapiConnectedCount)}</p>
              <p className="text-xs text-muted-foreground">Desconectadas</p>
            </div>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conexões..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="evolution" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="evolution" className="gap-2">
              <Globe className="h-4 w-4" /> Evolution API
            </TabsTrigger>
            <TabsTrigger value="zapi" className="gap-2">
              <Key className="h-4 w-4" /> Z-API
            </TabsTrigger>
          </TabsList>

          {/* Evolution API Tab */}
          <TabsContent value="evolution" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Insira apenas o nome da instância para conectar via Evolution API
              </p>
              <Button variant="action" className="gap-2 px-5" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" /> Nova Instância
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Smartphone className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>Nenhuma conexão encontrada</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {filtered.map((inst) => {
                  const isConnected = inst.status === "open" || inst.status === "connected";
                  return (
                    <Card key={inst.instanceName} className="p-4 relative">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                          isConnected ? "bg-emerald-500/20" : "bg-muted"
                        )}>
                          <Smartphone className={cn("h-6 w-6", isConnected ? "text-emerald-500" : "text-muted-foreground")} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {getStatusDot(inst.status)}
                            <p className="font-semibold text-foreground truncate">{inst.instanceName}</p>
                            {getStatusBadge(inst.status)}
                            <Badge variant="outline" className="text-xs">Evolution</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {isConnected
                              ? (inst.ownerJid ? formatPhone(inst.ownerJid) : "WhatsApp conectado")
                              : "Aguardando conexão"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {!isConnected && (
                            <Button variant="outline" size="sm" className="gap-1.5 border-amber-500 text-amber-600 hover:bg-amber-50 hover:text-amber-700" onClick={() => handleShowEvolutionQR(inst.instanceName)}>
                              <QrCode className="h-4 w-4" /> Reconectar
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleCheckStatus(inst.instanceName)}
                            title="Verificar Status"
                            disabled={checkingInstance === inst.instanceName}
                          >
                            {checkingInstance === inst.instanceName
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Signal className="h-4 w-4" />
                            }
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditEvolution(inst.instanceName)} title="Editar">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleRemoveEvolution(inst.instanceName)} title="Excluir">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
            {lastChecked && (
              <p className="text-xs text-muted-foreground text-right mt-1">
                Atualizado às {lastChecked.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
            )}
          </TabsContent>

          {/* Z-API Tab */}
          <TabsContent value="zapi" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Informe o Instance ID, Token e Client-Token da Z-API para conectar
              </p>
              <Button variant="action" className="gap-2 px-5" onClick={() => setZapiNewOpen(true)}>
                <Plus className="h-4 w-4" /> Nova Conexão Z-API
              </Button>
            </div>

            {zapiFiltered.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Smartphone className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p>Nenhuma conexão Z-API encontrada</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {zapiFiltered.map((conn) => (
                  <Card key={conn.id} className="p-4 relative">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                        conn.connected ? "bg-emerald-500/20" : "bg-muted"
                      )}>
                        <Key className={cn("h-6 w-6", conn.connected ? "text-emerald-500" : "text-muted-foreground")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {getStatusDot(conn.status, conn.connected)}
                          <p className="font-semibold text-foreground truncate">{conn.label}</p>
                          {getStatusBadge(conn.status, conn.connected)}
                          <Badge variant="outline" className="text-xs">Z-API</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          ID: {conn.instanceId}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!conn.connected && (
                          <Button variant="outline" size="sm" className="gap-1.5 border-amber-500 text-amber-600 hover:bg-amber-50 hover:text-amber-700" onClick={() => handleShowZapiQR(conn)}>
                            <QrCode className="h-4 w-4" /> Reconectar
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleRemoveZapi(conn.id)} title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Evolution - New Instance Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 px-6 py-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <Globe className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">Nova Instância — Evolution API</h2>
              <p className="text-sm text-white/70">Crie uma nova instância para conectar</p>
            </div>
            <button onClick={() => setNewOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <label className="text-sm font-medium text-foreground">Nome da instância</label>
              <Input
                placeholder="Ex: principal, vendas, suporte"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={50}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use apenas letras, números e hífens. Sem espaços.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
            <Button variant="outline" onClick={() => setNewOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateEvolution} disabled={creating} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Criar e Conectar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Z-API - New Connection Dialog */}
      <Dialog open={zapiNewOpen} onOpenChange={setZapiNewOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 px-6 py-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <Key className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">Nova Conexão — Z-API</h2>
              <p className="text-sm text-white/70">Informe suas credenciais da Z-API</p>
            </div>
            <button onClick={() => setZapiNewOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <label className="text-sm font-medium text-foreground">Nome da conexão</label>
              <Input placeholder="Ex: WhatsApp Vendas" value={zapiLabel} onChange={(e) => setZapiLabel(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Instance ID</label>
              <Input placeholder="Cole o Instance ID da Z-API" value={zapiInstanceId} onChange={(e) => setZapiInstanceId(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Instance Token</label>
              <Input placeholder="Cole o Token da instância" value={zapiInstanceToken} onChange={(e) => setZapiInstanceToken(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Client Token</label>
              <Input placeholder="Cole o Client-Token" value={zapiClientToken} onChange={(e) => setZapiClientToken(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Encontre essas credenciais no painel da Z-API em <strong>Instâncias → Detalhes</strong>
            </p>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
            <Button variant="outline" onClick={() => setZapiNewOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreateZapi} disabled={zapiCreating} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              {zapiCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Salvar e Conectar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Instance Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 px-6 py-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <Pencil className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">Editar Instância</h2>
              <p className="text-sm text-white/70">Atualize o nome da instância</p>
            </div>
            <button onClick={() => setEditOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <label className="text-sm font-medium text-foreground">Nome da instância</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
              <Pencil className="h-4 w-4" /> Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog (shared) */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 px-6 py-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <QrCode className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">Conectar WhatsApp</h2>
              <p className="text-sm text-white/70">
                {qrProvider === "evolution" ? "Evolution API" : "Z-API"} — {qrInstance}
              </p>
            </div>
            <button onClick={() => setQrOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-col items-center gap-5 px-6 py-5">
            <div className="bg-muted/50 rounded-lg px-4 py-3 text-center space-y-1 w-full">
              <p className="text-sm text-foreground">
                Abra o <strong>WhatsApp</strong> no celular
              </p>
              <p className="text-xs text-muted-foreground">
                Toque em <strong>⋮ Menu</strong> → <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong>
              </p>
            </div>
            <div className="w-72 h-72 rounded-2xl border border-border shadow-sm flex items-center justify-center bg-white overflow-hidden">
              {qrLoading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">Gerando QR Code...</p>
                </div>
              ) : qrData ? (
                <img
                  src={qrData.startsWith("data:") ? qrData : qrData.startsWith("http") ? qrData : `data:image/png;base64,${qrData}`}
                  alt="QR Code"
                  className="w-full h-full object-contain p-3"
                />
              ) : (
                <div className="text-center p-4">
                  <QrCode className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">QR Code indisponível</p>
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={refreshQR}>
              <RefreshCw className="h-3.5 w-3.5" /> Atualizar QR Code
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Connections;
