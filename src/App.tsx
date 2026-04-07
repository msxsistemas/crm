import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import InstallPWA from "@/components/InstallPWA";
import OfflineBanner from "@/components/OfflineBanner";
import { Loader2 } from "lucide-react";
import { I18nProvider } from "@/i18n/I18nContext";

// Reseta o ErrorBoundary ao mudar de rota (sem isso, um erro numa página
// deixa o app inteiro preso na tela de erro até o F5)
const RouteErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  });
}

// Lazy imports para melhor performance
const AppLayout = lazy(() => import("./components/layout/AppLayout"));
const Index = lazy(() => import("./pages/Index"));
const Inbox = lazy(() => import("./pages/Inbox"));
const SalesFunnel = lazy(() => import("./pages/SalesFunnel"));
const Contacts = lazy(() => import("./pages/Contacts"));
const Campaigns = lazy(() => import("./pages/Campaigns"));
const Bots = lazy(() => import("./pages/Bots"));
const AIAgent = lazy(() => import("./pages/AIAgent"));
const ChatbotPage = lazy(() => import("./pages/Chatbot"));
const Settings = lazy(() => import("./pages/Settings"));
const Connections = lazy(() => import("./pages/Connections"));
const UsersPage = lazy(() => import("./pages/Users"));
const SubscriptionPage = lazy(() => import("./pages/Subscription"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminResellers = lazy(() => import("./pages/admin/AdminResellers"));
const AdminPlans = lazy(() => import("./pages/admin/AdminPlans"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminFinance = lazy(() => import("./pages/admin/AdminFinance"));
const AdminConnections = lazy(() => import("./pages/admin/AdminConnections"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminGateway = lazy(() => import("./pages/admin/AdminGateway"));
const AdminSubscriptions = lazy(() => import("./pages/admin/AdminSubscriptions"));
const ResellerDashboard = lazy(() => import("./pages/ResellerDashboard"));
const ResellerSubUsers = lazy(() => import("./pages/reseller/ResellerSubUsers"));
const ResellerConnections = lazy(() => import("./pages/reseller/ResellerConnections"));
const ResellerBranding = lazy(() => import("./pages/reseller/ResellerBranding"));
const Login = lazy(() => import("./pages/Login"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const ResellerLogin = lazy(() => import("./pages/ResellerLogin"));
const Register = lazy(() => import("./pages/Register"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Tags = lazy(() => import("./pages/Tags"));
const Categories = lazy(() => import("./pages/Categories"));
const QuickReplies = lazy(() => import("./pages/QuickReplies"));
const InternalChat = lazy(() => import("./pages/InternalChat"));
const NotFound = lazy(() => import("./pages/NotFound"));
const DashboardLegacy = lazy(() => import("./pages/DashboardLegacy"));
const SearchPage = lazy(() => import("./pages/Search"));
const Tasks = lazy(() => import("./pages/Tasks"));
const TopLeads = lazy(() => import("./pages/TopLeads"));
const Schedules = lazy(() => import("./pages/Schedules"));
const KanbanGroups = lazy(() => import("./pages/KanbanGroups"));
const KanbanOverview = lazy(() => import("./pages/KanbanOverview"));
const KanbanQueues = lazy(() => import("./pages/KanbanQueues"));
const Opportunities = lazy(() => import("./pages/Opportunities"));
const Pipeline = lazy(() => import("./pages/Pipeline"));
const Products = lazy(() => import("./pages/Products"));
const HelpCenter = lazy(() => import("./pages/HelpCenter"));
const Reviews = lazy(() => import("./pages/Reviews"));
const QueuesChatbot = lazy(() => import("./pages/QueuesChatbot"));
const ActivityLog = lazy(() => import("./pages/ActivityLog"));
const FlowBuilder = lazy(() => import("./pages/FlowBuilder"));
const FlowBuilderVisual = lazy(() => import("./pages/FlowBuilderVisual"));
const FileManager = lazy(() => import("./pages/FileManager"));
const Reports = lazy(() => import("./pages/Reports"));
const WebhookLogs = lazy(() => import("./pages/WebhookLogs"));
const Segments = lazy(() => import("./pages/Segments"));
const SupervisorDashboard = lazy(() => import("./pages/SupervisorDashboard"));
const SLAConfig = lazy(() => import("./pages/SLAConfig"));
const HSMTemplates = lazy(() => import("./pages/HSMTemplates"));
const ContactTimeline = lazy(() => import("./pages/ContactTimeline"));
const ContactGroups = lazy(() => import("./pages/ContactGroups"));
const AuditLog = lazy(() => import("./pages/AuditLog"));
const SalesGoals = lazy(() => import("./pages/SalesGoals"));
const Proposals = lazy(() => import("./pages/Proposals"));
const ScheduledReports = lazy(() => import("./pages/ScheduledReports"));
const FinancialReport = lazy(() => import("./pages/FinancialReport"));
const BlacklistPage = lazy(() => import("./pages/Blacklist"));
const AgentSchedulesPage = lazy(() => import("./pages/AgentSchedules"));
const FlowTemplates = lazy(() => import("./pages/FlowTemplates"));
const WhatsAppStatusPage = lazy(() => import("./pages/WhatsAppStatus"));
const Deduplication = lazy(() => import("./pages/Deduplication"));
const ContactForms = lazy(() => import("./pages/ContactForms"));
const PublicContactForm = lazy(() => import("./pages/PublicContactForm"));
const CaptureFormBuilder = lazy(() => import("./pages/CaptureFormBuilder"));
const PublicCaptureForm = lazy(() => import("./pages/PublicCaptureForm"));
const AgentReport = lazy(() => import("./pages/AgentReport"));
const AutoDistribution = lazy(() => import("./pages/AutoDistribution"));
const CustomReports = lazy(() => import("./pages/CustomReports"));
const KanbanConversas = lazy(() => import("./pages/Kanban"));
const ContactProfile = lazy(() => import("./pages/ContactProfile"));
const TagsAnalytics = lazy(() => import("./pages/TagsAnalytics"));
const CampaignsDashboard = lazy(() => import("./pages/CampaignsDashboard"));
const AppointmentsPage = lazy(() => import("./pages/Appointments"));
const ChatWidgetConfig = lazy(() => import("./pages/ChatWidgetConfig"));
const ChannelReport = lazy(() => import("./pages/ChannelReport"));
const Automations = lazy(() => import("./pages/Automations"));
const SLADashboard = lazy(() => import("./pages/SLADashboard"));
const MessageSearch = lazy(() => import("./pages/MessageSearch"));
const SentimentDashboard = lazy(() => import("./pages/SentimentDashboard"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const ResponseTimeReport = lazy(() => import("./pages/ResponseTimeReport"));
const HeatmapReport = lazy(() => import("./pages/HeatmapReport"));
const RetentionReport = lazy(() => import("./pages/RetentionReport"));
const Gamification = lazy(() => import("./pages/Gamification"));
const StatusPage = lazy(() => import("./pages/StatusPage"));
const WordCloud = lazy(() => import("./pages/WordCloud"));
const PublicAgentProfile = lazy(() => import("./pages/PublicAgentProfile"));
const ContactSegments = lazy(() => import("./pages/ContactSegments"));
const ContactGrowth = lazy(() => import("./pages/ContactGrowth"));
const RecurringCampaigns = lazy(() => import("./pages/RecurringCampaigns"));
const MyProductivity = lazy(() => import("./pages/MyProductivity"));
const SurveyResponse = lazy(() => import("./pages/SurveyResponse"));
const LinkTracker = lazy(() => import("./pages/LinkTracker"));
const TelegramBots = lazy(() => import("./pages/TelegramBots"));
const TemplateLibrary = lazy(() => import("./pages/TemplateLibrary"));
const CampaignROI = lazy(() => import("./pages/CampaignROI"));
const FocusMode = lazy(() => import("./pages/FocusMode"));
const ExecutiveDashboard = lazy(() => import("./pages/ExecutiveDashboard"));
const IntentReport = lazy(() => import("./pages/IntentReport"));
const GoogleCalendarCallback = lazy(() => import("./pages/GoogleCalendarCallback"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 60_000,       // 1 min before considering data stale
      gcTime: 5 * 60_000,      // 5 min cache retention
      refetchOnWindowFocus: false,
    },
  },
});

const PageLoader = () => (
  <div className="flex h-screen items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <I18nProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <InstallPWA />
        <OfflineBanner />
        <BrowserRouter>
          <AuthProvider>
            <RouteErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/admin/login" element={<AdminLogin />} />
                  <Route path="/revenda/login" element={<ResellerLogin />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/forgot-password" element={<ForgotPassword />} />
                  <Route
                    element={
                      <ProtectedRoute requiredRole="user">
                        <AppLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/" element={<Index />} />
                    <Route path="/dashboard-legado" element={<DashboardLegacy />} />
                    <Route path="/inbox" element={<Inbox />} />
                    <Route path="/pesquisar" element={<SearchPage />} />
                    <Route path="/kanban" element={<SalesFunnel />} />
                    <Route path="/kanban/grupos" element={<KanbanGroups />} />
                    <Route path="/kanban/visao-geral" element={<KanbanOverview />} />
                    <Route path="/kanban/filas" element={<KanbanQueues />} />
                    <Route path="/contatos" element={<Contacts />} />
                    <Route path="/top-leads" element={<TopLeads />} />
                    <Route path="/tarefas" element={<Tasks />} />
                    <Route path="/compromissos" element={<AppointmentsPage />} />
                    <Route path="/agendamentos" element={<Schedules />} />
                    <Route path="/conexoes" element={<Connections />} />
                    <Route path="/campanhas" element={<Campaigns />} />
                    <Route path="/agente-ia" element={<AIAgent />} />
                    <Route path="/chatbot" element={<ChatbotPage />} />
                    <Route path="/crm" element={<Navigate to="/crm/oportunidades" replace />} />
                    <Route path="/crm/oportunidades" element={<Opportunities />} />
                    <Route path="/crm/pipeline" element={<Pipeline />} />
                    <Route path="/crm/produtos" element={<Products />} />
                    <Route path="/usuarios" element={<UsersPage />} />
                    <Route path="/tags" element={<Tags />} />
                    <Route path="/categorias" element={<Categories />} />
                    <Route path="/configuracoes" element={<Settings />} />
                    <Route path="/assinatura" element={<SubscriptionPage />} />
                    <Route path="/respostas-rapidas" element={<QuickReplies />} />
                    <Route path="/chat-interno" element={<InternalChat />} />
                    <Route path="/central-ajuda" element={<HelpCenter />} />
                    <Route path="/avaliacoes" element={<Reviews />} />
                    <Route path="/filas-chatbot" element={<QueuesChatbot />} />
                    <Route path="/registro-atividades" element={<ActivityLog />} />
                    <Route path="/flowbuilder" element={<FlowBuilder />} />
                    <Route path="/flow-builder" element={<FlowBuilderVisual />} />
                    <Route path="/gerenciador-arquivos" element={<FileManager />} />
                    <Route path="/relatorios" element={<Reports />} />
                    <Route path="/logs-webhook" element={<WebhookLogs />} />
                    <Route path="/segmentos" element={<Segments />} />
                    <Route path="/supervisor" element={<SupervisorDashboard />} />
                    <Route path="/sla" element={<SLAConfig />} />
                    <Route path="/contatos/:contactId/timeline" element={<ContactTimeline />} />
                    <Route path="/grupos-contatos" element={<ContactGroups />} />
                    <Route path="/auditoria" element={<AuditLog />} />
                    <Route path="/hsm-templates" element={<HSMTemplates />} />
                    <Route path="/metas" element={<SalesGoals />} />
                    <Route path="/propostas" element={<Proposals />} />
                    <Route path="/relatorios-agendados" element={<ScheduledReports />} />
                    <Route path="/financeiro" element={<FinancialReport />} />
                    <Route path="/blacklist" element={<BlacklistPage />} />
                    <Route path="/horarios-agentes" element={<AgentSchedulesPage />} />
                    <Route path="/flow-templates" element={<FlowTemplates />} />
                    <Route path="/status-whatsapp" element={<WhatsAppStatusPage />} />
                    <Route path="/deduplicacao" element={<Deduplication />} />
                    <Route path="/formularios-captacao" element={<ContactForms />} />
                    <Route path="/distribuicao-automatica" element={<AutoDistribution />} />
                    <Route path="/relatorios-customizados" element={<CustomReports />} />
                    <Route path="/kanban-conversas" element={<KanbanConversas />} />
                    <Route path="/bots" element={<Bots />} />
                    <Route path="/contatos/:id/profile" element={<ContactProfile />} />
                    <Route path="/tags-analytics" element={<TagsAnalytics />} />
                    <Route path="/campaigns-dashboard" element={<CampaignsDashboard />} />
                    <Route path="/capture-forms" element={<CaptureFormBuilder />} />
                    <Route path="/agent-report" element={<AgentReport />} />
                    <Route path="/chat-widget" element={<ChatWidgetConfig />} />
                    <Route path="/channel-report" element={<ChannelReport />} />
                    <Route path="/automations" element={<Automations />} />
                    <Route path="/sla-dashboard" element={<SLADashboard />} />
                    <Route path="/message-search" element={<MessageSearch />} />
                    <Route path="/sentiment-dashboard" element={<SentimentDashboard />} />
                    <Route path="/painel-admin" element={<AdminPanel />} />
                    <Route path="/response-time-report" element={<ResponseTimeReport />} />
                    <Route path="/heatmap-report" element={<HeatmapReport />} />
                    <Route path="/retention-report" element={<RetentionReport />} />
                    <Route path="/gamification" element={<Gamification />} />
                    <Route path="/word-cloud" element={<WordCloud />} />
                    <Route path="/segmentos-dinamicos" element={<ContactSegments />} />
                    <Route path="/crescimento-contatos" element={<ContactGrowth />} />
                    <Route path="/campanhas-recorrentes" element={<RecurringCampaigns />} />
                    <Route path="/minha-produtividade" element={<MyProductivity />} />
                    <Route path="/rastrear-links" element={<LinkTracker />} />
                    <Route path="/telegram-bots" element={<TelegramBots />} />
                    <Route path="/biblioteca-templates" element={<TemplateLibrary />} />
                    <Route path="/roi-campanhas" element={<CampaignROI />} />
                    <Route path="/executive-dashboard" element={<ExecutiveDashboard />} />
                    <Route path="/relatorio-intencoes" element={<IntentReport />} />
                  </Route>
                  {/* Google Calendar callback — standalone, sem AppLayout */}
                  <Route
                    path="/google-calendar/callback"
                    element={
                      <ProtectedRoute requiredRole="user">
                        <Suspense fallback={<PageLoader />}>
                          <GoogleCalendarCallback />
                        </Suspense>
                      </ProtectedRoute>
                    }
                  />
                  {/* Modo Foco — standalone, sem AppLayout */}
                  <Route
                    path="/foco"
                    element={
                      <ProtectedRoute requiredRole="user">
                        <FocusMode />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    element={
                      <ProtectedRoute requiredRole="admin">
                        <AppLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/admin/revendedores" element={<AdminResellers />} />
                    <Route path="/admin/planos" element={<AdminPlans />} />
                    <Route path="/admin/usuarios" element={<AdminUsers />} />
                    <Route path="/admin/financeiro" element={<AdminFinance />} />
                    <Route path="/admin/conexoes" element={<AdminConnections />} />
                    <Route path="/admin/assinaturas" element={<AdminSubscriptions />} />
                    <Route path="/admin/gateway" element={<AdminGateway />} />
                    <Route path="/admin/configuracoes" element={<AdminSettings />} />
                  </Route>
                  <Route
                    element={
                      <ProtectedRoute requiredRole="reseller">
                        <AppLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route path="/revenda" element={<ResellerDashboard />} />
                    <Route path="/revenda/subusuarios" element={<ResellerSubUsers />} />
                    <Route path="/revenda/conexoes" element={<ResellerConnections />} />
                    <Route path="/revenda/marca" element={<ResellerBranding />} />
                  </Route>
                  <Route path="/form/:slug" element={<PublicContactForm />} />
                  <Route path="/f/:slug" element={<PublicCaptureForm />} />
                  <Route path="/agente/:id" element={<PublicAgentProfile />} />
                  <Route path="/status" element={<StatusPage />} />
                  <Route path="/pesquisa/:surveyId" element={<SurveyResponse />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </RouteErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
      </I18nProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
