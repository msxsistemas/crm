import { supabase } from "@/lib/db";

export interface DistributionConfig {
  id: string;
  is_active: boolean;
  mode: "round_robin" | "least_loaded" | "random";
  respect_working_hours: boolean;
  respect_queues: boolean;
  max_conversations_per_agent: number;
  include_agent_ids: string[];
  exclude_agent_ids: string[];
}

export async function loadDistributionConfig(): Promise<DistributionConfig | null> {
  const { data } = await supabase
    .from("auto_distribution_config")
    .select("*")
    .limit(1)
    .maybeSingle();
  return data as DistributionConfig | null;
}

export async function distributeConversation(
  conversationId: string,
  config: DistributionConfig
): Promise<void> {
  // Get eligible agents (agent or admin roles)
  let query = supabase
    .from("profiles")
    .select("id, name")
    .in("role", ["agent", "admin"]);

  if (config.exclude_agent_ids.length > 0) {
    query = query.not("id", "in", `(${config.exclude_agent_ids.join(",")})`);
  }

  if (config.include_agent_ids.length > 0) {
    query = query.in("id", config.include_agent_ids);
  }

  const { data: agents } = await query;
  if (!agents?.length) return;

  // Count open conversations per agent
  const { data: openCounts } = await supabase
    .from("conversations")
    .select("assigned_to")
    .eq("status", "open")
    .not("assigned_to", "is", null);

  const agentLoad: Record<string, number> = {};
  openCounts?.forEach((c) => {
    if (c.assigned_to) {
      agentLoad[c.assigned_to] = (agentLoad[c.assigned_to] || 0) + 1;
    }
  });

  // Filter by max load
  const eligible = agents.filter(
    (a) => (agentLoad[a.id] || 0) < config.max_conversations_per_agent
  );
  if (!eligible.length) return;

  let selected: (typeof agents)[0];

  if (config.mode === "least_loaded") {
    selected = [...eligible].sort(
      (a, b) => (agentLoad[a.id] || 0) - (agentLoad[b.id] || 0)
    )[0];
  } else if (config.mode === "random") {
    selected = eligible[Math.floor(Math.random() * eligible.length)];
  } else {
    // round_robin — use last assigned index stored in localStorage
    const lastIdx = parseInt(localStorage.getItem("rr_last_idx") || "-1");
    const nextIdx = (lastIdx + 1) % eligible.length;
    selected = eligible[nextIdx];
    localStorage.setItem("rr_last_idx", String(nextIdx));
  }

  await supabase
    .from("conversations")
    .update({ assigned_to: selected.id })
    .eq("id", conversationId);

  await supabase.from("distribution_log").insert({
    conversation_id: conversationId,
    assigned_to: selected.id,
    assigned_to_name: selected.name,
    mode_used: config.mode,
  });
}
