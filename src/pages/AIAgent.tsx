import { useState, useEffect, useRef } from "react";
import {
  Brain, Save, Plus, Trash2, FileText, Send, Bot, Settings as SettingsIcon,
  BookOpen, MessageCircle, Upload, Sparkles, Power, PowerOff, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

interface AgentConfig {
  id?: string;
  name: string;
  persona: string;
  tone: string;
  language: string;
  max_tokens: number;
  is_active: boolean;
}

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  source_type: string;
  created_at: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const defaultConfig: AgentConfig = {
  name: "Assistente IA",
  persona: "Você é um assistente virtual prestativo, educado e profissional. Responda de forma clara e objetiva.",
  tone: "professional",
  language: "pt-BR",
  max_tokens: 1024,
  is_active: false,
};

const AIAgent = () => {
  const { user } = useAuth();
  const [config, setConfig] = useState<AgentConfig>(defaultConfig);
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Knowledge form
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  // Chat test
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user) {
      loadConfig();
      loadKnowledge();
    }
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const loadConfig = async () => {
    const { data } = await supabase
      .from("ai_agent_config")
      .select("*")
      .eq("user_id", user!.id)
      .limit(1)
      .single();

    if (data) {
      setConfig({
        id: data.id,
        name: data.name,
        persona: data.persona || "",
        tone: data.tone || "professional",
        language: data.language || "pt-BR",
        max_tokens: data.max_tokens || 1024,
        is_active: data.is_active || false,
      });
    }
    setLoading(false);
  };

  const loadKnowledge = async () => {
    const { data } = await supabase
      .from("ai_knowledge_base")
      .select("*")
      .eq("user_id", user!.id)
      .order("created_at", { ascending: false });

    if (data) setKnowledge(data as KnowledgeItem[]);
  };

  const saveConfig = async () => {
    if (!user) return;
    setSaving(true);

    const payload = {
      user_id: user.id,
      name: config.name,
      persona: config.persona,
      tone: config.tone,
      language: config.language,
      max_tokens: config.max_tokens,
      is_active: config.is_active,
      updated_at: new Date().toISOString(),
    };

    if (config.id) {
      const { error } = await supabase
        .from("ai_agent_config")
        .update(payload)
        .eq("id", config.id);
      if (error) toast.error("Erro ao salvar: " + error.message);
      else toast.success("Configurações salvas!");
    } else {
      const { data, error } = await supabase
        .from("ai_agent_config")
        .insert(payload)
        .select("id")
        .single();
      if (error) toast.error("Erro ao salvar: " + error.message);
      else {
        setConfig((prev) => ({ ...prev, id: data.id }));
        toast.success("Agente IA criado!");
      }
    }
    setSaving(false);
  };

  const addKnowledge = async () => {
    if (!newTitle.trim() || !newContent.trim() || !user) return;

    const { error } = await supabase.from("ai_knowledge_base").insert({
      user_id: user.id,
      title: newTitle.trim(),
      content: newContent.trim(),
      source_type: "text",
    });

    if (error) {
      toast.error("Erro ao adicionar: " + error.message);
    } else {
      toast.success("Documento adicionado!");
      setNewTitle("");
      setNewContent("");
      loadKnowledge();
    }
  };

  const deleteKnowledge = async (id: string) => {
    const { error } = await supabase.from("ai_knowledge_base").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else {
      toast.success("Documento removido");
      setKnowledge((prev) => prev.filter((k) => k.id !== id));
    }
  };

  const sendTestMessage = async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    const allMessages = [...chatMessages, userMsg];
    setChatMessages(allMessages);
    setChatInput("");
    setChatLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("ai-agent", {
        body: { messages: allMessages, action: "test" },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "Falha na IA"));
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "❌ Erro ao processar. Tente novamente." },
      ]);
    }
    setChatLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-blue-600">Agente IA</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {config.is_active ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                <Power className="h-3 w-3 mr-1" /> Ativo
              </Badge>
            ) : (
              <Badge variant="secondary">
                <PowerOff className="h-3 w-3 mr-1" /> Inativo
              </Badge>
            )}
            <Switch
              checked={config.is_active}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, is_active: v }))}
            />
          </div>
          <Button onClick={saveConfig} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: Config + Knowledge */}
        <div className="flex-1 overflow-y-auto p-6">
          <Tabs defaultValue="config" className="space-y-6">
            <TabsList>
              <TabsTrigger value="config" className="gap-2">
                <SettingsIcon className="h-4 w-4" /> Configuração
              </TabsTrigger>
              <TabsTrigger value="knowledge" className="gap-2">
                <BookOpen className="h-4 w-4" /> Base de Conhecimento
              </TabsTrigger>
            </TabsList>

            <TabsContent value="config" className="space-y-6">
              {/* Agent Name */}
              <Card className="p-5 space-y-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Bot className="h-4 w-4 text-primary" /> Identidade do Agente
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Nome do agente</label>
                    <Input
                      value={config.name}
                      onChange={(e) => setConfig((p) => ({ ...p, name: e.target.value }))}
                      placeholder="Ex: Assistente Virtual"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">Tom</label>
                      <Select value={config.tone} onValueChange={(v) => setConfig((p) => ({ ...p, tone: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Profissional</SelectItem>
                          <SelectItem value="friendly">Amigável</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-sm text-muted-foreground mb-1 block">Máx. tokens</label>
                      <Input
                        type="number"
                        value={config.max_tokens}
                        onChange={(e) => setConfig((p) => ({ ...p, max_tokens: parseInt(e.target.value) || 1024 }))}
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Persona */}
              <Card className="p-5 space-y-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" /> Prompt / Persona
                </h3>
                <Textarea
                  value={config.persona}
                  onChange={(e) => setConfig((p) => ({ ...p, persona: e.target.value }))}
                  placeholder="Descreva como o agente deve se comportar, responder e qual seu objetivo..."
                  className="min-h-[180px] text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Este é o prompt de sistema que define a personalidade e comportamento do agente.
                </p>
              </Card>
            </TabsContent>

            <TabsContent value="knowledge" className="space-y-6">
              {/* Add Knowledge */}
              <Card className="p-5 space-y-4">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <Plus className="h-4 w-4 text-primary" /> Adicionar Documento
                </h3>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Título do documento (ex: FAQ, Preços, Horários)"
                />
                <Textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Cole aqui o conteúdo que o agente deve consultar..."
                  className="min-h-[140px] text-sm"
                />
                <Button onClick={addKnowledge} disabled={!newTitle.trim() || !newContent.trim()} className="gap-2">
                  <Upload className="h-4 w-4" /> Adicionar à Base
                </Button>
              </Card>

              {/* Knowledge List */}
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Documentos ({knowledge.length})
                </h3>
                {knowledge.length === 0 ? (
                  <Card className="p-8 text-center">
                    <BookOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">Nenhum documento adicionado</p>
                    <p className="text-xs text-muted-foreground mt-1">Adicione FAQs, informações de produtos ou instruções</p>
                  </Card>
                ) : (
                  knowledge.map((k) => (
                    <Card key={k.id} className="p-4 flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground text-sm">{k.title}</p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{k.content}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(k.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteKnowledge(k.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right: Chat Test */}
        <div className="w-[400px] border-l border-border flex flex-col bg-card">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Testar Agente</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground"
              onClick={() => setChatMessages([])}
            >
              Limpar
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="h-12 w-12 text-muted-foreground/20 mb-3" />
                <p className="text-sm text-muted-foreground">Envie uma mensagem para testar o agente</p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted text-foreground rounded-tl-sm"
                  )}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-xl px-4 py-2 rounded-tl-sm">
                  <div className="flex gap-1">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="border-t border-border p-3">
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendTestMessage()}
                placeholder="Digite uma mensagem de teste..."
                disabled={chatLoading}
                className="flex-1"
              />
              <Button size="icon" onClick={sendTestMessage} disabled={chatLoading || !chatInput.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAgent;
