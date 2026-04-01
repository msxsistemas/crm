import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformName } from "@/hooks/usePlatformName";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Wifi,
  WifiOff,
  Bell,
  Volume2,
  VolumeX,
  RefreshCw,
  UserCircle,
  Sun,
  Moon,
  MessageSquare,
  FileText,
  Type,
} from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type UserStatus = "online" | "ausente" | "offline";

const statusConfig: Record<UserStatus, { label: string; color: string }> = {
  online: { label: "Online", color: "text-green-500" },
  ausente: { label: "Ausente", color: "text-yellow-500" },
  offline: { label: "Offline", color: "text-red-500" },
};

const TopBar = () => {
  const { user } = useAuth();
  const { platformName } = usePlatformName();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [fullName, setFullName] = useState("");
  const [status, setStatus] = useState<UserStatus>("online");
  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem("sound-enabled") !== "false";
  });
  const [connectionCount, setConnectionCount] = useState(0);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [unreadConversations, setUnreadConversations] = useState(0);
  const [waitingConversations, setWaitingConversations] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [socketStatus, setSocketStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [apiStatus, setApiStatus] = useState<'connected' | 'disconnected'>('disconnected');

  // Measure real latency with a lightweight ping
  const measureLatency = useCallback(async () => {
    const start = performance.now();
    const { error } = await supabase.from("profiles").select("id", { count: "exact", head: true }).limit(1);
    const elapsed = Math.round(performance.now() - start);
    setLatencyMs(elapsed);
    setApiStatus(error ? 'disconnected' : 'connected');
  }, []);

  // Fetch profile & connections
  const fetchData = useCallback(async () => {
    if (!user) return;

    const [profileRes, evoRes, zapiRes, cloudRes, unreadRes, waitingRes] = await Promise.all([
      supabase.from("profiles").select("full_name, status").eq("id", user.id).maybeSingle(),
      supabase.from("evolution_connections").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "open"),
      supabase.from("zapi_connections").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("connected", true),
      supabase.from("whatsapp_cloud_connections").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "active"),
      supabase.from("conversations").select("id", { count: "exact", head: true }).gt("unread_count", 0),
      supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "open"),
    ]);

    if (profileRes.data?.full_name) setFullName(profileRes.data.full_name);
    if (profileRes.data?.status) setStatus(profileRes.data.status as UserStatus);
    setConnectionCount((evoRes.count ?? 0) + (zapiRes.count ?? 0) + (cloudRes.count ?? 0));
    setUnreadConversations(unreadRes.count ?? 0);
    setWaitingConversations(waitingRes.count ?? 0);
  }, [user]);

  useEffect(() => {
    fetchData();
    measureLatency();
    // Ping latency every 30s
    const interval = setInterval(measureLatency, 30000);
    return () => clearInterval(interval);
  }, [fetchData, measureLatency]);

  // Realtime unread updates + socket status detection
  useEffect(() => {
    const channel = supabase
      .channel("topbar-unread")
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "conversations" }, () => {
        fetchData();
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setSocketStatus('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setSocketStatus('disconnected');
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const handleStatusChange = async (newStatus: UserStatus) => {
    setIsChangingStatus(true);
    setStatus(newStatus);
    localStorage.setItem("user-status", newStatus);

    try {
      // Persist to DB
      if (user) {
        await supabase.from("profiles").update({ status: newStatus } as any).eq("id", user.id);
      }

      // Sync presence to WhatsApp (Evolution API)
      const { data: evoConns } = await supabase
        .from("evolution_connections")
        .select("instance_name")
        .eq("user_id", user?.id ?? "")
        .eq("status", "open");

      if (evoConns && evoConns.length > 0) {
        const presence = newStatus === "online" ? "available" : "unavailable";
        await Promise.all(
          evoConns.map((conn) =>
            supabase.functions.invoke("evolution-api", {
              body: { action: "set_presence", instanceName: conn.instance_name, data: { presence } },
            })
          )
        );
      }

      toast.success(`Status alterado para ${statusConfig[newStatus].label}`);
    } catch (err) {
      console.warn("Falha ao sincronizar presença WhatsApp:", err);
      toast.error("Erro ao sincronizar status");
    } finally {
      setIsChangingStatus(false);
    }
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem("sound-enabled", String(next));
    toast.success(next ? "Sons ativados" : "Sons desativados");
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchData();
    setTimeout(() => setIsRefreshing(false), 600);
    toast.success("Dados atualizados");
  };

  const handleNotifications = () => {
    navigate("/inbox");
  };

  const handleProfile = () => {
    navigate("/configuracoes");
  };

  const handleConnections = () => {
    navigate("/conexoes");
  };

  const displayName = fullName || user?.email?.split("@")[0] || "Usuário";

  return (
    <div className="h-14 bg-blue-600 flex items-center justify-between px-6 text-white text-sm shrink-0 select-none">
      {/* Left: Greeting */}
      <span className="truncate font-medium">
        Olá {displayName}, Seja bem vindo(a) a plataforma {platformName}!
      </span>

      {/* Right: Icons */}
      <div className="flex items-center gap-3 shrink-0 ml-6">
        {/* Connection status + latency */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 hover:text-white/80 transition-colors bg-white/10 rounded-md px-2.5 py-1">
              {connectionCount > 0 ? (
                <>
                  <Wifi className="h-4 w-4 text-green-300" />
                  {latencyMs !== null && (
                    <span className="text-[11px] text-green-200 font-medium">{latencyMs}ms</span>
                  )}
                </>
              ) : (
                <WifiOff className="h-4 w-4 text-red-300" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px] p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Latência Atual:</span>
              <span className={`font-semibold ${latencyMs !== null && latencyMs < 300 ? 'text-green-500' : latencyMs !== null && latencyMs < 800 ? 'text-yellow-500' : 'text-red-500'}`}>
                {latencyMs !== null ? `${latencyMs}ms — ${latencyMs < 300 ? 'Boa' : latencyMs < 800 ? 'Média' : 'Alta'}` : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Status API:</span>
              <span className={`font-semibold px-2 py-0.5 rounded text-white text-[10px] ${apiStatus === 'connected' ? 'bg-green-600' : 'bg-red-500'}`}>
                {apiStatus === 'connected' ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Status Socket:</span>
              <span className={`font-semibold px-2 py-0.5 rounded text-white text-[10px] ${socketStatus === 'connected' ? 'bg-green-600' : socketStatus === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'}`}>
                {socketStatus === 'connected' ? 'Conectado' : socketStatus === 'connecting' ? 'Conectando...' : 'Desconectado'}
              </span>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 bg-white/20" />

        {/* Theme toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="hover:text-white/80 transition-colors p-1">
              {theme === "dark" ? (
                <Sun className="h-[18px] w-[18px]" />
              ) : (
                <Moon className="h-[18px] w-[18px]" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{theme === "dark" ? "Modo claro" : "Modo noturno"}</TooltipContent>
        </Tooltip>

        {/* Sound toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={toggleSound} className="hover:text-white/80 transition-colors p-1">
              {soundEnabled ? (
                <Volume2 className="h-[18px] w-[18px]" />
              ) : (
                <VolumeX className="h-[18px] w-[18px] text-white/50" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{soundEnabled ? "Desativar sons" : "Ativar sons"}</TooltipContent>
        </Tooltip>

        {/* Refresh */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={handleRefresh} className="hover:text-white/80 transition-colors p-1">
              <RefreshCw className={`h-[18px] w-[18px] ${isRefreshing ? "animate-spin" : ""}`} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Atualizar dados</TooltipContent>
        </Tooltip>

        {/* Inbox / Messages with badge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={handleNotifications} className="hover:text-white/80 transition-colors p-1 relative">
              <MessageSquare className="h-[18px] w-[18px]" />
              {(unreadConversations + waitingConversations) > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] font-bold h-[18px] min-w-[18px] flex items-center justify-center rounded-full px-1">
                  {(unreadConversations + waitingConversations) > 99 ? "99+" : (unreadConversations + waitingConversations)}
                </span>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {(unreadConversations + waitingConversations) > 0 
              ? `${unreadConversations} não lida(s), ${waitingConversations} aguardando` 
              : "Sem mensagens pendentes"}
          </TooltipContent>
        </Tooltip>

        {/* Notifications bell */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="hover:text-white/80 transition-colors p-1">
              <Bell className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Notificações</TooltipContent>
        </Tooltip>

        {/* Files */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="hover:text-white/80 transition-colors p-1">
              <FileText className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Arquivos</TooltipContent>
        </Tooltip>

        {/* Typography / Text */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="hover:text-white/80 transition-colors p-1">
              <Type className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Formatação</TooltipContent>
        </Tooltip>

        <div className="w-px h-5 bg-white/20" />

        {/* Profile */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={handleProfile} className="hover:text-white/80 transition-colors p-1">
              <UserCircle className="h-[18px] w-[18px]" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Meu perfil</TooltipContent>
        </Tooltip>

        {/* Status dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 hover:text-white/80 transition-colors p-1" disabled={isChangingStatus}>
              {isChangingStatus ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span className={`h-3.5 w-3.5 rounded-full border-2 border-white ${status === 'online' ? 'bg-green-500' : status === 'ausente' ? 'bg-yellow-500' : 'bg-red-500'}`} />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[120px]">
            {(Object.keys(statusConfig) as UserStatus[]).map((key) => (
              <DropdownMenuItem
                key={key}
                onClick={() => handleStatusChange(key)}
                className="flex items-center gap-2 text-xs"
              >
                <span className={`h-3.5 w-3.5 rounded-full border-2 border-white ${key === 'online' ? 'bg-green-500' : key === 'ausente' ? 'bg-yellow-500' : 'bg-red-500'}`} />
                {statusConfig[key].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default TopBar;
