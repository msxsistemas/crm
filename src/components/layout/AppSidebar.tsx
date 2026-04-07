import { useState, useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { usePlatformName } from "@/hooks/usePlatformName";
import { db } from "@/lib/db";
import { api } from "@/lib/api";
import { useSocketEvent } from "@/hooks/useSocketEvent";

// Map from route path patterns to permission keys
const ROUTE_PERMISSION_MAP: Record<string, string> = {
  "/inbox": "inbox",
  "/contatos": "contacts",
  "/tarefas": "tasks",
  "/agendamentos": "schedules",
  "/usuarios": "users",
  "/configuracoes": "settings",
  "/filas-chatbot": "chatbot",
  "/avaliacoes": "reports",
  "/crm": "funnel",
  "/kanban": "funnel",
};
import {
  BarChart3,
  LayoutDashboard,
  MessageSquare,
  Columns2,
  Contact,
  Smartphone,
  Send,
  Brain,
  Users,
  UsersRound,
  Settings,
  CreditCard,
  LogOut,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Store,
  Tag,
  Zap,
  MessagesSquare,
  Search,
  ListTodo,
  CalendarDays,
  LayoutGrid,
  Eye,
  GitBranch,
  DollarSign,
  Package,
  HelpCircle,
  Star,
  ListFilter,
  FolderOpen,
  MonitorCheck,
  ShieldAlert,
  LayoutTemplate,
  TrendingUp,
  FileText,
  Mail,
  Ban,
  Clock,
  Radio,
  GitMerge,
  Shuffle,
  PieChart,
  Bell,
  X,
  FormInput,
  MessageSquarePlus,
  Cloud,
  Timer,
  Shield,
  Grid3x3,
  Repeat,
  Repeat2,
  Trophy,
  Filter,
  Target,
  Link2,
  Flame,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItemDef {
  to: string;
  icon: any;
  label: string;
  children?: NavItemDef[];
  adminOnly?: boolean;
}

interface NavSection {
  title: string;
  items: NavItemDef[];
}

const userNavSections: NavSection[] = [
  {
    title: "PRINCIPAL",
    items: [
      { to: "/", icon: BarChart3, label: "Dashboard" },
    ],
  },
  {
    title: "CHATS",
    items: [
      { to: "/inbox", icon: MessageSquare, label: "Chats" },
      { to: "/foco", icon: Target, label: "Modo Foco" },
      { to: "/message-search", icon: Search, label: "Busca de Mensagens" },
      { to: "/contatos", icon: Contact, label: "Contatos" },
      { to: "/grupos-contatos", icon: UsersRound, label: "Grupos de Contatos" },
      { to: "/tarefas", icon: ListTodo, label: "Tarefas" },
      { to: "/compromissos", icon: CalendarDays, label: "Agenda (Compromissos)" },
      { to: "/agendamentos", icon: CalendarDays, label: "Agendamentos de Atendimento" },
    ],
  },
  {
    title: "",
    items: [
      {
        to: "/kanban", icon: Columns2, label: "Kanban",
        children: [
          { to: "/kanban", icon: Columns2, label: "Kanban" },
          { to: "/kanban/grupos", icon: LayoutGrid, label: "Kanban Grupos" },
          { to: "/kanban/visao-geral", icon: Eye, label: "Kanban Visão Geral" },
          { to: "/kanban/filas", icon: GitBranch, label: "Kanban Filas" },
          { to: "/kanban-conversas", icon: LayoutGrid, label: "Kanban Conversas" },
        ],
      },
      {
        to: "/crm", icon: Brain, label: "CRM",
        children: [
          { to: "/crm/oportunidades", icon: DollarSign, label: "Oportunidades" },
          { to: "/crm/pipeline", icon: GitBranch, label: "Pipeline" },
          { to: "/crm/produtos", icon: Package, label: "Produtos" },
          { to: "/metas", icon: TrendingUp, label: "Metas de Vendas" },
          { to: "/propostas", icon: FileText, label: "Propostas Comerciais" },
          { to: "/financeiro", icon: BarChart3, label: "Financeiro" },
          { to: "/top-leads", icon: Flame, label: "Top Leads" },
        ],
      },
    ],
  },
  {
    title: "FERRAMENTAS",
    items: [
      { to: "/tags", icon: Tag, label: "Tags" },
      { to: "/segmentos-dinamicos", icon: Filter, label: "Segmentação Dinâmica" },
      { to: "/respostas-rapidas", icon: Zap, label: "Respostas Rápidas" },
      { to: "/biblioteca-templates", icon: LayoutTemplate, label: "Biblioteca de Templates" },
      { to: "/chat-interno", icon: MessagesSquare, label: "Chat Interno" },
      { to: "/central-ajuda", icon: HelpCircle, label: "Central de Ajuda" },
      { to: "/deduplicacao", icon: GitMerge, label: "Deduplicação" },
      { to: "/capture-forms", icon: FormInput, label: "Formulários de Captação" },
      { to: "/chat-widget", icon: MessageSquarePlus, label: "Widget de Chat" },
      { to: "/rastrear-links", icon: Link2, label: "Rastreamento de Links" },
    ],
  },
  {
    title: "ADMINISTRAÇÃO",
    items: [
      { to: "/avaliacoes", icon: Star, label: "Avaliações" },
      { to: "/conexoes", icon: Smartphone, label: "Conexões" },
      { to: "/filas-chatbot", icon: ListFilter, label: "Filas & Chatbot" },
      { to: "/categorias", icon: Tag, label: "Categorias" },
      { to: "/usuarios", icon: UsersRound, label: "Equipe" },
      { to: "/auditoria", icon: ShieldCheck, label: "Log de Auditoria (LGPD)", adminOnly: true },
      { to: "/supervisor", icon: MonitorCheck, label: "Central do Supervisor" },
      { to: "/sla", icon: ShieldAlert, label: "Configuração de SLA" },
      { to: "/blacklist", icon: Ban, label: "Lista Negra (Blacklist)" },
      { to: "/horarios-agentes", icon: Clock, label: "Horários dos Agentes" },
    ],
  },
  {
    title: "CAMPANHAS",
    items: [
      { to: "/campanhas", icon: Send, label: "Campanhas" },
      { to: "/campanhas-recorrentes", icon: Repeat2, label: "Campanhas Recorrentes" },
      { to: "/campaigns-dashboard", icon: BarChart3, label: "Métricas de Campanha" },
      { to: "/roi-campanhas", icon: TrendingUp, label: "ROI de Campanhas" },
    ],
  },
  {
    title: "AUTOMAÇÃO",
    items: [
      { to: "/flow-builder", icon: GitBranch, label: "Flow Builder" },
      { to: "/flow-templates", icon: LayoutTemplate, label: "Templates de Atendimento" },
      { to: "/agente-ia", icon: Brain, label: "Agente IA" },
      { to: "/gerenciador-arquivos", icon: FolderOpen, label: "Gerenciador de Arquivos" },
      { to: "/hsm-templates", icon: LayoutTemplate, label: "Templates HSM" },
      { to: "/distribuicao-automatica", icon: Shuffle, label: "Distribuição Automática" },
      { to: "/automations", icon: Zap, label: "Automações" },
    ],
  },
  {
    title: "RELATÓRIOS",
    items: [
      { to: "/relatorios-customizados", icon: PieChart, label: "Builder de Relatórios" },
      { to: "/tags-analytics", icon: Tag, label: "Analytics de Tags" },
      { to: "/agent-report", icon: FileText, label: "Relatório Agente" },
      { to: "/channel-report", icon: Radio, label: "Relatório por Canal" },
      { to: "/sla-dashboard", icon: Timer, label: "Painel SLA" },
      { to: "/sentiment-dashboard", icon: TrendingUp, label: "Análise de Sentimento" },
      { to: "/response-time-report", icon: Clock, label: "Tempo de Atendimento" },
      { to: "/heatmap-report", icon: Grid3x3, label: "Mapa de Calor" },
      { to: "/retention-report", icon: Repeat, label: "Retenção de Clientes" },
      { to: "/gamification", icon: Trophy, label: "Ranking" },
      { to: "/word-cloud", icon: Cloud, label: "Nuvem de Palavras" },
      { to: "/crescimento-contatos", icon: TrendingUp, label: "Crescimento de Contatos" },
      { to: "/minha-produtividade", icon: Target, label: "Minha Produtividade" },
      { to: "/executive-dashboard", icon: LayoutDashboard, label: "Dashboard Executivo" },
      { to: "/relatorio-intencoes", icon: PieChart, label: "Relatório por Intenção" },
    ],
  },
  {
    title: "WHATSAPP",
    items: [
      { to: "/status-whatsapp", icon: Radio, label: "Status do WhatsApp" },
    ],
  },
  {
    title: "SISTEMA",
    items: [
      { to: "/relatorios-agendados", icon: Mail, label: "Relatórios Agendados" },
      { to: "/configuracoes", icon: Settings, label: "Configurações" },
      { to: "/assinatura", icon: CreditCard, label: "Minha Assinatura" },
      { to: "/painel-admin", icon: Shield, label: "Painel Admin", adminOnly: true },
    ],
  },
];

const adminNavSections: NavSection[] = [
  {
    title: "PRINCIPAL",
    items: [
      { to: "/admin", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    title: "GESTÃO",
    items: [
      { to: "/admin/revendedores", icon: Store, label: "Revendedores" },
      { to: "/admin/planos", icon: CreditCard, label: "Planos" },
      { to: "/admin/usuarios", icon: Users, label: "Usuários" },
      { to: "/admin/financeiro", icon: ShieldCheck, label: "Financeiro" },
      { to: "/admin/conexoes", icon: Smartphone, label: "Conexões" },
      { to: "/admin/assinaturas", icon: CreditCard, label: "Assinaturas" },
      { to: "/admin/gateway", icon: CreditCard, label: "Gateway" },
    ],
  },
  {
    title: "ADMINISTRAÇÃO",
    items: [
      { to: "/admin/configuracoes", icon: Settings, label: "Configurações" },
    ],
  },
];

const resellerNavSections: NavSection[] = [
  {
    title: "PRINCIPAL",
    items: [
      { to: "/revenda", icon: LayoutDashboard, label: "Dashboard" },
    ],
  },
  {
    title: "GESTÃO",
    items: [
      { to: "/revenda/subusuarios", icon: Users, label: "Sub-usuários" },
      { to: "/revenda/conexoes", icon: Smartphone, label: "Conexões" },
      { to: "/revenda/marca", icon: Store, label: "Minha Marca" },
    ],
  },
];

interface AppSidebarProps {
  onStartTour?: () => void;
}

const AppSidebar = ({ onStartTour }: AppSidebarProps) => {
  const { user, signOut } = useAuth();
  const { isAdmin, isReseller } = useUserRole();
  const location = useLocation();
  const initial = user?.email?.charAt(0).toUpperCase() || "U";
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved === "true";
  });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const { platformName } = usePlatformName();
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean> | null>(null);

  // Notifications state
  interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    read: boolean;
    created_at: string;
    metadata?: Record<string, unknown>;
  }
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifPanelRef = useRef<HTMLDivElement>(null);

  // Pending conversations badge
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!user || isAdmin || isReseller) return;
    db
      .from("profiles")
      .select("permissions")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.permissions && Object.keys(data.permissions).length > 0) {
          setUserPermissions(data.permissions as Record<string, boolean>);
        }
      });
  }, [user?.id, isAdmin, isReseller]);

  // Fetch notifications every 30s
  useEffect(() => {
    if (!user) return;
    const fetchNotifications = async () => {
      try {
        const data = await api.get('/notifications') as Notification[];
        setNotifications(Array.isArray(data) ? data : []);
      } catch {
        // silently ignore
      }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Fetch pending conversations count every 60s (non-admin users only)
  useEffect(() => {
    if (!user || isAdmin || isReseller) return;
    const fetchPending = async () => {
      try {
        const data = await api.get('/conversations/pending-response/count') as { count: number };
        setPendingCount(data?.count ?? 0);
      } catch {
        // silently ignore
      }
    };
    fetchPending();
    const interval = setInterval(fetchPending, 60000);
    return () => clearInterval(interval);
  }, [user?.id, isAdmin, isReseller]);

  // Refresh pending count when any conversation is updated
  useSocketEvent('conversation:updated', () => {
    if (!user || isAdmin || isReseller) return;
    api.get('/conversations/pending-response/count')
      .then((data: unknown) => setPendingCount((data as { count: number })?.count ?? 0))
      .catch(() => { /* ignore */ });
  }, [user?.id, isAdmin, isReseller]);

  // Close notifications panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (notifPanelRef.current && !notifPanelRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all', {});
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {
      // silently ignore
    }
  };

  const markOneRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`, {});
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {
      // silently ignore
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `há ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `há ${hours}h`;
    const days = Math.floor(hours / 24);
    return `há ${days}d`;
  };

  const isNavItemAllowed = (item: NavItemDef): boolean => {
    // Admin-only items are only visible to admins
    if (item.adminOnly && !isAdmin) return false;
    // Admins and resellers always see everything
    if (isAdmin || isReseller || !userPermissions) return true;
    // Check if this route maps to a permission key
    const permKey = ROUTE_PERMISSION_MAP[item.to];
    if (!permKey) return true; // routes without a permission key are always visible
    return userPermissions[permKey] !== false;
  };

  const navSections = isAdmin
    ? adminNavSections
    : isReseller
      ? resellerNavSections
      : userNavSections;

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  };

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  // Auto-expand groups that contain the active route
  useEffect(() => {
    navSections.forEach(section => {
      section.items.forEach(item => {
        if (item.children) {
          const isChildActive = item.children.some(c => location.pathname === c.to);
          if (isChildActive) {
            setExpandedGroups(prev => ({ ...prev, [item.label]: true }));
          }
        }
      });
    });
  }, [location.pathname]);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light") {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    }
  }, []);

  const renderNavItem = (item: NavItemDef) => {
    // Expandable group item
    if (item.children) {
      const isExpanded = expandedGroups[item.label] ?? false;
      const isChildActive = item.children.some(c => location.pathname === c.to);

      const trigger = (
        <button
          onClick={() => toggleGroup(item.label)}
          className={cn(
            "flex items-center gap-3 rounded-l-sm rounded-r-none px-3 py-2 text-sm transition-all border-l-[3px] -mr-2 -ml-1 w-full",
            collapsed && "justify-center px-2",
            isChildActive
              ? "border-l-blue-600 bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[0_1px_4px_0_rgba(0,0,0,0.08)]"
              : "border-l-transparent text-sidebar-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <item.icon className="h-5 w-5 shrink-0 text-blue-600" />
          {!collapsed && (
            <>
              <span className="truncate flex-1 text-left">{item.label}</span>
              {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
            </>
          )}
        </button>
      );

      if (collapsed) {
        return (
          <Tooltip key={item.label}>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {item.label}
            </TooltipContent>
          </Tooltip>
        );
      }

      return (
        <div key={item.label}>
          {trigger}
          {isExpanded && !collapsed && (
            <div className="ml-6 space-y-0.5 mt-0.5">
              {item.children.map(child => renderLeafItem(child))}
            </div>
          )}
        </div>
      );
    }

    return renderLeafItem(item);
  };

  // Map route paths to data-tour attribute values
  const TOUR_ATTR_MAP: Record<string, string> = {
    "/inbox": "inbox",
    "/contatos": "contacts",
    "/campanhas": "campaigns",
    "/chatbot": "bots",
    "/": "dashboard",
    "/configuracoes": "settings",
  };

  const renderLeafItem = (item: NavItemDef) => {
    const isActive = location.pathname === item.to;
    const tourAttr = TOUR_ATTR_MAP[item.to];
    const isInbox = item.to === '/inbox';
    const showPendingBadge = isInbox && !isAdmin && !isReseller && pendingCount > 0;
    const link = (
      <NavLink
        key={item.to}
        to={item.to}
        {...(tourAttr ? { "data-tour": tourAttr } : {})}
        className={cn(
          "flex items-center gap-3 rounded-l-sm rounded-r-none px-3 py-2 text-sm transition-all border-l-[3px] -mr-2 -ml-1",
          collapsed && "justify-center px-2",
          isActive
            ? "border-l-blue-600 bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[0_1px_4px_0_rgba(0,0,0,0.08)]"
            : "border-l-transparent text-sidebar-foreground hover:bg-sidebar-accent/50"
        )}
      >
        <span className="relative shrink-0">
          <item.icon className="h-5 w-5 text-blue-600" />
          {showPendingBadge && (
            <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[9px] rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5 leading-none">
              {pendingCount > 99 ? '99+' : pendingCount}
            </span>
          )}
        </span>
        {!collapsed && <span className="truncate flex-1">{item.label}</span>}
        {!collapsed && showPendingBadge && (
          <span className="bg-orange-500 text-white text-[9px] rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5 leading-none shrink-0">
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </NavLink>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.to}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }

    return link;
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex h-screen flex-col bg-sidebar transition-all duration-300 shrink-0 border-r border-sidebar-border",
          collapsed ? "w-[68px]" : "w-60"
        )}
      >
        {/* Logo + collapse toggle */}
        <div className="flex items-center justify-between px-3 h-14 border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
              <MessageSquare className="h-3.5 w-3.5 text-sidebar-foreground" />
            </div>
            {!collapsed && (
              <span className="text-lg font-bold text-sidebar-foreground whitespace-nowrap">{platformName}</span>
            )}
          </div>
          <button
            onClick={toggleCollapse}
            className="p-1.5 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors shrink-0"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin space-y-1">
          {navSections.map((section, idx) => (
            <div key={idx}>
              {idx > 0 && !collapsed && (
                <div className="mx-3 my-2 border-t border-sidebar-border" />
              )}
              {idx > 0 && collapsed && (
                <div className="mx-2 my-2 border-t border-sidebar-border" />
              )}
              {section.title && !collapsed && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold tracking-wider text-sidebar-foreground/40 uppercase">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.filter(isNavItemAllowed).map(renderNavItem)}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom user area */}
        <div className="border-t border-sidebar-border/30 p-2">
          <div className={cn("flex items-center", collapsed ? "flex-col gap-2" : "gap-3")}>
            <div className="h-9 w-9 shrink-0 rounded-full bg-sidebar-accent flex items-center justify-center text-sidebar-foreground font-semibold text-sm">
              {initial}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuário"}
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate">{user?.email}</p>
              </div>
            )}
            <div className={cn("flex items-center", collapsed ? "flex-col gap-1" : "gap-1")}>
              {/* Notification Bell */}
              <div className="relative" ref={notifPanelRef}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setNotifOpen(prev => !prev)}
                      className="relative p-2 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                    >
                      <Bell className="h-4 w-4" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5 leading-none">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side={collapsed ? "right" : "top"} className="text-xs">
                    Notificações{unreadCount > 0 ? ` (${unreadCount})` : ''}
                  </TooltipContent>
                </Tooltip>

                {/* Notifications dropdown panel */}
                {notifOpen && (
                  <div className="absolute bottom-10 left-0 z-50 w-80 rounded-xl shadow-lg border border-sidebar-border bg-sidebar text-sidebar-foreground overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-sidebar-border">
                      <span className="text-sm font-semibold">Notificações</span>
                      <div className="flex items-center gap-2">
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllRead}
                            className="text-[11px] text-blue-500 hover:text-blue-400 transition-colors"
                          >
                            Marcar todas como lidas
                          </button>
                        )}
                        <button
                          onClick={() => setNotifOpen(false)}
                          className="p-0.5 rounded text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-sidebar-border/50">
                      {notifications.length === 0 ? (
                        <p className="text-center text-xs text-sidebar-foreground/50 py-8">Nenhuma notificação</p>
                      ) : (
                        notifications.map(n => (
                          <button
                            key={n.id}
                            onClick={() => markOneRead(n.id)}
                            className={cn(
                              "w-full text-left px-4 py-3 hover:bg-sidebar-accent/50 transition-colors",
                              !n.read && "bg-blue-500/5"
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <span className={cn("mt-1.5 shrink-0 h-2 w-2 rounded-full", !n.read ? "bg-blue-500" : "bg-transparent")} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate">{n.title}</p>
                                <p className="text-[11px] text-sidebar-foreground/60 mt-0.5 line-clamp-2">{n.message}</p>
                                <p className="text-[10px] text-sidebar-foreground/40 mt-1">{formatRelativeTime(n.created_at)}</p>
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleTheme}
                    className="p-2 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                  >
                    {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side={collapsed ? "right" : "top"} className="text-xs">
                  {isDark ? "Modo claro" : "Modo escuro"}
                </TooltipContent>
              </Tooltip>
              {onStartTour && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={onStartTour}
                      className="p-2 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                    >
                      <HelpCircle className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side={collapsed ? "right" : "top"} className="text-xs">
                    Ver tour guiado
                  </TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={signOut}
                    className="p-2 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side={collapsed ? "right" : "top"} className="text-xs">
                  Sair
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
};

export default AppSidebar;
