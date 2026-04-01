import { useState, useEffect } from "react";
import {
  Plus, Search, Filter, MessageSquare, Play, Clock, Bot,
  Edit, Trash2, List, MousePointerClick, LayoutList, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MenuOption {
  label: string;
  response: string;
  description?: string;
}

interface ChatbotRule {
  id: string;
  name: string;
  trigger_type: string;
  trigger_value: string | null;
  response_text: string;
  response_type: string;
  menu_options: MenuOption[];
  is_active: boolean;
  priority: number;
  created_at: string;
}

const Chatbot = () => {
  const [rules, setRules] = useState<ChatbotRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ChatbotRule | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<ChatbotRule | null>(null);

  // Form
  const [formName, setFormName] = useState("");
  const [formTrigger, setFormTrigger] = useState("keyword");
  const [formTriggerValue, setFormTriggerValue] = useState("");
  const [formResponseType, setFormResponseType] = useState("text");
  const [formResponse, setFormResponse] = useState("");
  const [formMenuOptions, setFormMenuOptions] = useState<MenuOption[]>([{ label: "", response: "", description: "" }]);
  const [formPriority, setFormPriority] = useState(0);
  const [formActive, setFormActive] = useState(true);
  const [formListTitle, setFormListTitle] = useState("");
  const [formListButtonText, setFormListButtonText] = useState("VER OPÇÕES");
  const [formListFooter, setFormListFooter] = useState("");

  useEffect(() => { loadRules(); }, []);

  const loadRules = async () => {
    const { data, error } = await supabase
      .from("chatbot_rules")
      .select("*")
      .order("priority", { ascending: false });
    if (error) console.error(error);
    else setRules((data as unknown as ChatbotRule[]) || []);
    setLoading(false);
  };

  const openNew = () => {
    setEditing(null);
    setFormName("");
    setFormTrigger("keyword");
    setFormTriggerValue("");
    setFormResponseType("text");
    setFormResponse("");
    setFormMenuOptions([{ label: "", response: "", description: "" }]);
    setFormPriority(0);
    setFormActive(true);
    setFormListTitle("");
    setFormListButtonText("VER OPÇÕES");
    setFormListFooter("");
    setShowDialog(true);
  };

  const openEdit = (rule: ChatbotRule) => {
    setEditing(rule);
    setFormName(rule.name);
    setFormTrigger(rule.trigger_type);
    setFormTriggerValue(rule.trigger_value || "");
    setFormResponseType(rule.response_type || "text");
    setFormResponse(rule.response_text);
    setFormMenuOptions(
      rule.menu_options?.length ? rule.menu_options : [{ label: "", response: "", description: "" }]
    );
    setFormPriority(rule.priority);
    setFormActive(rule.is_active);

    // Parse list metadata from response_text if it's a list type
    if (rule.response_type === "menu_list") {
      try {
        const meta = JSON.parse(rule.response_text);
        setFormListTitle(meta.title || "");
        setFormListButtonText(meta.buttonText || "VER OPÇÕES");
        setFormListFooter(meta.footer || "");
        setFormResponse(meta.body || "");
      } catch {
        setFormListTitle("");
        setFormListButtonText("VER OPÇÕES");
        setFormListFooter("");
        setFormResponse(rule.response_text);
      }
    } else {
      setFormListTitle("");
      setFormListButtonText("VER OPÇÕES");
      setFormListFooter("");
      setFormResponse(rule.response_text);
    }

    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error("Preencha o nome"); return; }
    if (formResponseType === "text" && !formResponse.trim()) { toast.error("Preencha a resposta"); return; }
    if (formResponseType !== "text") {
      const validOptions = formMenuOptions.filter(o => o.label.trim() && o.response.trim());
      if (validOptions.length < 2) { toast.error("Adicione pelo menos 2 opções completas"); return; }
    }

    const cleanOptions = formMenuOptions.filter(o => o.label.trim() && o.response.trim());

    let responseText = "";
    if (formResponseType === "text") {
      responseText = formResponse.trim();
    } else if (formResponseType === "menu_list") {
      responseText = JSON.stringify({
        title: formListTitle.trim(),
        buttonText: formListButtonText.trim() || "VER OPÇÕES",
        footer: formListFooter.trim(),
        body: formResponse.trim(),
      });
    } else {
      responseText = cleanOptions.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
    }

    const payload = {
      name: formName.trim(),
      trigger_type: formTrigger,
      trigger_value: formTriggerValue.trim() || null,
      response_type: formResponseType,
      response_text: responseText,
      menu_options: JSON.parse(JSON.stringify(cleanOptions)),
      priority: formPriority,
      is_active: formActive,
    };

    if (editing) {
      const { error } = await supabase.from("chatbot_rules").update(payload).eq("id", editing.id);
      if (error) toast.error("Erro: " + error.message);
      else toast.success("Regra atualizada!");
    } else {
      const { error } = await supabase.from("chatbot_rules").insert(payload);
      if (error) toast.error("Erro: " + error.message);
      else toast.success("Regra criada!");
    }
    setShowDialog(false);
    loadRules();
  };

  const confirmDelete = (rule: ChatbotRule) => {
    setRuleToDelete(rule);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!ruleToDelete) return;
    const { error } = await supabase.from("chatbot_rules").delete().eq("id", ruleToDelete.id);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Regra excluída"); setRules(prev => prev.filter(r => r.id !== ruleToDelete.id)); }
    setDeleteOpen(false);
    setRuleToDelete(null);
  };

  const toggleActive = async (rule: ChatbotRule) => {
    const { error } = await supabase.from("chatbot_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
    if (!error) setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
  };

  const addMenuOption = () => setFormMenuOptions(prev => [...prev, { label: "", response: "", description: "" }]);
  const removeMenuOption = (idx: number) => setFormMenuOptions(prev => prev.filter((_, i) => i !== idx));
  const updateMenuOption = (idx: number, field: keyof MenuOption, value: string) => {
    setFormMenuOptions(prev => prev.map((o, i) => i === idx ? { ...o, [field]: value } : o));
  };

  const activeCount = rules.filter(r => r.is_active).length;
  const inactiveCount = rules.filter(r => !r.is_active).length;

  const filtered = rules.filter(r => {
    if (filter === "active" && !r.is_active) return false;
    if (filter === "inactive" && r.is_active) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const getTriggerLabel = (type: string) => {
    switch (type) {
      case "keyword": return "Palavra-chave";
      case "first_message": return "Boas-vindas";
      case "always": return "Sempre";
      default: return type;
    }
  };

  const getResponseTypeLabel = (type: string) => {
    switch (type) {
      case "menu_numbered": return "Menu numerado";
      case "menu_buttons": return "Botões";
      case "menu_list": return "Lista interativa";
      default: return "Texto";
    }
  };

  const getResponseTypeIcon = (type: string) => {
    switch (type) {
      case "menu_numbered": return List;
      case "menu_buttons": return MousePointerClick;
      case "menu_list": return LayoutList;
      default: return MessageSquare;
    }
  };

  const formatTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `há ${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `há ${hours}h`;
    return `há ${Math.floor(hours / 24)}d`;
  };

  const stats = [
    { label: "Total de regras", value: rules.length, icon: Bot, color: "text-primary" },
    { label: "Regras ativas", value: activeCount, icon: Play, color: "text-emerald-500" },
    { label: "Regras inativas", value: inactiveCount, icon: Clock, color: "text-orange-500" },
  ];

  const isMenuType = formResponseType !== "text";

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-blue-600">Chatbot</h1>
        <Button variant="action" className="gap-2 px-5" onClick={openNew}>
          <Plus className="h-4 w-4" /> Nova Regra
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {stats.map(s => (
            <Card key={s.label} className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                <s.icon className={cn("h-5 w-5", s.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </Card>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar regras..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" /><SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="inactive">Inativas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Rules List */}
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center">
            <Bot className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">Nenhuma regra encontrada</h3>
            <p className="text-sm text-muted-foreground mt-1">Crie sua primeira regra de chatbot</p>
            <Button variant="action" className="mt-4 gap-2 px-5" onClick={openNew}><Plus className="h-4 w-4" /> Nova Regra</Button>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map(rule => {
              const RIcon = getResponseTypeIcon(rule.response_type);
              return (
                <Card key={rule.id} className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <RIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{rule.name}</span>
                        <Badge variant={rule.is_active ? "default" : "secondary"} className="text-xs">
                          {rule.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {rule.response_type !== "text"
                          ? `${(rule.menu_options || []).length} opções • ${getResponseTypeLabel(rule.response_type)}`
                          : rule.response_text}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0 ml-4">
                    <Badge variant="outline" className="text-xs">{getTriggerLabel(rule.trigger_type)}</Badge>
                    <Badge variant="outline" className="text-xs">{getResponseTypeLabel(rule.response_type)}</Badge>
                    <span className="text-xs">{formatTime(rule.created_at)}</span>
                    <Switch checked={rule.is_active} onCheckedChange={() => toggleActive(rule)} />
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(rule)}><Edit className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => confirmDelete(rule)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 px-6 py-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">
                {editing ? "Editar Regra" : "Nova Regra"}
              </h2>
              <p className="text-sm text-white/70">Configure regras de resposta automática</p>
            </div>
            <button onClick={() => setShowDialog(false)} className="text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-4 px-6 py-5 max-h-[60vh] overflow-y-auto">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Nome</label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Ex: Saudação, Menu Principal" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Gatilho</label>
                <Select value={formTrigger} onValueChange={setFormTrigger}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keyword">Palavra-chave</SelectItem>
                    <SelectItem value="first_message">Boas-vindas</SelectItem>
                    <SelectItem value="always">Sempre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Prioridade</label>
                <Input type="number" value={formPriority} onChange={e => setFormPriority(parseInt(e.target.value) || 0)} />
              </div>
            </div>
            {formTrigger === "keyword" && (
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Palavra-chave</label>
                <Input value={formTriggerValue} onChange={e => setFormTriggerValue(e.target.value)} placeholder="Ex: preço, horário, oi" />
              </div>
            )}

            {/* Response Type */}
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Tipo de resposta</label>
              <Select value={formResponseType} onValueChange={setFormResponseType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">
                    <div className="flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Texto simples</div>
                  </SelectItem>
                  <SelectItem value="menu_numbered">
                    <div className="flex items-center gap-2"><List className="h-4 w-4" /> Menu numerado (1, 2, 3...)</div>
                  </SelectItem>
                  <SelectItem value="menu_buttons">
                    <div className="flex items-center gap-2"><MousePointerClick className="h-4 w-4" /> Botões interativos</div>
                  </SelectItem>
                  <SelectItem value="menu_list">
                    <div className="flex items-center gap-2"><LayoutList className="h-4 w-4" /> Lista interativa (VER OPÇÕES)</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Text response */}
            {formResponseType === "text" && (
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Resposta</label>
                <Textarea value={formResponse} onChange={e => setFormResponse(e.target.value)} placeholder="Mensagem que o bot enviará..." className="min-h-[100px]" />
              </div>
            )}

            {/* List message config */}
            {formResponseType === "menu_list" && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Mensagem do corpo</label>
                  <Textarea value={formResponse} onChange={e => setFormResponse(e.target.value)} placeholder="Ex: Escolha o plano abaixo:" className="min-h-[60px]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Título (opcional)</label>
                    <Input value={formListTitle} onChange={e => setFormListTitle(e.target.value)} placeholder="Ex: Menu Principal" />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Texto do botão</label>
                    <Input value={formListButtonText} onChange={e => setFormListButtonText(e.target.value)} placeholder="VER OPÇÕES" />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Rodapé (opcional)</label>
                  <Input value={formListFooter} onChange={e => setFormListFooter(e.target.value)} placeholder="Ex: Toque para selecionar um item." />
                </div>
              </div>
            )}

            {/* Menu options */}
            {isMenuType && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-muted-foreground">Opções {formResponseType === "menu_list" ? "da lista" : "do menu"}</label>
                  <Button variant="outline" size="sm" onClick={addMenuOption} className="gap-1 h-7 text-xs">
                    <Plus className="h-3 w-3" /> Opção
                  </Button>
                </div>
                {formMenuOptions.map((opt, idx) => (
                  <Card key={idx} className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">{idx + 1}</span>
                      </div>
                      <Input
                        value={opt.label}
                        onChange={e => updateMenuOption(idx, "label", e.target.value)}
                        placeholder={`Opção ${idx + 1} (ex: ${formResponseType === "menu_list" ? "Smartv" : "Ver preços"})`}
                        className="h-8 text-sm"
                      />
                      {formMenuOptions.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeMenuOption(idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    {formResponseType === "menu_list" && (
                      <Input
                        value={opt.description || ""}
                        onChange={e => updateMenuOption(idx, "description", e.target.value)}
                        placeholder="Descrição curta (opcional)"
                        className="h-8 text-sm text-muted-foreground"
                      />
                    )}
                    <Textarea
                      value={opt.response}
                      onChange={e => updateMenuOption(idx, "response", e.target.value)}
                      placeholder="Resposta quando escolher esta opção..."
                      className="min-h-[60px] text-sm"
                    />
                  </Card>
                ))}

                {/* Preview */}
                <Card className="p-3 bg-muted/50">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Pré-visualização da mensagem:</p>
                  {formResponseType === "menu_list" ? (
                    <div className="bg-background rounded-lg overflow-hidden">
                      <div className="p-3 text-sm space-y-1">
                        {formListTitle && <p className="font-semibold text-foreground">{formListTitle}</p>}
                        <p className="text-foreground">{formResponse || "Escolha uma opção:"}</p>
                        {formListFooter && <p className="text-xs text-muted-foreground mt-1">{formListFooter}</p>}
                      </div>
                      <div className="border-t border-border px-3 py-2.5 flex items-center justify-center gap-2 cursor-pointer hover:bg-muted/50">
                        <LayoutList className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-primary">{formListButtonText || "VER OPÇÕES"}</span>
                      </div>
                      <div className="border-t border-border">
                        <div className="px-3 py-2 bg-muted/30">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Opções disponíveis</p>
                        </div>
                        {formMenuOptions.filter(o => o.label.trim()).map((o, i) => (
                          <div key={i} className="px-3 py-2.5 border-t border-border/50 flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium text-foreground">{o.label}</p>
                              {o.description && <p className="text-xs text-muted-foreground">{o.description}</p>}
                            </div>
                            <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : formResponseType === "menu_numbered" ? (
                    <div className="bg-background rounded-lg p-3 text-sm space-y-1">
                      <p className="font-medium">Escolha uma opção:</p>
                      {formMenuOptions.filter(o => o.label.trim()).map((o, i) => (
                        <p key={i}>{i + 1}. {o.label}</p>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-background rounded-lg p-3 text-sm space-y-2">
                      <p className="font-medium">Escolha uma opção:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {formMenuOptions.filter(o => o.label.trim()).map((o, i) => (
                          <span key={i} className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">{o.label}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Switch checked={formActive} onCheckedChange={setFormActive} />
                <span className="text-sm text-muted-foreground">{formActive ? "Ativo" : "Inativo"}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
              {editing ? "Atualizar" : "Criar"} Regra
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-xl p-0 gap-0">
          <div className="bg-blue-600 text-white px-6 py-4 rounded-t-lg">
            <h3 className="text-lg font-bold">Excluir {ruleToDelete?.name}?</h3>
            <p className="text-sm text-white/80">Esta ação não pode ser desfeita</p>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-foreground">
              A regra <strong>{ruleToDelete?.name}</strong> será excluída permanentemente.
            </p>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-4">
            <Button variant="outline" className="uppercase font-semibold text-xs" onClick={() => setDeleteOpen(false)}>CANCELAR</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white uppercase font-semibold text-xs px-6" onClick={handleDelete}>OK</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Chatbot;
