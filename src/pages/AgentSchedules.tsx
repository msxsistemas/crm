import { useState, useEffect, useCallback } from "react";
import { Clock, Save, RefreshCw, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface AgentSchedule {
  id?: string;
  agent_id: string;
  monday_start: string | null;
  monday_end: string | null;
  monday_active: boolean;
  tuesday_start: string | null;
  tuesday_end: string | null;
  tuesday_active: boolean;
  wednesday_start: string | null;
  wednesday_end: string | null;
  wednesday_active: boolean;
  thursday_start: string | null;
  thursday_end: string | null;
  thursday_active: boolean;
  friday_start: string | null;
  friday_end: string | null;
  friday_active: boolean;
  saturday_start: string | null;
  saturday_end: string | null;
  saturday_active: boolean;
  sunday_start: string | null;
  sunday_end: string | null;
  sunday_active: boolean;
  timezone: string;
  is_active: boolean;
}

export function isAgentInShift(schedule: AgentSchedule): boolean {
  const now = new Date();
  const day = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][now.getDay()];
  const active = schedule[`${day}_active` as keyof AgentSchedule];
  const start = schedule[`${day}_start` as keyof AgentSchedule] as string;
  const end = schedule[`${day}_end` as keyof AgentSchedule] as string;
  if (!active || !start || !end) return false;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= startMin && nowMin <= endMin;
}

interface AgentProfile {
  id: string;
  full_name: string | null;
  email: string | null;
}

const DAYS = [
  { key: "monday", label: "Segunda-feira" },
  { key: "tuesday", label: "Terça-feira" },
  { key: "wednesday", label: "Quarta-feira" },
  { key: "thursday", label: "Quinta-feira" },
  { key: "friday", label: "Sexta-feira" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
] as const;

type DayKey = (typeof DAYS)[number]["key"];

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Cuiaba",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Noronha",
  "UTC",
];

const defaultSchedule = (agentId: string): AgentSchedule => ({
  agent_id: agentId,
  monday_start: "08:00",
  monday_end: "18:00",
  monday_active: true,
  tuesday_start: "08:00",
  tuesday_end: "18:00",
  tuesday_active: true,
  wednesday_start: "08:00",
  wednesday_end: "18:00",
  wednesday_active: true,
  thursday_start: "08:00",
  thursday_end: "18:00",
  thursday_active: true,
  friday_start: "08:00",
  friday_end: "18:00",
  friday_active: true,
  saturday_start: "09:00",
  saturday_end: "13:00",
  saturday_active: false,
  sunday_start: null,
  sunday_end: null,
  sunday_active: false,
  timezone: "America/Sao_Paulo",
  is_active: true,
});

interface AgentScheduleEditorProps {
  agent: AgentProfile;
  initialSchedule: AgentSchedule | null;
  onSaved: () => void;
}

const AgentScheduleEditor = ({ agent, initialSchedule, onSaved }: AgentScheduleEditorProps) => {
  const [schedule, setSchedule] = useState<AgentSchedule>(
    initialSchedule || defaultSchedule(agent.id)
  );
  const [saving, setSaving] = useState(false);
  const inShift = isAgentInShift(schedule);

  const setDay = (day: DayKey, field: "start" | "end" | "active", value: string | boolean) => {
    setSchedule(prev => ({
      ...prev,
      [`${day}_${field}`]: value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await db
      .from("agent_schedules" as any)
      .upsert({
        ...schedule,
        agent_id: agent.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "agent_id" });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar horário: " + error.message);
    } else {
      toast.success(`Horário de ${agent.full_name || "agente"} salvo!`);
      onSaved();
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
            {(agent.full_name || agent.email || "?").charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-sm">{agent.full_name || "Sem nome"}</p>
            <p className="text-xs text-muted-foreground">{agent.email}</p>
          </div>
          <span
            className={cn(
              "ml-2 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
              inShift
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-500"
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", inShift ? "bg-green-500" : "bg-gray-400")} />
            {inShift ? "Em turno" : "Fora do turno"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Fuso horário:</Label>
            <Select
              value={schedule.timezone}
              onValueChange={v => setSchedule(prev => ({ ...prev, timezone: v }))}
            >
              <SelectTrigger className="h-8 text-xs w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(tz => (
                  <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" className="gap-1.5" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? "Salvando..." : "Salvar horário"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {DAYS.map(({ key, label }) => {
          const activeKey = `${key}_active` as keyof AgentSchedule;
          const startKey = `${key}_start` as keyof AgentSchedule;
          const endKey = `${key}_end` as keyof AgentSchedule;
          const isActive = !!schedule[activeKey];
          const startVal = (schedule[startKey] as string) || "";
          const endVal = (schedule[endKey] as string) || "";

          return (
            <div
              key={key}
              className={cn(
                "flex items-center gap-4 rounded-lg px-4 py-2.5 transition-colors",
                isActive ? "bg-muted/40" : "bg-muted/20 opacity-60"
              )}
            >
              <Switch
                checked={isActive}
                onCheckedChange={val => setDay(key, "active", val)}
                className="shrink-0"
              />
              <span className={cn("w-36 text-sm font-medium", !isActive && "line-through text-muted-foreground")}>
                {label}
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={startVal}
                  onChange={e => setDay(key, "start", e.target.value)}
                  disabled={!isActive}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40"
                />
                <span className="text-muted-foreground text-sm">→</span>
                <input
                  type="time"
                  value={endVal}
                  onChange={e => setDay(key, "end", e.target.value)}
                  disabled={!isActive}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-40"
                />
              </div>
              {!isActive && (
                <span className="text-xs text-muted-foreground ml-auto">Inativo</span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

const AgentSchedulesPage = () => {
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [schedules, setSchedules] = useState<Record<string, AgentSchedule>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    if (isAdmin) {
      const [profilesRes, schedulesRes] = await Promise.all([
        db.from("profiles").select("id, full_name, email"),
        db.from("agent_schedules" as any).select("*"),
      ]);

      if (profilesRes.data) {
        setAgents(profilesRes.data as AgentProfile[]);
      }
      if (schedulesRes.data) {
        const map: Record<string, AgentSchedule> = {};
        for (const s of schedulesRes.data as AgentSchedule[]) {
          map[s.agent_id] = s;
        }
        setSchedules(map);
      }
    } else if (user) {
      const [profileRes, scheduleRes] = await Promise.all([
        db.from("profiles").select("id, full_name, email").eq("id", user.id).single(),
        db.from("agent_schedules" as any).select("*").eq("agent_id", user.id).maybeSingle(),
      ]);
      if (profileRes.data) {
        setAgents([profileRes.data as AgentProfile]);
      }
      if (scheduleRes.data) {
        setSchedules({ [user.id]: scheduleRes.data as AgentSchedule });
      }
    }
    setLoading(false);
  }, [user, isAdmin]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <h1 className="text-xl font-bold text-blue-600">Horários dos Agentes</h1>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <UserCheck className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>Nenhum agente encontrado</p>
            </div>
          ) : (
            agents.map(agent => (
              <AgentScheduleEditor
                key={agent.id}
                agent={agent}
                initialSchedule={schedules[agent.id] || null}
                onSaved={load}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentSchedulesPage;
