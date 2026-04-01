import { useState, useEffect } from "react";
import { Send, Play, Mail, CheckCircle, Eye, AlertTriangle, Plus, Search, RefreshCw, FileText, Clock, XCircle, Download, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: "draft" | "running" | "completed" | "paused";
  totalSent: number;
  delivered: number;
  read: number;
  failed: number;
  createdAt: string;
}

const Campaigns = () => {
  const [activeTab, setActiveTab] = useState("campanhas");
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form state
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formMessage, setFormMessage] = useState("");
  const [formSpeed, setFormSpeed] = useState("20");

  const fetchCampaigns = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    setCampaigns(
      (data || []).map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? undefined,
        status: c.status as Campaign["status"],
        totalSent: c.total_sent || 0,
        delivered: c.delivered || 0,
        read: c.read || 0,
        failed: c.failed || 0,
        createdAt: c.created_at,
      }))
    );
    setLoading(false);
  };

  useEffect(() => { fetchCampaigns(); }, []);

  const campaignStats = [
    { label: "Campanhas", value: campaigns.length, icon: Send, color: "text-primary" },
    { label: "Executando", value: campaigns.filter(c => c.status === "running").length, icon: Play, color: "text-green-500" },
    { label: "Enviadas", value: campaigns.reduce((a, c) => a + c.totalSent, 0), icon: Mail, color: "text-blue-400" },
    { label: "Entregues", value: campaigns.reduce((a, c) => a + c.delivered, 0), icon: CheckCircle, color: "text-emerald-500" },
    { label: "Lidas", value: campaigns.reduce((a, c) => a + c.read, 0), icon: Eye, color: "text-cyan-400" },
    { label: "Falhas", value: campaigns.reduce((a, c) => a + c.failed, 0), icon: AlertTriangle, color: "text-destructive" },
  ];

  const templateStats = [
    { label: "Total", value: 0, icon: FileText, color: "text-primary" },
    { label: "Aprovados", value: 0, icon: CheckCircle, color: "text-emerald-500" },
    { label: "Pendentes", value: 0, icon: Clock, color: "text-yellow-500" },
    { label: "Rejeitados", value: 0, icon: XCircle, color: "text-destructive" },
  ];

  const handleCreateCampaign = async () => {
    if (!formName.trim() || !formMessage.trim() || !user) return;
    const { error } = await supabase.from("campaigns").insert({
      user_id: user.id,
      name: formName.trim(),
      description: formDesc.trim() || null,
      message_template: formMessage.trim(),
      send_speed: parseInt(formSpeed) || 20,
    });
    if (error) {
      toast.error("Erro ao criar campanha");
      return;
    }
    toast.success("Campanha criada com sucesso!");
    setNewCampaignOpen(false);
    setFormName("");
    setFormDesc("");
    setFormMessage("");
    setFormSpeed("20");
    fetchCampaigns();
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-blue-600">Campanhas</h1>
        <div className="flex items-center gap-2">
          {activeTab === "templates" && (
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Sincronizar da Meta
            </Button>
          )}
          <Button variant="action" className="gap-2 px-5" onClick={() => setNewCampaignOpen(true)}>
            <Plus className="h-4 w-4" />
            {activeTab === "campanhas" ? "Nova Campanha" : "Novo Template"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted/50">
            <TabsTrigger value="campanhas" className="gap-2">
              <Send className="h-4 w-4" />
              Campanhas
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="h-4 w-4" />
              Templates HSM
            </TabsTrigger>
          </TabsList>

          {/* Campanhas Tab */}
          <TabsContent value="campanhas" className="space-y-6 mt-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {campaignStats.map((stat) => (
                <Card key={stat.label} className="p-4 flex items-center gap-3">
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                  <div>
                    <p className="text-xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </Card>
              ))}
            </div>

            {/* Search & Filter */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar campanhas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="running">Executando</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="paused">Pausada</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Campaign List / Empty */}
            <div className="text-center py-16 text-muted-foreground">
              <Send className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>Nenhuma campanha encontrada</p>
            </div>

            {/* HSM Info */}
            <div className="flex items-start gap-3 rounded-lg bg-primary/10 border border-primary/20 p-4">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-primary">Importante sobre Templates HSM</p>
                <p className="text-sm text-muted-foreground">
                  Para enviar mensagens em massa, você precisa usar Templates HSM aprovados pelo WhatsApp. Mensagens sem template só funcionam para contatos que iniciaram conversa nas últimas 24 horas.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Templates HSM Tab */}
          <TabsContent value="templates" className="space-y-6 mt-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {templateStats.map((stat) => (
                <Card key={stat.label} className="p-4 flex items-center gap-3">
                  <stat.icon className={cn("h-5 w-5", stat.color)} />
                  <div>
                    <p className="text-xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </Card>
              ))}
            </div>

            {/* Search & Filter */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar templates..." className="pl-9" />
              </div>
              <Select defaultValue="all">
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Todos os status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="approved">Aprovados</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                  <SelectItem value="rejected">Rejeitados</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>

            {/* Empty */}
            <Card className="p-12">
              <div className="flex flex-col items-center justify-center text-center">
                <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-semibold text-foreground">Nenhum template</h3>
                <p className="text-sm text-muted-foreground mt-1">Sincronize da Meta ou crie um novo template</p>
                <div className="flex gap-2 mt-4">
                  <Button variant="outline" className="gap-2">
                    <Download className="h-4 w-4" />
                    Sincronizar
                  </Button>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Criar Template
                  </Button>
                </div>
              </div>
            </Card>

            {/* Info */}
            <div className="flex items-start gap-3 rounded-lg bg-primary/10 border border-primary/20 p-4">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-primary">Como funcionam os Templates HSM</p>
                <p className="text-sm text-muted-foreground">
                  Templates HSM são mensagens pré-aprovadas pelo WhatsApp para envio proativo. Após criar aqui, você deve submeter para aprovação via Meta Business Suite. Use "Sincronizar da Meta" para importar templates já aprovados.
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* New Campaign Dialog */}
      <Dialog open={newCampaignOpen} onOpenChange={setNewCampaignOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <Send className="h-5 w-5 text-primary" />
              <DialogTitle>Nova Campanha</DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Nome da Campanha *</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ex: Promoção de Natal"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Descrição</label>
              <Textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Descrição opcional..."
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Conexão WhatsApp *</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Meu número</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Template HSM</label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum (usar mensagem)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum (usar mensagem)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Mensagem *</label>
              <Textarea
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                placeholder="Digite a mensagem..."
                rows={4}
              />
              <p className="text-xs text-yellow-500 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Sem template, só funciona para contatos ativos nas últimas 24h
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Segmentar por Tags</label>
              <p className="text-xs text-muted-foreground">Nenhuma tag = todos os contatos com opt-in</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-foreground">Agendar para</label>
                <Input type="datetime-local" />
                <p className="text-xs text-muted-foreground mt-1">Deixe vazio para iniciar manualmente</p>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Velocidade (msg/seg)</label>
                <Input
                  type="number"
                  value={formSpeed}
                  onChange={(e) => setFormSpeed(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">Máximo recomendado: 20-30</p>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setNewCampaignOpen(false)}>
              Cancelar
            </Button>
            <Button className="flex-1 gap-2" onClick={handleCreateCampaign}>
              <Send className="h-4 w-4" />
              Criar Campanha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Campaigns;
