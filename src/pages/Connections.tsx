import { useState, useEffect, useCallback } from "react";
import {
  Smartphone, Plus, QrCode, RefreshCw, Trash2, CheckCircle, XCircle,
  Loader2, Wifi, WifiOff, Search, Key, Globe, Pencil, Signal, X, MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";

import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/db";
import {
  createInstance,
  getQRCode,
  getInstanceStatus,
  setupWebhook,
} from "@/lib/evolution-api";
import { api } from "@/lib/api";

interface MetaConnection {
  id: string;
  label: string;
  phone_number_id: string;
  waba_id?: string;
  display_name?: string;
  verified_name?: string;
  status: string;
  created_at: string;
}

interface Instance {
  instanceName: string;
  status?: string;
  ownerJid?: string;
  profilePicUrl?: string;
}

const Connections = () => {
  // Evolution API state
  const [instances, setInstances] = useState<Instance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Meta WhatsApp Business API state
  const [metaConnections, setMetaConnections] = useState<MetaConnection[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaNewOpen, setMetaNewOpen] = useState(false);
  const [metaLabel, setMetaLabel] = useState("");
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState("");
  const [metaAccessToken, setMetaAccessToken] = useState("");
  const [metaWabaId, setMetaWabaId] = useState("");
  const [metaCreating, setMetaCreating] = useState(false);

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

  const fetchMetaConnections = useCallback(async () => {
    setMetaLoading(true);
    try {
      const data = await api.get('/meta-connections');
      setMetaConnections(data as MetaConnection[]);
    } catch { /* silent */ } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstances();
    fetchMetaConnections();
  }, [fetchInstances, fetchMetaConnections]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchInstances();
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchInstances]);


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

  const refreshQR = () => {
    handleShowEvolutionQR(qrInstance);
  };

  const connectedCount = instances.filter((i) => i.status === "open" || i.status === "connected").length;
  const disconnectedCount = instances.filter((i) => i.status !== "open" && i.status !== "connected").length;

  const filtered = instances.filter((i) =>
    i.instanceName?.toLowerCase().includes(search.toLowerCase())
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
          <Button variant="outline" size="icon" onClick={() => { fetchInstances(); fetchMetaConnections(); }} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
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
              <p className="text-2xl font-bold text-foreground">{instances.length}</p>
              <p className="text-xs text-muted-foreground">Total de conexões</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Wifi className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{connectedCount}</p>
              <p className="text-xs text-muted-foreground">Conectadas</p>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <WifiOff className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{disconnectedCount}</p>
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
            <TabsTrigger value="meta" className="gap-2">
              <MessageSquare className="h-4 w-4" /> WhatsApp Oficial
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

          {/* WhatsApp Oficial (Meta) Tab */}
          <TabsContent value="meta" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">API Oficial do WhatsApp Business (Meta)</p>
                <p className="text-xs text-muted-foreground mt-0.5">Cada número paga seus próprios custos de conversação direto à Meta.</p>
              </div>
              <Button size="sm" className="gap-2" onClick={() => setMetaNewOpen(true)}>
                <Plus className="h-4 w-4" /> Adicionar número
              </Button>
            </div>

            {metaLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : metaConnections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
                <MessageSquare className="h-12 w-12 opacity-20" />
                <p className="text-sm font-medium">Nenhuma conexão configurada</p>
                <p className="text-xs text-center max-w-xs">Configure um número da API Oficial do WhatsApp Business para começar.</p>
                <Button size="sm" variant="outline" className="gap-2 mt-2" onClick={() => setMetaNewOpen(true)}>
                  <Plus className="h-4 w-4" /> Adicionar número
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {metaConnections.map((conn) => (
                  <Card key={conn.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-green-500/10 flex items-center justify-center shrink-0">
                          <MessageSquare className="h-5 w-5 text-green-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{conn.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{conn.display_name || conn.phone_number_id}</p>
                        </div>
                      </div>
                      <Badge className="bg-green-500/20 text-green-600 border-green-500/30 shrink-0 text-[10px]">Ativo</Badge>
                    </div>
                    {conn.verified_name && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" /> {conn.verified_name}
                      </p>
                    )}
                    <div className="text-xs text-muted-foreground font-mono truncate">ID: {conn.phone_number_id}</div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-1.5 text-xs h-8 text-red-600 hover:bg-red-50"
                        onClick={async () => {
                          await api.delete(`/meta-connections/${conn.id}`);
                          setMetaConnections(prev => prev.filter(c => c.id !== conn.id));
                          toast.success('Conexão removida');
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Webhook info */}
            <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-2 mt-2">
              <p className="text-xs font-semibold text-foreground">Como configurar</p>
              <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li>Acesse <strong>developers.facebook.com</strong> e crie um app do tipo "Business"</li>
                <li>Adicione o produto "WhatsApp" ao app e registre seu número</li>
                <li>Gere um token de acesso permanente na seção "WhatsApp &gt; Configuração da API"</li>
                <li>Configure o webhook da Meta com a URL abaixo e o token de verificação</li>
                <li>Cole o Phone Number ID e o Access Token aqui</li>
              </ol>
              <div className="space-y-1.5 pt-1">
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">URL do Webhook</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono select-all block">
                    https://api.msxzap.pro/webhook/meta
                  </code>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Token de Verificação</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded font-mono select-all block">
                    msxcrm_meta_webhook_2026
                  </code>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Meta - New Connection Dialog */}
      <Dialog open={metaNewOpen} onOpenChange={setMetaNewOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
          <div className="bg-green-600 px-6 py-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">WhatsApp Oficial — Meta</h2>
              <p className="text-sm text-white/70">Configure sua conta do WhatsApp Business API</p>
            </div>
            <button onClick={() => setMetaNewOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nome / Rótulo *</label>
              <Input placeholder="Ex: Vendas, Suporte, Principal" value={metaLabel} onChange={(e) => setMetaLabel(e.target.value)} className="mt-1.5" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Phone Number ID *</label>
              <Input placeholder="Ex: 123456789012345" value={metaPhoneNumberId} onChange={(e) => setMetaPhoneNumberId(e.target.value)} className="mt-1.5 font-mono" />
              <p className="text-xs text-muted-foreground mt-1">Encontrado em WhatsApp &gt; Configuração da API no Meta for Developers</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Access Token *</label>
              <Input placeholder="Token permanente da Meta" value={metaAccessToken} onChange={(e) => setMetaAccessToken(e.target.value)} className="mt-1.5 font-mono" type="password" />
              <p className="text-xs text-muted-foreground mt-1">Use um token de acesso permanente (System User token)</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">WABA ID (opcional)</label>
              <Input placeholder="ID da conta do WhatsApp Business" value={metaWabaId} onChange={(e) => setMetaWabaId(e.target.value)} className="mt-1.5 font-mono" />
            </div>
          </div>
          <div className="px-6 pb-6 flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setMetaNewOpen(false)}>Cancelar</Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              disabled={metaCreating || !metaLabel || !metaPhoneNumberId || !metaAccessToken}
              onClick={async () => {
                setMetaCreating(true);
                try {
                  const conn = await api.post('/meta-connections', {
                    label: metaLabel,
                    phone_number_id: metaPhoneNumberId,
                    access_token: metaAccessToken,
                    waba_id: metaWabaId || undefined,
                  });
                  setMetaConnections(prev => [...prev, conn as MetaConnection]);
                  setMetaNewOpen(false);
                  setMetaLabel(''); setMetaPhoneNumberId(''); setMetaAccessToken(''); setMetaWabaId('');
                  toast.success('Conexão adicionada com sucesso!');
                } catch (e: any) {
                  toast.error(e.message || 'Erro ao adicionar conexão');
                } finally {
                  setMetaCreating(false);
                }
              }}
            >
              {metaCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Conectar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                Evolution API — {qrInstance}
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
