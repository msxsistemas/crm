import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/db";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shuffle, RefreshCw, Trash2, Users, CheckCircle2, XCircle } from "lucide-react";

interface DistributionConfig {
  id: string;
  is_active: boolean;
  mode: "round_robin" | "least_loaded" | "random";
  respect_working_hours: boolean;
  respect_queues: boolean;
  max_conversations_per_agent: number;
  include_agent_ids: string[];
  exclude_agent_ids: string[];
}

interface Agent {
  id: string;
  name: string | null;
  role: string | null;
}

interface DistributionLogEntry {
  id: string;
  conversation_id: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  mode_used: string | null;
  created_at: string;
}

const defaultConfig: Omit<DistributionConfig, "id"> = {
  is_active: false,
  mode: "round_robin",
  respect_working_hours: true,
  respect_queues: true,
  max_conversations_per_agent: 10,
  include_agent_ids: [],
  exclude_agent_ids: [],
};

const MODE_LABELS: Record<string, string> = {
  round_robin: "Round-Robin",
  least_loaded: "Menor carga",
  random: "Aleatório",
};

export default function AutoDistribution() {
  const [config, setConfig] = useState<DistributionConfig | null>(null);
  const [form, setForm] = useState<Omit<DistributionConfig, "id">>(defaultConfig);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [log, setLog] = useState<DistributionLogEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingLog, setLoadingLog] = useState(false);

  const loadConfig = useCallback(async () => {
    const { data } = await supabase
      .from("auto_distribution_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (data) {
      const cfg = data as DistributionConfig;
      setConfig(cfg);
      setForm({
        is_active: cfg.is_active,
        mode: cfg.mode,
        respect_working_hours: cfg.respect_working_hours,
        respect_queues: cfg.respect_queues,
        max_conversations_per_agent: cfg.max_conversations_per_agent,
        include_agent_ids: cfg.include_agent_ids ?? [],
        exclude_agent_ids: cfg.exclude_agent_ids ?? [],
      });
    }
  }, []);

  const loadAgents = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, name, role")
      .in("role", ["agent", "admin"]);
    if (data) setAgents(data as Agent[]);
  }, []);

  const loadLog = useCallback(async () => {
    setLoadingLog(true);
    const { data } = await supabase
      .from("distribution_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setLog(data as DistributionLogEntry[]);
    setLoadingLog(false);
  }, []);

  useEffect(() => {
    loadConfig();
    loadAgents();
    loadLog();
  }, [loadConfig, loadAgents, loadLog]);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (config?.id) {
        const { error } = await supabase
          .from("auto_distribution_config")
          .update({ ...form, updated_at: new Date().toISOString() })
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("auto_distribution_config")
          .insert(form)
          .select()
          .single();
        if (error) throw error;
        if (data) setConfig(data as DistributionConfig);
      }
      toast.success("Configuração salva com sucesso!");
      await loadConfig();
    } catch (err: unknown) {
      toast.error("Erro ao salvar configuração");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (value: boolean) => {
    const newForm = { ...form, is_active: value };
    setForm(newForm);
    if (config?.id) {
      await supabase
        .from("auto_distribution_config")
        .update({ is_active: value, updated_at: new Date().toISOString() })
        .eq("id", config.id);
      setConfig((prev) => (prev ? { ...prev, is_active: value } : prev));
      toast.success(value ? "Distribuição ativada!" : "Distribuição desativada.");
    }
  };

  const toggleAgentInList = (
    listKey: "include_agent_ids" | "exclude_agent_ids",
    agentId: string
  ) => {
    setForm((prev) => {
      const list = prev[listKey];
      const exists = list.includes(agentId);
      return {
        ...prev,
        [listKey]: exists ? list.filter((id) => id !== agentId) : [...list, agentId],
      };
    });
  };

  const handleClearLog = async () => {
    if (!window.confirm("Deseja limpar todo o log de distribuição?")) return;
    await supabase.from("distribution_log").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    setLog([]);
    toast.success("Log limpo.");
  };

  const isActive = form.is_active;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shuffle className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">Distribuição Automática</h1>
          <Badge
            variant={isActive ? "default" : "secondary"}
            className={isActive ? "bg-green-600 text-white" : ""}
          >
            {isActive ? "Ativo" : "Inativo"}
          </Badge>
        </div>
      </div>

      {/* Active banner */}
      {isActive && (
        <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />
          <span className="text-sm font-medium">
            Distribuição ativa — novas conversas serão atribuídas automaticamente
          </span>
        </div>
      )}

      {/* Main toggle card */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-semibold">
              Ativar distribuição automática de conversas
            </Label>
            <p className="text-sm text-muted-foreground mt-0.5">
              Quando ativo, novas conversas sem agente serão distribuídas automaticamente
            </p>
          </div>
          <Switch
            checked={form.is_active}
            onCheckedChange={handleToggleActive}
          />
        </div>
      </div>

      {/* Configuration form */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-6">
        <h2 className="text-lg font-semibold">Configuração</h2>

        {/* Mode selector */}
        <div className="space-y-3">
          <Label className="font-medium">Modo de distribuição</Label>
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                {
                  value: "round_robin",
                  emoji: "🔄",
                  title: "Round-Robin",
                  desc: "Atribuir em sequência para cada agente",
                },
                {
                  value: "least_loaded",
                  emoji: "⚖️",
                  title: "Menor carga",
                  desc: "Atribuir para o agente com menos conversas abertas",
                },
                {
                  value: "random",
                  emoji: "🎲",
                  title: "Aleatório",
                  desc: "Atribuir aleatoriamente",
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-4 transition-colors ${
                  form.mode === opt.value
                    ? "border-blue-600 bg-blue-50 dark:bg-blue-950"
                    : "border-border hover:border-blue-300"
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="mode"
                  value={opt.value}
                  checked={form.mode === opt.value}
                  onChange={() => setForm((prev) => ({ ...prev, mode: opt.value }))}
                />
                <span className="text-xl">{opt.emoji}</span>
                <span className="font-semibold text-sm">{opt.title}</span>
                <span className="text-xs text-muted-foreground">{opt.desc}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Max conversations */}
        <div className="flex items-center gap-4">
          <div className="flex-1 max-w-xs space-y-1.5">
            <Label htmlFor="max-conversations" className="font-medium">
              Máximo de conversas por agente
            </Label>
            <p className="text-xs text-muted-foreground">
              Agente com ≥ N conversas abertas é pulado
            </p>
            <Input
              id="max-conversations"
              type="number"
              min={1}
              max={500}
              value={form.max_conversations_per_agent}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  max_conversations_per_agent: parseInt(e.target.value) || 10,
                }))
              }
              className="w-28"
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Respeitar horários de trabalho</Label>
              <p className="text-xs text-muted-foreground">
                Se o agente estiver fora do turno, será pulado
              </p>
            </div>
            <Switch
              checked={form.respect_working_hours}
              onCheckedChange={(v) =>
                setForm((prev) => ({ ...prev, respect_working_hours: v }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Respeitar filas</Label>
              <p className="text-xs text-muted-foreground">
                Considerar filas ao distribuir conversas
              </p>
            </div>
            <Switch
              checked={form.respect_queues}
              onCheckedChange={(v) =>
                setForm((prev) => ({ ...prev, respect_queues: v }))
              }
            />
          </div>
        </div>

        {/* Agent selectors */}
        {agents.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Agentes incluídos
              </Label>
              <p className="text-xs text-muted-foreground">
                Vazio = todos os agentes
              </p>
              <div className="rounded-lg border p-3 space-y-1.5 max-h-48 overflow-y-auto">
                {agents.map((agent) => (
                  <label
                    key={agent.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded px-1 py-0.5"
                  >
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={form.include_agent_ids.includes(agent.id)}
                      onChange={() => toggleAgentInList("include_agent_ids", agent.id)}
                    />
                    <span className="text-sm">{agent.name || agent.id}</span>
                    <Badge variant="outline" className="text-xs ml-auto">
                      {agent.role}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-medium flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                Agentes excluídos
              </Label>
              <p className="text-xs text-muted-foreground">
                Agentes que nunca receberão conversas
              </p>
              <div className="rounded-lg border p-3 space-y-1.5 max-h-48 overflow-y-auto">
                {agents.map((agent) => (
                  <label
                    key={agent.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-accent rounded px-1 py-0.5"
                  >
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={form.exclude_agent_ids.includes(agent.id)}
                      onChange={() => toggleAgentInList("exclude_agent_ids", agent.id)}
                    />
                    <span className="text-sm">{agent.name || agent.id}</span>
                    <Badge variant="outline" className="text-xs ml-auto">
                      {agent.role}
                    </Badge>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? "Salvando..." : "Salvar configuração"}
        </Button>
      </div>

      {/* Distribution log */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold">Log de distribuição</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadLog}
              disabled={loadingLog}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingLog ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearLog}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar log
            </Button>
          </div>
        </div>
        {log.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">
            Nenhuma atribuição registrada ainda.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Conversa</TableHead>
                <TableHead>Atribuído para</TableHead>
                <TableHead>Modo</TableHead>
                <TableHead>Data/Hora</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-mono text-xs">
                    {entry.conversation_id?.slice(0, 8)}…
                  </TableCell>
                  <TableCell>{entry.assigned_to_name || entry.assigned_to?.slice(0, 8) || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {entry.mode_used ? (MODE_LABELS[entry.mode_used] ?? entry.mode_used) : "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
