import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Workflow, Play, Eye, Plus, ArrowRight, BookOpen, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

type Category = "Todos" | "Atendimento" | "Vendas" | "Suporte" | "Pesquisa" | "Agendamento";

interface FlowNode {
  id: string;
  type: string;
  label: string;
  next?: string[];
}

interface FlowData {
  nodes: FlowNode[];
}

interface Template {
  id: string;
  name: string;
  description: string;
  category: Exclude<Category, "Todos">;
  icon: string;
  nodes: number;
  triggerType: string;
  tags: string[];
  flowData: FlowData;
}

// ─── Templates ───────────────────────────────────────────────────────────────

const TEMPLATES: Template[] = [
  {
    id: "1",
    name: "Boas-vindas",
    description: "Mensagem de boas-vindas com menu de opções para Suporte, Vendas ou Outro.",
    category: "Atendimento",
    icon: "👋",
    nodes: 5,
    triggerType: "keyword",
    tags: ["boas-vindas", "menu", "início"],
    flowData: {
      nodes: [
        { id: "n1", type: "message", label: "Olá! Bem-vindo(a). Como posso ajudar?", next: ["n2"] },
        { id: "n2", type: "menu", label: "Menu: 1-Suporte | 2-Vendas | 3-Outro", next: ["n3", "n4", "n5"] },
        { id: "n3", type: "message", label: "Redirecionando para Suporte..." },
        { id: "n4", type: "message", label: "Redirecionando para Vendas..." },
        { id: "n5", type: "message", label: "Um agente irá atendê-lo em breve." },
      ],
    },
  },
  {
    id: "2",
    name: "Qualificação de Lead",
    description: "Sequência de perguntas para qualificar leads: nome, interesse e orçamento disponível.",
    category: "Vendas",
    icon: "🎯",
    nodes: 6,
    triggerType: "keyword",
    tags: ["lead", "qualificação", "vendas"],
    flowData: {
      nodes: [
        { id: "n1", type: "message", label: "Olá! Vou fazer algumas perguntas rápidas.", next: ["n2"] },
        { id: "n2", type: "input", label: "Qual é o seu nome?", next: ["n3"] },
        { id: "n3", type: "input", label: "Qual produto/serviço te interessa?", next: ["n4"] },
        { id: "n4", type: "input", label: "Qual é o seu orçamento aproximado?", next: ["n5"] },
        { id: "n5", type: "message", label: "Obrigado! Nossa equipe entrará em contato.", next: ["n6"] },
        { id: "n6", type: "assign", label: "Transferir para vendedor" },
      ],
    },
  },
  {
    id: "3",
    name: "Suporte Técnico",
    description: "Menu de problemas comuns com rotas para soluções rápidas ou escalonamento.",
    category: "Suporte",
    icon: "🔧",
    nodes: 7,
    triggerType: "keyword",
    tags: ["suporte", "técnico", "problemas"],
    flowData: {
      nodes: [
        { id: "n1", type: "message", label: "Central de Suporte Técnico. Como posso ajudar?", next: ["n2"] },
        { id: "n2", type: "menu", label: "1-Login | 2-Pagamento | 3-Produto | 4-Outro", next: ["n3", "n4", "n5", "n6"] },
        { id: "n3", type: "message", label: "Solução: Redefinir senha em nosso site." },
        { id: "n4", type: "message", label: "Solução: Verifique os dados do cartão." },
        { id: "n5", type: "message", label: "Solução: Consulte nosso manual de uso." },
        { id: "n6", type: "input", label: "Descreva o problema detalhadamente:", next: ["n7"] },
        { id: "n7", type: "assign", label: "Escalonar para técnico" },
      ],
    },
  },
  {
    id: "4",
    name: "Pesquisa de Satisfação NPS",
    description: "Coleta nota NPS de 0 a 10 e captura comentário opcional do cliente.",
    category: "Pesquisa",
    icon: "⭐",
    nodes: 4,
    triggerType: "keyword",
    tags: ["NPS", "satisfação", "pesquisa"],
    flowData: {
      nodes: [
        { id: "n1", type: "message", label: "Olá! Gostaríamos de saber sua opinião.", next: ["n2"] },
        { id: "n2", type: "input", label: "De 0 a 10, qual a chance de nos recomendar?", next: ["n3"] },
        { id: "n3", type: "input", label: "Gostaria de deixar um comentário? (opcional)", next: ["n4"] },
        { id: "n4", type: "message", label: "Obrigado pelo seu feedback! Ele é muito importante." },
      ],
    },
  },
  {
    id: "5",
    name: "Agendamento de Reunião",
    description: "Coleta data, hora e assunto preferidos pelo cliente para agendamento.",
    category: "Agendamento",
    icon: "📅",
    nodes: 5,
    triggerType: "keyword",
    tags: ["agendamento", "reunião", "data"],
    flowData: {
      nodes: [
        { id: "n1", type: "message", label: "Vamos agendar uma reunião!", next: ["n2"] },
        { id: "n2", type: "input", label: "Qual data prefere? (ex: 15/04)", next: ["n3"] },
        { id: "n3", type: "input", label: "Qual horário prefere? (ex: 14:00)", next: ["n4"] },
        { id: "n4", type: "input", label: "Qual é o assunto da reunião?", next: ["n5"] },
        { id: "n5", type: "message", label: "Reunião solicitada! Nossa equipe confirmará em breve." },
      ],
    },
  },
  {
    id: "6",
    name: "FAQ Automático",
    description: "Responde automaticamente às perguntas mais frequentes dos clientes.",
    category: "Suporte",
    icon: "❓",
    nodes: 8,
    triggerType: "keyword",
    tags: ["FAQ", "perguntas", "automático"],
    flowData: {
      nodes: [
        { id: "n1", type: "message", label: "Perguntas Frequentes. Selecione uma opção:", next: ["n2"] },
        { id: "n2", type: "menu", label: "1-Preço | 2-Entrega | 3-Garantia | 4-Devolução | 5-Outro", next: ["n3", "n4", "n5", "n6", "n7"] },
        { id: "n3", type: "message", label: "Nossos preços variam de R$50 a R$500. Consulte o catálogo." },
        { id: "n4", type: "message", label: "Entrega em até 5 dias úteis para todo Brasil." },
        { id: "n5", type: "message", label: "Todos os produtos têm garantia de 12 meses." },
        { id: "n6", type: "message", label: "Devoluções aceitas em até 7 dias após a compra." },
        { id: "n7", type: "assign", label: "Transferir para atendente" },
        { id: "n8", type: "message", label: "Posso ajudar com mais alguma coisa?" },
      ],
    },
  },
  {
    id: "7",
    name: "Recuperação de Cliente",
    description: "Fluxo para reengajar clientes inativos com oferta especial personalizada.",
    category: "Vendas",
    icon: "🔄",
    nodes: 4,
    triggerType: "keyword",
    tags: ["reativação", "inativo", "oferta"],
    flowData: {
      nodes: [
        { id: "n1", type: "message", label: "Sentimos sua falta! Temos uma oferta especial para você.", next: ["n2"] },
        { id: "n2", type: "menu", label: "1-Ver oferta | 2-Não tenho interesse", next: ["n3", "n4"] },
        { id: "n3", type: "message", label: "Acesse o link para ver sua oferta exclusiva: [link]", next: ["n4"] },
        { id: "n4", type: "message", label: "Obrigado! Estamos à disposição." },
      ],
    },
  },
  {
    id: "8",
    name: "Onboarding Novo Cliente",
    description: "Sequência de boas-vindas para novos clientes com apresentação do serviço.",
    category: "Atendimento",
    icon: "🚀",
    nodes: 6,
    triggerType: "keyword",
    tags: ["onboarding", "novo cliente", "boas-vindas"],
    flowData: {
      nodes: [
        { id: "n1", type: "message", label: "Bem-vindo(a) à nossa plataforma! 🎉", next: ["n2"] },
        { id: "n2", type: "message", label: "Aqui você terá acesso a todos os nossos serviços.", next: ["n3"] },
        { id: "n3", type: "message", label: "Passo 1: Configure seu perfil.", next: ["n4"] },
        { id: "n4", type: "message", label: "Passo 2: Explore o painel principal.", next: ["n5"] },
        { id: "n5", type: "message", label: "Passo 3: Entre em contato se precisar de ajuda.", next: ["n6"] },
        { id: "n6", type: "message", label: "Estamos felizes em tê-lo conosco! 😊" },
      ],
    },
  },
  {
    id: "9",
    name: "Coleta de Dados",
    description: "Formulário conversacional para coleta de dados: nome, CPF/CNPJ e e-mail.",
    category: "Atendimento",
    icon: "📋",
    nodes: 5,
    triggerType: "keyword",
    tags: ["formulário", "dados", "cadastro"],
    flowData: {
      nodes: [
        { id: "n1", type: "message", label: "Precisamos de alguns dados para continuar.", next: ["n2"] },
        { id: "n2", type: "input", label: "Qual é o seu nome completo?", next: ["n3"] },
        { id: "n3", type: "input", label: "Qual é o seu CPF ou CNPJ?", next: ["n4"] },
        { id: "n4", type: "input", label: "Qual é o seu e-mail?", next: ["n5"] },
        { id: "n5", type: "message", label: "Dados coletados com sucesso! Obrigado." },
      ],
    },
  },
  {
    id: "10",
    name: "Orçamento Rápido",
    description: "Perguntas de qualificação para gerar orçamentos de forma ágil e automatizada.",
    category: "Vendas",
    icon: "💰",
    nodes: 6,
    triggerType: "keyword",
    tags: ["orçamento", "cotação", "vendas"],
    flowData: {
      nodes: [
        { id: "n1", type: "message", label: "Vamos preparar um orçamento para você!", next: ["n2"] },
        { id: "n2", type: "input", label: "Qual produto/serviço deseja orçar?", next: ["n3"] },
        { id: "n3", type: "input", label: "Qual a quantidade necessária?", next: ["n4"] },
        { id: "n4", type: "input", label: "Precisa de entrega? (sim/não)", next: ["n5"] },
        { id: "n5", type: "input", label: "Qual é o prazo desejado?", next: ["n6"] },
        { id: "n6", type: "message", label: "Orçamento em análise! Retornaremos em até 24h." },
      ],
    },
  },
  {
    id: "11",
    name: "Triagem de Suporte",
    description: "Categorização automática de problemas para direcionamento correto da equipe.",
    category: "Suporte",
    icon: "🔍",
    nodes: 7,
    triggerType: "keyword",
    tags: ["triagem", "categorização", "suporte"],
    flowData: {
      nodes: [
        { id: "n1", type: "message", label: "Suporte iniciado. Vamos identificar seu problema.", next: ["n2"] },
        { id: "n2", type: "menu", label: "Área: 1-Financeiro | 2-Técnico | 3-Comercial | 4-Outro", next: ["n3", "n4", "n5", "n6"] },
        { id: "n3", type: "assign", label: "Fila: Financeiro" },
        { id: "n4", type: "assign", label: "Fila: Técnico" },
        { id: "n5", type: "assign", label: "Fila: Comercial" },
        { id: "n6", type: "input", label: "Descreva brevemente o problema:", next: ["n7"] },
        { id: "n7", type: "assign", label: "Fila: Geral" },
      ],
    },
  },
  {
    id: "12",
    name: "Pesquisa Pós-Atendimento",
    description: "Avaliação CSAT enviada automaticamente após o encerramento do atendimento.",
    category: "Pesquisa",
    icon: "📊",
    nodes: 4,
    triggerType: "keyword",
    tags: ["CSAT", "pós-atendimento", "avaliação"],
    flowData: {
      nodes: [
        { id: "n1", type: "message", label: "Seu atendimento foi encerrado. Como foi sua experiência?", next: ["n2"] },
        { id: "n2", type: "menu", label: "1-Ótimo | 2-Bom | 3-Regular | 4-Ruim", next: ["n3", "n3", "n3", "n3"] },
        { id: "n3", type: "input", label: "Gostaria de deixar um comentário? (opcional)", next: ["n4"] },
        { id: "n4", type: "message", label: "Obrigado pela avaliação! Até a próxima. 😊" },
      ],
    },
  },
];

