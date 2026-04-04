import { useState, useEffect, useRef } from "react";
import {
  Plus, Search, Filter, MessageSquare, Play, Clock, Bot,
  Edit, Trash2, List, MousePointerClick, LayoutList, X, BarChart2,
  Send, RotateCcw, Zap, CalendarClock, Save, CheckCircle2, XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/db";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Business Hours Types ─────────────────────────────────────────────────────
interface BusinessHourRow {
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
}

interface BusinessHoursConfig {
  enabled: boolean;
  outside_hours_message: string;
  timezone: string;
}

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const DEFAULT_SCHEDULE: BusinessHourRow[] = [
  { day_of_week: 0, start_time: "08:00", end_time: "18:00", active: false }, // Dom
  { day_of_week: 1, start_time: "08:00", end_time: "18:00", active: true },  // Seg
  { day_of_week: 2, start_time: "08:00", end_time: "18:00", active: true },  // Ter
  { day_of_week: 3, start_time: "08:00", end_time: "18:00", active: true },  // Qua
  { day_of_week: 4, start_time: "08:00", end_time: "18:00", active: true },  // Qui
  { day_of_week: 5, start_time: "08:00", end_time: "18:00", active: true },  // Sex
  { day_of_week: 6, start_time: "08:00", end_time: "18:00", active: false }, // Sáb
];

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
  trigger_count: number;
  flow_data?: unknown;
}

interface SimulatorMessage {
  id: string;
  text: string;
  fromMe: boolean;
  matchedRule?: string;
  timestamp: Date;
}

