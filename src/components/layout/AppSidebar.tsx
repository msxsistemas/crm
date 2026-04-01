import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { usePlatformName } from "@/hooks/usePlatformName";
import {
  BarChart3,
  LayoutDashboard,
  MessageSquare,
  Columns2,
  Contact,
  Smartphone,
  Send,
  Bot,
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
  ClipboardList,
  Workflow,
  FolderOpen,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItemDef {
  to: string;
  icon: any;
  label: string;
  children?: NavItemDef[];
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
      { to: "/dashboard-legado", icon: BarChart3, label: "Dashboard (legado)" },
    ],
  },
  {
    title: "CHATS",
    items: [
      { to: "/inbox", icon: MessageSquare, label: "Chats" },
      { to: "/pesquisar", icon: Search, label: "Pesquisar" },
      { to: "/contatos", icon: Contact, label: "Contatos" },
      { to: "/tarefas", icon: ListTodo, label: "Tarefas" },
      { to: "/agendamentos", icon: CalendarDays, label: "Agendamentos" },
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
        ],
      },
      {
        to: "/crm", icon: Brain, label: "CRM",
        children: [
          { to: "/crm/oportunidades", icon: DollarSign, label: "Oportunidades" },
          { to: "/crm/pipeline", icon: GitBranch, label: "Pipeline" },
          { to: "/crm/produtos", icon: Package, label: "Produtos" },
        ],
      },
    ],
  },
  {
    title: "FERRAMENTAS",
    items: [
      { to: "/tags", icon: Tag, label: "Tags" },
      { to: "/respostas-rapidas", icon: Zap, label: "Respostas Rápidas" },
      { to: "/chat-interno", icon: MessagesSquare, label: "Chat Interno" },
      { to: "/central-ajuda", icon: HelpCircle, label: "Central de Ajuda" },
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
      { to: "/registro-atividades", icon: ClipboardList, label: "Registro de Atividades" },
    ],
  },
  {
    title: "AUTOMAÇÃO",
    items: [
      { to: "/flowbuilder", icon: Workflow, label: "FlowBuilder Nativo" },
      { to: "/agente-ia", icon: Brain, label: "Agente IA" },
      { to: "/gerenciador-arquivos", icon: FolderOpen, label: "Gerenciador de Arquivos" },
    ],
  },
  {
    title: "SISTEMA",
    items: [
      { to: "/configuracoes", icon: Settings, label: "Configurações" },
      { to: "/assinatura", icon: CreditCard, label: "Minha Assinatura" },
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

const AppSidebar = () => {
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

  const renderLeafItem = (item: NavItemDef) => {
    const isActive = location.pathname === item.to;
    const link = (
      <NavLink
        key={item.to}
        to={item.to}
        className={cn(
          "flex items-center gap-3 rounded-l-sm rounded-r-none px-3 py-2 text-sm transition-all border-l-[3px] -mr-2 -ml-1",
          collapsed && "justify-center px-2",
          isActive
            ? "border-l-blue-600 bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[0_1px_4px_0_rgba(0,0,0,0.08)]"
            : "border-l-transparent text-sidebar-foreground hover:bg-sidebar-accent/50"
        )}
      >
        <item.icon className="h-5 w-5 shrink-0 text-blue-600" />
        {!collapsed && <span className="truncate">{item.label}</span>}
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
                {section.items.map(renderNavItem)}
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