const CATEGORIES: Category[] = ["Todos", "Atendimento", "Vendas", "Suporte", "Pesquisa", "Agendamento"];

const CATEGORY_COLORS: Record<string, string> = {
  Atendimento: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Vendas: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  Suporte: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  Pesquisa: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  Agendamento: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
};

const NODE_TYPE_LABELS: Record<string, string> = {
  message: "Mensagem",
  menu: "Menu",
  input: "Entrada",
  assign: "Transferência",
};

// ─── Component ───────────────────────────────────────────────────────────────

const FlowBuilder = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [activeCategory, setActiveCategory] = useState<Category>("Todos");

  // Preview dialog
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);

  // Use template dialog
  const [useTemplate, setUseTemplate] = useState<Template | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [triggerType, setTriggerType] = useState("");
  const [triggerValue, setTriggerValue] = useState("");
  const [creating, setCreating] = useState(false);

  const filteredTemplates =
    activeCategory === "Todos"
      ? TEMPLATES
      : TEMPLATES.filter((t) => t.category === activeCategory);

  const categoryCounts = CATEGORIES.slice(1).reduce<Record<string, number>>((acc, cat) => {
    acc[cat] = TEMPLATES.filter((t) => t.category === cat).length;
    return acc;
  }, {});

  const openUseTemplate = (template: Template) => {
    setUseTemplate(template);
    setRuleName(template.name);
    setTriggerType(template.triggerType);
    setTriggerValue("");
  };

  const handleCreateRule = async () => {
    if (!useTemplate || !user) return;
    setCreating(true);
    try {
      const { error } = await supabase.from("chatbot_rules").insert({
        name: ruleName.trim() || useTemplate.name,
        trigger_type: triggerType,
        trigger_value: triggerValue || null,
        response_type: "text",
        response_text: "Iniciando fluxo...",
        // @ts-expect-error: flow_data column added via migration, not yet in generated types
        flow_data: useTemplate.flowData,
        is_active: false,
      });

      if (error) throw error;

      toast({
        title: "Regra criada!",
        description: "Acesse Bots para editar o fluxo.",
      });
      setUseTemplate(null);
    } catch (err) {
      console.error(err);
      toast({
        title: "Erro ao criar regra",
        description: "Verifique os dados e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      {/* ── Header ── */}
      <div className="px-6 py-5 border-b border-border flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-primary">Biblioteca de Fluxos</h1>
            <p className="text-xs text-muted-foreground">Templates prontos para automação</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/bots")}>
          <ArrowRight className="h-4 w-4 mr-1.5" />
          Ir para Bots
        </Button>
      </div>

      <div className="px-6 py-4 space-y-5">
        {/* ── Info banner ── */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
          Use estes templates como ponto de partida para seus fluxos de automação. Clique em{" "}
          <span className="font-semibold">"Usar template"</span> para criar uma nova regra de chatbot
          com este fluxo pré-configurado.
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="col-span-2 sm:col-span-1 rounded-lg border border-border bg-card p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{TEMPLATES.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total de templates</p>
          </div>
          {CATEGORIES.slice(1).map((cat) => (
            <div key={cat} className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{categoryCounts[cat]}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{cat}</p>
            </div>
          ))}
        </div>

        {/* ── Category filter ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              }`}
            >
              {cat}
              {cat !== "Todos" && (
                <span className="ml-1 opacity-70">({categoryCounts[cat]})</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Template grid ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-6">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className="rounded-xl border border-border bg-card flex flex-col hover:shadow-md transition-shadow"
            >
              {/* Card header */}
              <div className="flex items-start gap-3 p-4 pb-3">
                <div className="text-3xl leading-none mt-0.5">{template.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-sm font-semibold text-foreground">{template.name}</h3>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        CATEGORY_COLORS[template.category]
                      }`}
                    >
                      {template.category}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {template.description}
                  </p>
                </div>
              </div>

              {/* Meta */}
              <div className="px-4 pb-3 flex items-center gap-3">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Workflow className="h-3 w-3" />
                  <span>{template.nodes} nós</span>
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  {template.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 font-normal"
                    >
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="px-4 pb-4 mt-auto flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 h-8 text-xs"
                  onClick={() => openUseTemplate(template)}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Usar template
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs px-3"
                  onClick={() => setPreviewTemplate(template)}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Visualizar fluxo
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ Preview dialog ══ */}
      {previewTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreviewTemplate(null)}
        >
          <div
            className="bg-card rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xl">{previewTemplate.icon}</span>
                <h2 className="text-sm font-semibold text-foreground">{previewTemplate.name}</h2>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground text-lg leading-none"
                onClick={() => setPreviewTemplate(null)}
              >
                ×
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-4 space-y-2">
              <p className="text-xs text-muted-foreground mb-4">{previewTemplate.description}</p>
              {previewTemplate.flowData.nodes.map((node, idx) => (
                <div key={node.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <div className="h-6 w-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">
                      {idx + 1}
                    </div>
                    {idx < previewTemplate.flowData.nodes.length - 1 && (
                      <div className="w-px h-4 bg-border mt-0.5" />
                    )}
                  </div>
                  <div className="flex-1 pb-1">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      {NODE_TYPE_LABELS[node.type] || node.type}
                    </span>
                    <p className="text-xs text-foreground leading-relaxed">{node.label}</p>
                    {node.next && node.next.length > 0 && (
                      <p className="text-[10px] text-muted-foreground">
                        → conecta a {node.next.length} nó(s)
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setPreviewTemplate(null)}>
                Fechar
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setPreviewTemplate(null);
                  openUseTemplate(previewTemplate);
                }}
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                Usar template
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══ Use template dialog ══ */}
      {useTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setUseTemplate(null)}
        >
          <div
            className="bg-card rounded-xl shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xl">{useTemplate.icon}</span>
                <h2 className="text-sm font-semibold text-foreground">Criar regra de chatbot</h2>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground text-lg leading-none"
                onClick={() => setUseTemplate(null)}
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Nome da regra
                </label>
                <input
                  type="text"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Tipo de gatilho
                </label>
                <select
                  value={triggerType}
                  onChange={(e) => setTriggerType(e.target.value)}
                  className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="keyword">Palavra-chave</option>
                  <option value="all">Todas as mensagens</option>
                  <option value="regex">Expressão regular</option>
                  <option value="first_message">Primeira mensagem</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-foreground block mb-1">
                  Valor do gatilho
                </label>
                <input
                  type="text"
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(e.target.value)}
                  placeholder="Ex: olá, oi, menu..."
                  className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Template:</span> {useTemplate.name} —{" "}
                {useTemplate.nodes} nós configurados. A regra será criada como{" "}
                <span className="font-medium">inativa</span>; ative-a em Bots após revisar o fluxo.
              </div>
            </div>
            <div className="px-5 pb-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setUseTemplate(null)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleCreateRule} disabled={creating}>
                {creating ? "Criando..." : "Criar regra de chatbot"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FlowBuilder;