const Chatbot = () => {
  const [activeTab, setActiveTab] = useState<"regras" | "horario">("regras");
  const [rules, setRules] = useState<ChatbotRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<ChatbotRule | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<ChatbotRule | null>(null);

  // Business Hours state
  const [bhSchedule, setBhSchedule] = useState<BusinessHourRow[]>(DEFAULT_SCHEDULE);
  const [bhConfig, setBhConfig] = useState<BusinessHoursConfig>({
    enabled: false,
    outside_hours_message: "Nosso atendimento está fechado no momento. Retornaremos em breve!",
    timezone: "America/Sao_Paulo",
  });
  const [bhLoading, setBhLoading] = useState(false);
  const [bhSaving, setBhSaving] = useState(false);

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

  // Simulator state
  const [showSimulator, setShowSimulator] = useState(false);
  const [simulatorMessages, setSimulatorMessages] = useState<SimulatorMessage[]>([]);
  const [simulatorInput, setSimulatorInput] = useState("");
  const [activeMatchedRule, setActiveMatchedRule] = useState<ChatbotRule | null>(null);
  const simulatorEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadRules(); }, []);
  useEffect(() => { loadBusinessHours(); }, []);

  const loadBusinessHours = async () => {
    setBhLoading(true);
    try {
      const [{ data: configData }, { data: scheduleData }] = await Promise.all([
        supabase.from("business_hours_config").select("enabled, outside_hours_message, timezone").maybeSingle(),
        supabase.from("business_hours").select("day_of_week, start_time, end_time, active").order("day_of_week"),
      ]);

      if (configData) {
        setBhConfig({
          enabled: configData.enabled ?? false,
          outside_hours_message: configData.outside_hours_message ?? "Nosso atendimento está fechado no momento. Retornaremos em breve!",
          timezone: configData.timezone ?? "America/Sao_Paulo",
        });
      }

      if (scheduleData && scheduleData.length > 0) {
        // Merge with defaults to ensure all 7 days exist
        const merged = DEFAULT_SCHEDULE.map((def) => {
          const found = scheduleData.find((r) => r.day_of_week === def.day_of_week);
          if (found) {
            return {
              day_of_week: found.day_of_week,
              start_time: found.start_time ? found.start_time.slice(0, 5) : def.start_time,
              end_time: found.end_time ? found.end_time.slice(0, 5) : def.end_time,
              active: found.active ?? def.active,
            };
          }
          return def;
        });
        setBhSchedule(merged);
      }
    } catch (err) {
      console.error("Error loading business hours:", err);
    } finally {
      setBhLoading(false);
    }
  };

  const saveBusinessHours = async () => {
    setBhSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error("Usuário não autenticado"); return; }

      // Upsert config
      const { error: configError } = await supabase.from("business_hours_config").upsert({
        user_id: user.id,
        enabled: bhConfig.enabled,
        outside_hours_message: bhConfig.outside_hours_message,
        timezone: bhConfig.timezone,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (configError) throw configError;

      // Upsert schedule rows
      const rows = bhSchedule.map((row) => ({
        user_id: user.id,
        day_of_week: row.day_of_week,
        start_time: row.start_time,
        end_time: row.end_time,
        active: row.active,
      }));

      const { error: scheduleError } = await supabase.from("business_hours").upsert(rows, { onConflict: "user_id,day_of_week" });
      if (scheduleError) throw scheduleError;

      toast.success("Horários salvos com sucesso!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error("Erro ao salvar: " + msg);
    } finally {
      setBhSaving(false);
    }
  };

  const isCurrentlyOpen = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
    const todayRow = bhSchedule.find((r) => r.day_of_week === dayOfWeek);
    if (!todayRow || !todayRow.active) return false;
    return timeStr >= todayRow.start_time && timeStr <= todayRow.end_time;
  };

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

  const resetStats = async () => {
    if (!window.confirm("Deseja zerar as estatísticas de todas as regras?")) return;
    const { error } = await supabase.from("chatbot_rules").update({ trigger_count: 0 }).gte("priority", -999999);
    if (error) toast.error("Erro ao zerar estatísticas");
    else {
      toast.success("Estatísticas zeradas!");
      setRules(prev => prev.map(r => ({ ...r, trigger_count: 0 })));
    }
  };

  const addMenuOption = () => setFormMenuOptions(prev => [...prev, { label: "", response: "", description: "" }]);
  const removeMenuOption = (idx: number) => setFormMenuOptions(prev => prev.filter((_, i) => i !== idx));
  const updateMenuOption = (idx: number, field: keyof MenuOption, value: string) => {
    setFormMenuOptions(prev => prev.map((o, i) => i === idx ? { ...o, [field]: value } : o));
  };

  // Simulator scroll
  useEffect(() => {
    simulatorEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [simulatorMessages]);

  const handleSimulatorSend = () => {
    const text = simulatorInput.trim();
    if (!text) return;

    const userMsg: SimulatorMessage = {
      id: crypto.randomUUID(),
      text,
      fromMe: true,
      timestamp: new Date(),
    };
    const newMessages = [...simulatorMessages, userMsg];
    setSimulatorMessages(newMessages);
    setSimulatorInput("");

    // Matching logic
    const isFirstMessage = newMessages.filter(m => m.fromMe).length <= 1;
    const lower = text.toLowerCase().trim();

    let matched: ChatbotRule | null = null;
    for (const rule of rules.filter(r => r.is_active)) {
      if (rule.trigger_type === "first_message" && isFirstMessage) { matched = rule; break; }
      if (rule.trigger_type === "keyword" && rule.trigger_value) {
        const kws = rule.trigger_value.split(",").map((k: string) => k.trim().toLowerCase());
        if (kws.some((k: string) => lower.includes(k))) { matched = rule; break; }
      }
      if (rule.trigger_type === "always") matched = rule;
    }

    setActiveMatchedRule(matched);

    let botText = "Nenhuma regra correspondente para esta mensagem.";
    if (matched) {
      if (matched.response_type === "menu_numbered") {
        const options = (matched.menu_options || []).map((o, i) => `${i + 1}. ${o.label}`).join("\n");
        botText = `${matched.response_text}\n\n${options}`;
      } else if (matched.response_type === "menu_list" || matched.response_type === "menu_buttons") {
        try {
          const meta = JSON.parse(matched.response_text);
          const opts = (matched.menu_options || []).map((o, i) => `${i + 1}. ${o.label}`).join("\n");
          botText = `${meta.body || matched.response_text}\n\n${opts}`;
        } catch {
          const opts = (matched.menu_options || []).map((o, i) => `${i + 1}. ${o.label}`).join("\n");
          botText = `${matched.response_text}\n\n${opts}`;
        }
      } else {
        botText = matched.response_text;
      }
    }

    const botMsg: SimulatorMessage = {
      id: crypto.randomUUID(),
      text: botText,
      fromMe: false,
      matchedRule: matched?.name,
      timestamp: new Date(),
    };

    setTimeout(() => {
      setSimulatorMessages(prev => [...prev, botMsg]);
    }, 400);
  };

  const handleSimulatorClear = () => {
    setSimulatorMessages([]);
    setActiveMatchedRule(null);
    setSimulatorInput("");
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
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-blue-600">Chatbot</h1>
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setActiveTab("regras")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === "regras"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Bot className="h-4 w-4" /> Regras
            </button>
            <button
              onClick={() => setActiveTab("horario")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                activeTab === "horario"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <CalendarClock className="h-4 w-4" /> Horário
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "regras" ? (
            <>
              <Button variant="outline" className="gap-2 px-4" onClick={() => setShowSimulator(true)}>
                <Play className="h-4 w-4 text-emerald-500" /> Simular
              </Button>
              <Button variant="action" className="gap-2 px-5" onClick={openNew}>
                <Plus className="h-4 w-4" /> Nova Regra
              </Button>
            </>
          ) : (
            <Button onClick={saveBusinessHours} disabled={bhSaving} className="gap-2 px-5 bg-blue-600 hover:bg-blue-700 text-white">
              <Save className="h-4 w-4" /> {bhSaving ? "Salvando..." : "Salvar Horários"}
            </Button>
          )}
        </div>
      </div>

      {activeTab === "horario" ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {bhLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <>
              {/* Config card */}
              <Card className="p-5 space-y-4">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" /> Configurações de Horário
                </h2>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Ativar controle de horário</p>
                    <p className="text-xs text-muted-foreground">Quando ativo, mensagens fora do horário recebem a mensagem configurada abaixo</p>
                  </div>
                  <Switch checked={bhConfig.enabled} onCheckedChange={(v) => setBhConfig((c) => ({ ...c, enabled: v }))} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Fuso horário</label>
                  <Select value={bhConfig.timezone} onValueChange={(v) => setBhConfig((c) => ({ ...c, timezone: v }))}>
                    <SelectTrigger className="w-60">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/Sao_Paulo">America/Sao_Paulo (BRT)</SelectItem>
                      <SelectItem value="America/Manaus">America/Manaus (AMT)</SelectItem>
                      <SelectItem value="America/Belem">America/Belem (BRT)</SelectItem>
                      <SelectItem value="America/Fortaleza">America/Fortaleza (BRT)</SelectItem>
                      <SelectItem value="America/Noronha">America/Noronha (FNT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Mensagem fora do horário</label>
                  <Textarea
                    value={bhConfig.outside_hours_message}
                    onChange={(e) => setBhConfig((c) => ({ ...c, outside_hours_message: e.target.value }))}
                    placeholder="Ex: Nosso atendimento está fechado no momento. Retornaremos em breve!"
                    className="min-h-[80px]"
                  />
                </div>
              </Card>

              {/* Preview badge */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border",
                  isCurrentlyOpen()
                    ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400"
                    : "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
                )}>
                  {isCurrentlyOpen() ? (
                    <><CheckCircle2 className="h-4 w-4" /> Agora estaria: ABERTO</>
                  ) : (
                    <><XCircle className="h-4 w-4" /> Agora estaria: FECHADO</>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date().toLocaleString("pt-BR", { weekday: "long", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              {/* Weekly schedule grid */}
              <Card className="p-5">
                <h2 className="text-base font-semibold text-foreground mb-4">Grade de Horários</h2>
                <div className="space-y-3">
                  {bhSchedule.map((row, idx) => (
                    <div key={row.day_of_week} className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                      row.active ? "bg-muted/30 border-border" : "bg-muted/10 border-border/40 opacity-60"
                    )}>
                      <div className="w-10 text-center">
                        <span className="text-sm font-semibold text-foreground">{DAY_NAMES[row.day_of_week]}</span>
                      </div>
                      <Switch
                        checked={row.active}
                        onCheckedChange={(v) => {
                          setBhSchedule((prev) => prev.map((r, i) => i === idx ? { ...r, active: v } : r));
                        }}
                      />
                      <div className="flex items-center gap-2 flex-1">
                        <Input
                          type="time"
                          value={row.start_time}
                          disabled={!row.active}
                          onChange={(e) => setBhSchedule((prev) => prev.map((r, i) => i === idx ? { ...r, start_time: e.target.value } : r))}
                          className="w-32 text-sm"
                        />
                        <span className="text-muted-foreground">–</span>
                        <Input
                          type="time"
                          value={row.end_time}
                          disabled={!row.active}
                          onChange={(e) => setBhSchedule((prev) => prev.map((r, i) => i === idx ? { ...r, end_time: e.target.value } : r))}
                          className="w-32 text-sm"
                        />
                      </div>
                      {!row.active && (
                        <span className="text-xs text-muted-foreground italic">Fechado</span>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </div>
      ) : (

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
                        {(rule.trigger_count || 0) > 0 ? (
                          <span className="text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-full border border-blue-200 dark:border-blue-800">
                            {rule.trigger_count} ativações
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Nunca ativado</span>
                        )}
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

        {/* Statistics Panel */}
        {rules.length > 0 && (() => {
          const top5 = [...rules]
            .filter(r => (r.trigger_count || 0) > 0)
            .sort((a, b) => (b.trigger_count || 0) - (a.trigger_count || 0))
            .slice(0, 5);
          const maxCount = top5.length > 0 ? (top5[0].trigger_count || 1) : 1;
          return (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <BarChart2 className="h-4 w-4 text-primary" /> Estatísticas de Ativação
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                  onClick={resetStats}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Zerar estatísticas
                </Button>
              </div>
              {top5.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhuma regra foi ativada ainda.</p>
              ) : (
                <div className="space-y-3">
                  {top5.map(rule => {
                    const pct = Math.max(4, Math.round(((rule.trigger_count || 0) / maxCount) * 100));
                    return (
                      <div key={rule.id} className="flex items-center gap-3">
                        <span className="text-sm text-foreground w-40 truncate shrink-0">{rule.name}</span>
                        <div className="flex-1 bg-muted rounded-full h-2.5">
                          <div
                            className="bg-blue-500 h-2.5 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-foreground w-10 text-right shrink-0">
                          {rule.trigger_count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })()}
      </div>

      )}

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

      {/* Simulator Dialog */}
      <Dialog open={showSimulator} onOpenChange={setShowSimulator}>
        <DialogContent className="sm:max-w-4xl p-0 overflow-hidden gap-0 [&>button.absolute]:hidden" style={{ maxHeight: "90vh" }}>
          {/* Simulator Header */}
          <div className="bg-emerald-600 px-6 py-4 flex items-center gap-3 shrink-0">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white">Simulador de Chatbot</h2>
              <p className="text-sm text-white/70">{rules.filter(r => r.is_active).length} regras ativas carregadas</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-white/80 hover:text-white hover:bg-white/10 gap-1.5 text-xs"
              onClick={handleSimulatorClear}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Limpar conversa
            </Button>
            <button onClick={() => setShowSimulator(false)} className="text-white/70 hover:text-white ml-1">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Simulator Body */}
          <div className="flex" style={{ height: "70vh" }}>
            {/* Left: Chat */}
            <div className="flex flex-col flex-1 min-w-0" style={{ background: "#e5ddd5" }}>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {simulatorMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center opacity-60">
                    <MessageSquare className="h-12 w-12 text-gray-400 mb-3" />
                    <p className="text-sm text-gray-500">Digite uma mensagem para iniciar a simulação</p>
                  </div>
                )}
                {simulatorMessages.map(msg => (
                  <div
                    key={msg.id}
                    className={cn("flex", msg.fromMe ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[75%] rounded-xl px-3 py-2 shadow-sm text-sm",
                        msg.fromMe
                          ? "bg-[#dcf8c6] text-gray-800 rounded-br-sm"
                          : "bg-white text-gray-800 rounded-bl-sm"
                      )}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                      <p className={cn("text-[10px] mt-1 text-right", msg.fromMe ? "text-gray-500" : "text-gray-400")}>
                        {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={simulatorEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 bg-white border-t border-gray-200 flex items-center gap-2 shrink-0">
                <Input
                  value={simulatorInput}
                  onChange={e => setSimulatorInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSimulatorSend(); } }}
                  placeholder="Digite uma mensagem..."
                  className="flex-1 border-gray-200 bg-gray-50 focus:bg-white"
                />
                <Button
                  onClick={handleSimulatorSend}
                  disabled={!simulatorInput.trim()}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white h-10 w-10 p-0 rounded-full shrink-0"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Right: Rule Info */}
            <div className="w-64 shrink-0 border-l border-border bg-background flex flex-col overflow-y-auto">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Regra Correspondente</h3>
              </div>
              <div className="p-4 flex-1">
                {activeMatchedRule ? (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className="h-4 w-4 text-emerald-600" />
                        <span className="text-xs font-semibold text-emerald-700">Regra ativada</span>
                      </div>
                      <p className="text-sm font-bold text-foreground">{activeMatchedRule.name}</p>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Gatilho</p>
                        <Badge variant="outline" className="text-xs">{getTriggerLabel(activeMatchedRule.trigger_type)}</Badge>
                      </div>
                      {activeMatchedRule.trigger_value && (
                        <div>
                          <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Palavra-chave</p>
                          <p className="text-xs text-foreground font-mono bg-muted px-2 py-1 rounded">{activeMatchedRule.trigger_value}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">Tipo de resposta</p>
                        <Badge variant="secondary" className="text-xs">{getResponseTypeLabel(activeMatchedRule.response_type)}</Badge>
                      </div>
                      {activeMatchedRule.flow_data && (
                        <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 mt-2">
                          <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                            Esta regra usa FlowBuilder — simulação de fluxo não disponível no simulador.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ) : simulatorMessages.length > 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-6 opacity-60">
                    <X className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">Nenhuma regra correspondeu à última mensagem</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center py-6 opacity-60">
                    <Bot className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">Aguardando mensagem para mostrar informações da regra</p>
                  </div>
                )}
              </div>

              {/* Active rules list */}
              <div className="border-t border-border px-4 py-3">
                <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-2">Regras ativas ({rules.filter(r => r.is_active).length})</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {rules.filter(r => r.is_active).map(rule => (
                    <div key={rule.id} className={cn(
                      "text-xs px-2 py-1.5 rounded-md flex items-center gap-1.5",
                      activeMatchedRule?.id === rule.id
                        ? "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 font-semibold"
                        : "text-muted-foreground hover:bg-muted/50"
                    )}>
                      {activeMatchedRule?.id === rule.id && <Zap className="h-3 w-3 shrink-0" />}
                      <span className="truncate">{rule.name}</span>
                    </div>
                  ))}
                  {rules.filter(r => r.is_active).length === 0 && (
                    <p className="text-xs text-muted-foreground italic">Nenhuma regra ativa</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Chatbot;
