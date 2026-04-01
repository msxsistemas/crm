import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "./components/layout/AppLayout";
import Index from "./pages/Index";
import Inbox from "./pages/Inbox";
import SalesFunnel from "./pages/SalesFunnel";
import Contacts from "./pages/Contacts";
import Campaigns from "./pages/Campaigns";
import Bots from "./pages/Bots";
import AIAgent from "./pages/AIAgent";
import ChatbotPage from "./pages/Chatbot";
import Settings from "./pages/Settings";
import Connections from "./pages/Connections";
import UsersPage from "./pages/Users";
import SubscriptionPage from "./pages/Subscription";
import AdminDashboard from "./pages/AdminDashboard";
import AdminResellers from "./pages/admin/AdminResellers";
import AdminPlans from "./pages/admin/AdminPlans";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminFinance from "./pages/admin/AdminFinance";
import AdminConnections from "./pages/admin/AdminConnections";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminGateway from "./pages/admin/AdminGateway";
import AdminSubscriptions from "./pages/admin/AdminSubscriptions";
import ResellerDashboard from "./pages/ResellerDashboard";
import ResellerSubUsers from "./pages/reseller/ResellerSubUsers";
import ResellerConnections from "./pages/reseller/ResellerConnections";
import ResellerBranding from "./pages/reseller/ResellerBranding";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import ResellerLogin from "./pages/ResellerLogin";
import Register from "./pages/Register";
import ResetPassword from "./pages/ResetPassword";
import Tags from "./pages/Tags";
import Categories from "./pages/Categories";
import QuickReplies from "./pages/QuickReplies";
import InternalChat from "./pages/InternalChat";
import NotFound from "./pages/NotFound";
// New pages
import DashboardLegacy from "./pages/DashboardLegacy";
import SearchPage from "./pages/Search";
import Tasks from "./pages/Tasks";
import Schedules from "./pages/Schedules";
import KanbanGroups from "./pages/KanbanGroups";
import KanbanOverview from "./pages/KanbanOverview";
import KanbanQueues from "./pages/KanbanQueues";
import Opportunities from "./pages/Opportunities";
import Pipeline from "./pages/Pipeline";
import Products from "./pages/Products";
import HelpCenter from "./pages/HelpCenter";
import Reviews from "./pages/Reviews";
import QueuesChatbot from "./pages/QueuesChatbot";
import ActivityLog from "./pages/ActivityLog";
import FlowBuilder from "./pages/FlowBuilder";
import FileManager from "./pages/FileManager";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/revenda/login" element={<ResellerLogin />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reset-password" element={<ResetPassword />} />
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
              <Route path="/tarefas" element={<Tasks />} />
              <Route path="/agendamentos" element={<Schedules />} />
              <Route path="/conexoes" element={<Connections />} />
              <Route path="/campanhas" element={<Campaigns />} />
              <Route path="/agente-ia" element={<AIAgent />} />
              <Route path="/chatbot" element={<ChatbotPage />} />
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
              <Route path="/gerenciador-arquivos" element={<FileManager />} />
            </Route>
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
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
