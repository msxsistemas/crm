import { useState, useEffect, useCallback, useRef } from "react";
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
  MessageCircle,
  Send,
  Info,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { useFollowupReminders } from "@/hooks/useFollowupReminders";
import { FollowupPanel } from "@/components/followup/FollowupPanel";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

type UserStatus = "online" | "ausente" | "offline";

interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  link: string | null;
  created_at: string;
}

const statusConfig: Record<UserStatus, { label: string; color: string }> = {
  online: { label: "Online", color: "text-green-500" },
  ausente: { label: "Ausente", color: "text-yellow-500" },
  offline: { label: "Offline", color: "text-red-500" },
};

const notifTypeIcon = (type: string) => {
  switch (type) {
    case "new_conversation":
      return <MessageSquare className="h-4 w-4 text-blue-500 shrink-0" />;
    case "task_due":
      return <Bell className="h-4 w-4 text-yellow-500 shrink-0" />;
    case "campaign_done":
      return <Send className="h-4 w-4 text-green-500 shrink-0" />;
    case "message_received":
      return <MessageCircle className="h-4 w-4 text-purple-500 shrink-0" />;
    default:
      return <Info className="h-4 w-4 text-gray-400 shrink-0" />;
  }
};

interface TopBarProps {
  onStartTour?: () => void;
}

const TopBar = ({ onStartTour }: TopBarProps) => {
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

  // Notification states
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);

  // Follow-up reminders
  const [followupOpen, setFollowupOpen] = useState(false);
  const {
    reminders: followupReminders,
    loading: followupLoading,
    dueTodayCount,
    updateReminderStatus,
  } = useFollowupReminders();

  const prevUnreadRef = useRef(0);
  const prevWaitingRef = useRef(0);

  const unreadNotifCount = notifications.filter(n => !n.read).length;

  // Measure real latency with a lightweight ping
  const measureLatency = useCallback(async () => {
    const start = performance.now();
    const { error } = await supabase.from("profiles").select("id", { count: "exact", head: true }).limit(1);
    const elapsed = Math.round(performance.now() - start);
    setLatencyMs(elapsed);
    setApiStatus(error ? 'disconnected' : 'connected');
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }, []);

  const sendBrowserNotification = useCallback((title: string, body: string) => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;
    new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: "crm-notification",
    });
  }, []);

  // Load notifications from DB
  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setNotifLoading(true);
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications((data as AppNotification[]) || []);
    setNotifLoading(false);
  }, [user]);

  // Open/close handler — load when opening
  useEffect(() => {
    if (notifOpen) {
      loadNotifications();
    }
  }, [notifOpen, loadNotifications]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("topbar-notifications")
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: { new: AppNotification }) => {
          const newNotif = payload.new as AppNotification;
          setNotifications(prev => [newNotif, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Mark a single notification as read
  const markAsRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase
      .from("notifications")
      .update({ read: true } as any)
      .eq("id", id);
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    await supabase
      .from("notifications")
      .update({ read: true } as any)
      .eq("user_id", user.id)
      .eq("read", false);
  }, [user]);

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
    requestNotificationPermission();
    // Ping latency every 30s
    const interval = setInterval(measureLatency, 30000);
    return () => clearInterval(interval);
  }, [fetchData, measureLatency, requestNotificationPermission]);

  // Browser notifications + DB insert when unread/waiting count increases
  useEffect(() => {
    const prevUnread = prevUnreadRef.current;
    const prevWaiting = prevWaitingRef.current;

    if (unreadConversations > prevUnread) {
      sendBrowserNotification(
        "Nova mensagem não lida",
        `Você tem ${unreadConversations} conversa(s) com mensagens não lidas`
      );
      // Insert DB notification
      if (user) {
        supabase.from("notifications").insert({
          user_id: user.id,
          type: "new_conversation",
          title: "Nova mensagem recebida",
          body: `${unreadConversations} conversa(s) aguardando resposta`,
          link: "/inbox",
        } as any);
      }
    } else if (waitingConversations > prevWaiting) {
      sendBrowserNotification(
        "Nova conversa aguardando",
        `${waitingConversations} conversa(s) aguardando atendimento`
      );
    }

    prevUnreadRef.current = unreadConversations;
    prevWaitingRef.current = waitingConversations;
  }, [unreadConversations, waitingConversations, sendBrowserNotification, user]);

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

  const displayName = fullName || user?.email?.split("@")[0] || "Usuário";

  // Badge count: show higher of unread notifications vs conversation count, or sum
  const bellBadgeCount = unreadNotifCount + (unreadConversations + waitingConversations);

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

        {/* Follow-up reminders panel */}
        <FollowupPanel
          open={followupOpen}
          onOpenChange={setFollowupOpen}
          reminders={followupReminders}
          loading={followupLoading}
          dueTodayCount={dueTodayCount}
          onComplete={id => updateReminderStatus(id, "completed")}
          onDismiss={id => updateReminderStatus(id, "dismissed")}
        />

        {/* Tour guide button */}
        {onStartTour && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onStartTour}
                className="hover:text-white/80 transition-colors p-1"
              >
                <HelpCircle className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Ver tour guiado</TooltipContent>
          </Tooltip>
        )}

        {/* Notifications bell with dropdown */}
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger asChild>
            <button data-tour="notifications" className="hover:text-white/80 transition-colors p-1 relative">
              <Bell className="h-[18px] w-[18px]" />
              {bellBadgeCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {bellBadgeCount > 99 ? "99+" : bellBadgeCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            className="w-80 p-0 max-h-[500px] overflow-y-auto"
            sideOffset={8}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-background z-10">
              <span className="font-semibold text-sm">Notificações</span>
              {unreadNotifCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            {/* Body */}
            <div className="divide-y">
              {notifLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma notificação
                </div>
              ) : (
                notifications.map(notif => (
                  <button
                    key={notif.id}
                    onClick={async () => {
                      if (!notif.read) await markAsRead(notif.id);
                      if (notif.link) {
                        setNotifOpen(false);
                        navigate(notif.link);
                      }
                    }}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-colors ${!notif.read ? "bg-blue-50 dark:bg-blue-950/20" : ""}`}
                  >
                    {/* Type icon */}
                    <div className="mt-0.5">{notifTypeIcon(notif.type)}</div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug truncate ${!notif.read ? "font-semibold" : "font-normal"}`}>
                        {notif.title}
                      </p>
                      {notif.body && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{notif.body}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>

                    {/* Unread dot */}
                    {!notif.read && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

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
