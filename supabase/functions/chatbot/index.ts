import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─── Flow Types ───────────────────────────────────────────────────────────────

interface FlowNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  data: {
    text?: string;
    condition?: string;
    value?: string;
    delay?: number;
    tag?: string;
    url?: string;
    method?: string;
    body?: string;
    aiPrompt?: string;
    variable?: string;
    options?: string[];
    mediaUrl?: string;
    mediaType?: string;
    inputVariable?: string;
    transferTo?: string;
  };
}

interface FlowConnection {
  id: string;
  from: string;
  to: string;
  label?: string;
}

interface FlowData {
  nodes: FlowNode[];
  connections: FlowConnection[];
}

interface ExecuteFlowParams {
  conversationId: string;
  contactId: string;
  instanceName: string;
  phone: string;
  message: string;
  rule: Record<string, unknown>;
  nodes: FlowNode[];
  connections: FlowConnection[];
  currentNodeId: string;
  variables: Record<string, string>;
  sessionId: string | null;
}

// ─── Variable substitution ────────────────────────────────────────────────────

function substituteVars(text: string, variables: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_match, key) => variables[key] ?? `{${key}}`);
}

// ─── Contact variable substitution (for rule response_text) ──────────────────

function substituteContactVars(text: string, contactName: string | null, phone: string): string {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = (contactName || phone).split(" ")[0];

  return text
    .replace(/\{\{nome\}\}/gi, contactName || phone)
    .replace(/\{\{primeiro_nome\}\}/gi, firstName)
    .replace(/\{\{saudacao\}\}/gi, greeting)
    .replace(/\{\{data\}\}/gi, now.toLocaleDateString("pt-BR"))
    .replace(/\{\{hora\}\}/gi, now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
    .replace(/\{\{telefone\}\}/gi, phone)
    .replace(/\{\{protocolo\}\}/gi, `#${Date.now().toString().slice(-6)}`);
}

// ─── Condition evaluator ──────────────────────────────────────────────────────

function evaluateCondition(condition: string, variables: Record<string, string>): boolean {
  try {
    // Replace {varName} with actual values for evaluation
    const resolved = condition.replace(/\{(\w+)\}/g, (_m, k) => variables[k] ?? "");

    // Support: "value == other", "value != other", "value contains text", "value starts text", "value ends text"
    const containsMatch = resolved.match(/^(.+?)\s+contains\s+(.+)$/i);
    if (containsMatch) {
      return String(containsMatch[1]).trim().toLowerCase().includes(String(containsMatch[2]).trim().toLowerCase());
    }

    const startsMatch = resolved.match(/^(.+?)\s+starts\s+(.+)$/i);
    if (startsMatch) {
      return String(startsMatch[1]).trim().toLowerCase().startsWith(String(startsMatch[2]).trim().toLowerCase());
    }

    const endsMatch = resolved.match(/^(.+?)\s+ends\s+(.+)$/i);
    if (endsMatch) {
      return String(endsMatch[1]).trim().toLowerCase().endsWith(String(endsMatch[2]).trim().toLowerCase());
    }

    const eqMatch = resolved.match(/^(.+?)\s*==\s*(.+)$/);
    if (eqMatch) {
      return String(eqMatch[1]).trim() === String(eqMatch[2]).trim();
    }

    const neqMatch = resolved.match(/^(.+?)\s*!=\s*(.+)$/);
    if (neqMatch) {
      return String(neqMatch[1]).trim() !== String(neqMatch[2]).trim();
    }

    const gtMatch = resolved.match(/^(.+?)\s*>\s*(.+)$/);
    if (gtMatch) {
      return Number(gtMatch[1].trim()) > Number(gtMatch[2].trim());
    }

    const ltMatch = resolved.match(/^(.+?)\s*<\s*(.+)$/);
    if (ltMatch) {
      return Number(ltMatch[1].trim()) < Number(ltMatch[2].trim());
    }

    // Fallback: truthy string check
    return resolved.trim().length > 0 && resolved.trim() !== "false" && resolved.trim() !== "0";
  } catch {
    return false;
  }
}

// ─── Send text message via Evolution API ──────────────────────────────────────

async function sendText(
  evolutionUrl: string,
  evolutionKey: string,
  instanceName: string,
  phone: string,
  text: string,
): Promise<void> {
  const baseUrl = evolutionUrl.replace(/\/$/, "");
  const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: evolutionKey },
    body: JSON.stringify({ number: phone, text }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("sendText failed:", res.status, body);
  }
}

// ─── Send media message via Evolution API ─────────────────────────────────────

async function sendMedia(
  evolutionUrl: string,
  evolutionKey: string,
  instanceName: string,
  phone: string,
  mediaUrl: string,
  mediaType: string,
  caption: string,
): Promise<void> {
  const baseUrl = evolutionUrl.replace(/\/$/, "");
  const endpoint = mediaType === "audio"
    ? "sendWhatsAppAudio"
    : mediaType === "document"
    ? "sendDocument"
    : mediaType === "video"
    ? "sendVideo"
    : "sendImage";

  const res = await fetch(`${baseUrl}/message/${endpoint}/${instanceName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: evolutionKey },
    body: JSON.stringify({ number: phone, url: mediaUrl, caption }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`${endpoint} failed:`, res.status, body);
  }
}

// ─── Flow execution engine ────────────────────────────────────────────────────

async function executeFlow(
  supabase: ReturnType<typeof createClient>,
  EVOLUTION_API_URL: string,
  EVOLUTION_API_KEY: string,
  params: ExecuteFlowParams,
): Promise<void> {
  const {
    conversationId, contactId, instanceName, phone, message,
    rule, nodes, connections, variables, sessionId,
  } = params;

  let currentNodeId = params.currentNodeId;
  const vars: Record<string, string> = { ...variables };

  // Helper: get outgoing connections from a node
  const getOutgoing = (nodeId: string): FlowConnection[] =>
    connections.filter((c) => c.from === nodeId);

  // Helper: get next single node id
  const getNextNodeId = (nodeId: string): string | null => {
    const out = getOutgoing(nodeId);
    return out.length > 0 ? out[0].to : null;
  };

  // Helper: upsert session (create or update)
  const upsertSession = async (
    nodeId: string,
    waitingForInput: boolean,
    inputVariable: string | null,
  ): Promise<void> => {
    if (sessionId) {
      await supabase
        .from("chatbot_sessions")
        .update({
          current_node_id: nodeId,
          variables: vars,
          waiting_for_input: waitingForInput,
          input_variable: inputVariable,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId);
    } else {
      await supabase.from("chatbot_sessions").upsert(
        {
          conversation_id: conversationId,
          rule_id: rule.id as string,
          current_node_id: nodeId,
          variables: vars,
          waiting_for_input: waitingForInput,
          input_variable: inputVariable,
        },
        { onConflict: "conversation_id" },
      );
    }
  };

  // Helper: delete session
  const deleteSession = async (): Promise<void> => {
    if (sessionId) {
      await supabase.from("chatbot_sessions").delete().eq("id", sessionId);
    } else {
      await supabase
        .from("chatbot_sessions")
        .delete()
        .eq("conversation_id", conversationId);
    }
  };

  // Helper: save outgoing message to DB
  const saveMessage = async (body: string): Promise<void> => {
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      from_me: true,
      body,
      status: "sent",
    });
  };

  // Resolve node by id
  const getNode = (id: string): FlowNode | undefined =>
    nodes.find((n) => n.id === id);

  // Maximum node traversal guard to prevent infinite loops
  let steps = 0;
  const MAX_STEPS = 50;

  while (currentNodeId && steps < MAX_STEPS) {
    steps++;
    const node = getNode(currentNodeId);

    if (!node) {
      console.warn("Node not found:", currentNodeId);
      await deleteSession();
      break;
    }

    console.log(`Executing node: ${node.id} type=${node.type}`);

    switch (node.type) {
      // ── start ────────────────────────────────────────────────────────────
      case "start": {
        const next = getNextNodeId(currentNodeId);
        if (!next) { await deleteSession(); return; }
        currentNodeId = next;
        break;
      }

      // ── message ──────────────────────────────────────────────────────────
      case "message": {
        const rawText = node.data?.text || "";
        const text = substituteVars(rawText, vars);

        if (node.data?.mediaUrl) {
          const mediaCaption = substituteVars(text, vars);
          await sendMedia(
            EVOLUTION_API_URL,
            EVOLUTION_API_KEY,
            instanceName,
            phone,
            node.data.mediaUrl,
            node.data.mediaType || "image",
            mediaCaption,
          );
          await saveMessage(`[media] ${mediaCaption}`);
        } else if (text) {
          await sendText(EVOLUTION_API_URL, EVOLUTION_API_KEY, instanceName, phone, text);
          await saveMessage(text);
        }

        const next = getNextNodeId(currentNodeId);
        if (!next) { await deleteSession(); return; }
        currentNodeId = next;
        break;
      }

      // ── delay ────────────────────────────────────────────────────────────
      case "delay": {
        const seconds = node.data?.delay ?? 1;
        await new Promise((r) => setTimeout(r, seconds * 1000));
        const next = getNextNodeId(currentNodeId);
        if (!next) { await deleteSession(); return; }
        currentNodeId = next;
        break;
      }

      // ── input ────────────────────────────────────────────────────────────
      case "input": {
        const inputVar = node.data?.inputVariable || node.data?.variable || "__input__";
        await upsertSession(currentNodeId, true, inputVar);
        return; // stop, wait for user reply
      }

      // ── wait ─────────────────────────────────────────────────────────────
      case "wait": {
        // If we're arriving here after waiting, the message is already in vars.__last_message__
        // If we arrived here fresh (no session waiting), set the session to wait
        const alreadyWaited = vars.__wait_done__ === currentNodeId;
        if (!alreadyWaited) {
          vars.__wait_node__ = currentNodeId;
          await upsertSession(currentNodeId, true, "__wait_done__");
          return;
        }
        delete vars.__wait_done__;
        const next = getNextNodeId(currentNodeId);
        if (!next) { await deleteSession(); return; }
        currentNodeId = next;
        break;
      }

      // ── condition ────────────────────────────────────────────────────────
      case "condition": {
        const condition = node.data?.condition || "";
        const result = evaluateCondition(condition, vars);
        const outgoing = getOutgoing(currentNodeId);

        if (outgoing.length === 0) { await deleteSession(); return; }

        let nextId: string | null = null;
        if (outgoing.length === 1) {
          nextId = outgoing[0].to;
        } else {
          // true branch = first connection, false branch = second connection
          // also try matching by label "true"/"false"
          const trueConn = outgoing.find(
            (c) => (c.label || "").toLowerCase() === "true" || (c.label || "").toLowerCase() === "sim",
          );
          const falseConn = outgoing.find(
            (c) => (c.label || "").toLowerCase() === "false" || (c.label || "").toLowerCase() === "não" || (c.label || "").toLowerCase() === "nao",
          );

          if (result) {
            nextId = trueConn ? trueConn.to : outgoing[0].to;
          } else {
            nextId = falseConn ? falseConn.to : (outgoing[1] ? outgoing[1].to : outgoing[0].to);
          }
        }

        if (!nextId) { await deleteSession(); return; }
        currentNodeId = nextId;
        break;
      }

      // ── menu ─────────────────────────────────────────────────────────────
      case "menu": {
        const options = node.data?.options || [];
        const menuText = "Escolha uma opção:\n" +
          options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");

        await sendText(EVOLUTION_API_URL, EVOLUTION_API_KEY, instanceName, phone, menuText);
        await saveMessage(menuText);
        await upsertSession(currentNodeId, true, "__menu_choice__");
        return; // stop, wait for user to pick
      }

      // ── transfer ─────────────────────────────────────────────────────────
      case "transfer": {
        const updatePayload: Record<string, unknown> = { status: "waiting" };
        if (node.data?.transferTo) {
          updatePayload.assigned_to = node.data.transferTo;
        }
        await supabase
          .from("conversations")
          .update(updatePayload)
          .eq("id", conversationId);
        await deleteSession();
        return;
      }

      // ── tag ──────────────────────────────────────────────────────────────
      case "tag": {
        const tag = node.data?.tag;
        if (tag && contactId) {
          // Try to insert into contact_tags; silently ignore if table doesn't exist
          try {
            await supabase
              .from("contact_tags")
              .upsert({ contact_id: contactId, tag }, { onConflict: "contact_id,tag" });
          } catch {
            console.log("contact_tags not available, skipping tag:", tag);
          }
        }
        const next = getNextNodeId(currentNodeId);
        if (!next) { await deleteSession(); return; }
        currentNodeId = next;
        break;
      }

      // ── webhook ──────────────────────────────────────────────────────────
      case "webhook": {
        const url = node.data?.url;
        if (url) {
          try {
            const method = (node.data?.method || "POST").toUpperCase();
            const rawBody = node.data?.body || "{}";
            const body = substituteVars(rawBody, vars);

            const webhookRes = await fetch(url, {
              method,
              headers: { "Content-Type": "application/json" },
              body: method !== "GET" ? body : undefined,
            });
            const responseText = await webhookRes.text();
            vars.__webhook_response__ = responseText;
            console.log("Webhook response:", webhookRes.status, responseText.slice(0, 200));
          } catch (e) {
            console.error("Webhook call failed:", e);
            vars.__webhook_response__ = "";
          }
        }
        const next = getNextNodeId(currentNodeId);
        if (!next) { await deleteSession(); return; }
        currentNodeId = next;
        break;
      }

      // ── ai ───────────────────────────────────────────────────────────────
      case "ai": {
        const rawPrompt = node.data?.aiPrompt || "Responda de forma útil.";
        const prompt = substituteVars(rawPrompt, vars);

        try {
          const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
          if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not set");

          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.0-flash",
              messages: [
                { role: "system", content: "Você é um assistente virtual prestativo. Responda em português brasileiro." },
                { role: "user", content: `${prompt}\n\nMensagem do usuário: ${message}` },
              ],
              max_tokens: 512,
            }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const reply = aiData.choices?.[0]?.message?.content || "";
            vars.__ai_response__ = reply;

            if (reply) {
              await sendText(EVOLUTION_API_URL, EVOLUTION_API_KEY, instanceName, phone, reply);
              await saveMessage(reply);
            }
          } else {
            console.error("AI request failed:", aiRes.status);
            vars.__ai_response__ = "";
          }
        } catch (e) {
          console.error("AI node error:", e);
          vars.__ai_response__ = "";
        }

        const next = getNextNodeId(currentNodeId);
        if (!next) { await deleteSession(); return; }
        currentNodeId = next;
        break;
      }

      // ── end ──────────────────────────────────────────────────────────────
      case "end": {
        await deleteSession();
        return;
      }

      // ── unknown / skip ───────────────────────────────────────────────────
      default: {
        console.log(`Unknown node type "${node.type}", skipping.`);
        const next = getNextNodeId(currentNodeId);
        if (!next) { await deleteSession(); return; }
        currentNodeId = next;
        break;
      }
    }
  }

  if (steps >= MAX_STEPS) {
    console.error("Max steps reached in flow execution, aborting.");
    await deleteSession();
  }
}

// ─── Parse flow_data safely ───────────────────────────────────────────────────

function parseFlowData(raw: unknown): FlowData | null {
  if (!raw) return null;
  try {
    const data = raw as Record<string, unknown>;
    if (Array.isArray(data)) {
      // Legacy: flow_data is just an array of nodes with no connections
      return { nodes: data as FlowNode[], connections: [] };
    }
    if (data.nodes && Array.isArray(data.nodes)) {
      return {
        nodes: data.nodes as FlowNode[],
        connections: Array.isArray(data.connections) ? data.connections as FlowConnection[] : [],
      };
    }
  } catch {
    // ignore
  }
  return null;
}

// ─── Trigger matching ─────────────────────────────────────────────────────────

function matchesTrigger(
  rule: Record<string, unknown>,
  lowerMessage: string,
  isFirstMessage: boolean,
): boolean {
  const triggerType = rule.trigger_type as string;
  if (triggerType === "first_message" && isFirstMessage) return true;
  if (triggerType === "keyword" && rule.trigger_value) {
    const keywords = String(rule.trigger_value)
      .split(",")
      .map((k: string) => k.trim().toLowerCase());
    return keywords.some((kw: string) => lowerMessage.includes(kw));
  }
  if (triggerType === "always") return true;
  return false;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL") || "";
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { conversationId, contactId, instanceName, phone, message } = await req.json();

    // ── 0. Check business hours ────────────────────────────────────────────
    const { data: bhConfig } = await supabase
      .from("business_hours_config")
      .select("enabled, outside_hours_message, timezone")
      .maybeSingle();

    if (bhConfig?.enabled) {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: bhConfig.timezone || "America/Sao_Paulo" });

      const { data: todayHours } = await supabase
        .from("business_hours")
        .select("active, start_time, end_time")
        .eq("day_of_week", dayOfWeek)
        .maybeSingle();

      const isOpen = todayHours?.active && timeStr >= todayHours.start_time.slice(0, 5) && timeStr <= todayHours.end_time.slice(0, 5);

      if (!isOpen && bhConfig.outside_hours_message && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
        await fetch(`${EVOLUTION_API_URL.replace(/\/$/, "")}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({ number: phone, text: bhConfig.outside_hours_message }),
        });
        await supabase.from("messages").insert({ conversation_id: conversationId, from_me: true, body: bhConfig.outside_hours_message, status: "sent" });
        return new Response(JSON.stringify({ triggered: true, reason: "outside_hours" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── 1. Check for an active chatbot session (flow in progress) ──────────
    const { data: session } = await supabase
      .from("chatbot_sessions")
      .select("*")
      .eq("conversation_id", conversationId)
      .maybeSingle();

    if (session) {
      // Fetch the rule this session belongs to
      const { data: sessionRule } = await supabase
        .from("chatbot_rules")
        .select("*")
        .eq("id", session.rule_id)
        .maybeSingle();

      if (sessionRule) {
        const flowData = parseFlowData(sessionRule.flow_data);
        if (flowData) {
          const { nodes, connections } = flowData;
          let vars: Record<string, string> = (session.variables as Record<string, string>) || {};
          let currentNodeId: string = session.current_node_id;

          // ── Resume from current node ─────────────────────────────────────
          if (session.waiting_for_input && session.input_variable) {
            const inputVar = session.input_variable as string;

            if (inputVar === "__menu_choice__") {
              // The session was waiting for a menu selection
              const currentNode = nodes.find((n) => n.id === currentNodeId);
              const options = currentNode?.data?.options || [];
              const lowerMsg = String(message || "").toLowerCase().trim();

              // Try to match by number
              const num = parseInt(lowerMsg, 10);
              if (!isNaN(num) && num >= 1 && num <= options.length) {
                vars[inputVar] = options[num - 1];
              } else {
                // Try to match by option text
                const matched = options.find(
                  (opt) => opt.toLowerCase() === lowerMsg,
                );
                vars[inputVar] = matched || lowerMsg;
              }
            } else if (inputVar === "__wait_done__") {
              // Generic wait node — store message and mark done
              const waitNodeId = vars.__wait_node__ || currentNodeId;
              vars.__wait_done__ = waitNodeId;
              vars.__last_message__ = String(message || "");
            } else {
              // Regular input variable — store raw user message
              vars[inputVar] = String(message || "");
            }

            // Advance to next node after the one that was waiting
            const nextNodeId = connections.find((c) => c.from === currentNodeId)?.to;
            if (nextNodeId) {
              currentNodeId = nextNodeId;
            } else {
              // No next node — end session
              await supabase.from("chatbot_sessions").delete().eq("id", session.id);
              return new Response(
                JSON.stringify({ triggered: true, rule: sessionRule.name, type: "flow_end" }),
                { headers: { ...corsHeaders, "Content-Type": "application/json" } },
              );
            }
          }

          await executeFlow(supabase, EVOLUTION_API_URL, EVOLUTION_API_KEY, {
            conversationId,
            contactId,
            instanceName,
            phone,
            message: String(message || ""),
            rule: sessionRule as Record<string, unknown>,
            nodes,
            connections,
            currentNodeId,
            variables: vars,
            sessionId: session.id as string,
          });

          return new Response(
            JSON.stringify({ triggered: true, rule: sessionRule.name, type: "flow_resume" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }

      // Session exists but rule/flow_data is gone — clean up and fall through
      await supabase.from("chatbot_sessions").delete().eq("id", session.id);
    }

    // ── 2. No active session — look for a matching flow-based rule ─────────
    const { data: rules } = await supabase
      .from("chatbot_rules")
      .select("*")
      .eq("is_active", true)
      .order("priority", { ascending: false });

    if (!rules || rules.length === 0) {
      return new Response(JSON.stringify({ triggered: false, reason: "no rules" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if this is first message in conversation
    const { count: messageCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("from_me", false);

    const isFirstMessage = (messageCount || 0) <= 1;
    const lowerMessage = String(message || "").toLowerCase().trim();

    // Try to find a matching rule that has flow_data
    let flowRule: Record<string, unknown> | null = null;
    for (const rule of rules as Record<string, unknown>[]) {
      if (rule.flow_data && matchesTrigger(rule, lowerMessage, isFirstMessage)) {
        flowRule = rule;
        break;
      }
    }

    if (flowRule) {
      const flowData = parseFlowData(flowRule.flow_data);
      if (flowData) {
        const { nodes, connections } = flowData;
        const startNode = nodes.find((n) => n.type === "start");
        if (!startNode) {
          console.warn("Flow has no start node, rule:", flowRule.id);
        } else {
          await executeFlow(supabase, EVOLUTION_API_URL, EVOLUTION_API_KEY, {
            conversationId,
            contactId,
            instanceName,
            phone,
            message: String(message || ""),
            rule: flowRule,
            nodes,
            connections,
            currentNodeId: startNode.id,
            variables: {},
            sessionId: null,
          });

          return new Response(
            JSON.stringify({ triggered: true, rule: flowRule.name, type: "flow_start" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // ── 3. Fall through to existing rules-based logic ──────────────────────

    // Check if user is responding to a menu (number, option id, label or mapped response)
    let menuResponse = null;
    let menuOpenRequestRule = null;

    for (const rule of rules) {
      if (rule.response_type !== "text" && rule.menu_options?.length) {
        const options = rule.menu_options as { label: string; response: string }[];

        // Open menu request from fallback button (open_menu_<rule_id>)
        const openMenuMatch = lowerMessage.match(/^open_menu_(.+)$/);
        if (rule.response_type === "menu_list" && openMenuMatch) {
          const requestedRuleId = String(openMenuMatch[1] || "").trim().toLowerCase();
          if (requestedRuleId && String(rule.id || "").toLowerCase() === requestedRuleId) {
            menuOpenRequestRule = rule;
            break;
          }
        }

        // Check by number (1, 2, 3...)
        const num = Number.parseInt(lowerMessage, 10);
        if (!Number.isNaN(num) && num >= 1 && num <= options.length) {
          menuResponse = { rule, option: options[num - 1] };
          break;
        }

        // Check by generated option id (option_0, option_1...) from interactive payloads
        const optionIdMatch = lowerMessage.match(/^(?:option|button|btn)_(\d+)$/);
        if (optionIdMatch) {
          const optionIndex = Number.parseInt(optionIdMatch[1], 10);
          if (!Number.isNaN(optionIndex) && optionIndex >= 0 && optionIndex < options.length) {
            menuResponse = { rule, option: options[optionIndex] };
            break;
          }
        }

        // Check by label text or mapped response text
        const matched = options.find((o) => {
          const label = String(o.label || "").toLowerCase().trim();
          const response = String(o.response || "").toLowerCase().trim();
          return lowerMessage === label || lowerMessage === response;
        });

        if (matched) {
          menuResponse = { rule, option: matched };
          break;
        }
      }
    }

    // If user clicked the fallback "VER OPÇÕES" button, send options now
    if (menuOpenRequestRule && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
      const options = menuOpenRequestRule.menu_options as { label: string; description?: string }[] || [];
      if (options.length > 0) {
        const menuText =
          "Escolha uma opção:\n" +
          options.map((o, i) => `${i + 1}. ${o.label}${o.description ? ` - ${o.description}` : ""}`).join("\n");

        const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
        const openMenuRes = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({ number: phone, text: menuText }),
        });
        const openMenuResBody = await openMenuRes.text();
        console.log("open menu sendText response:", openMenuRes.status, openMenuResBody);
        if (!openMenuRes.ok) {
          throw new Error(`open menu sendText failed: ${openMenuRes.status} ${openMenuResBody}`);
        }

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          from_me: true,
          body: menuText,
          status: "sent",
        });

        return new Response(
          JSON.stringify({ triggered: true, rule: menuOpenRequestRule.name, type: "menu_open" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Load contact name for variable substitution
    const { data: contactData } = await supabase
      .from("contacts")
      .select("name")
      .eq("id", contactId)
      .maybeSingle();
    const contactName = contactData?.name || null;

    // If user answered a menu, send the option response
    if (menuResponse && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
      const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
      const menuOptionText = substituteContactVars(menuResponse.option.response, contactName, phone);
      const menuAnswerRes = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({ number: phone, text: menuOptionText }),
      });
      const menuAnswerResBody = await menuAnswerRes.text();
      console.log("menu answer sendText response:", menuAnswerRes.status, menuAnswerResBody);
      if (!menuAnswerRes.ok) {
        throw new Error(`menu answer sendText failed: ${menuAnswerRes.status} ${menuAnswerResBody}`);
      }
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        from_me: true,
        body: menuOptionText,
        status: "sent",
      });
      return new Response(
        JSON.stringify({ triggered: true, rule: menuResponse.rule.name, type: "menu_answer" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Standard trigger matching
    let matchedRule = null;
    for (const rule of rules) {
      if (rule.trigger_type === "first_message" && isFirstMessage) { matchedRule = rule; break; }
      if (rule.trigger_type === "keyword" && rule.trigger_value) {
        const keywords = rule.trigger_value.split(",").map((k: string) => k.trim().toLowerCase());
        if (keywords.some((kw: string) => lowerMessage.includes(kw))) { matchedRule = rule; break; }
      }
      if (rule.trigger_type === "always") { matchedRule = rule; }
    }

    if (!matchedRule) {
      return new Response(JSON.stringify({ triggered: false, reason: "no match" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Increment trigger count
    supabase.from("chatbot_rules").update({ trigger_count: (matchedRule.trigger_count || 0) + 1 }).eq("id", matchedRule.id).then(() => {});

    // Send response via Evolution API
    if (EVOLUTION_API_URL && EVOLUTION_API_KEY) {
      const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
      const responseType = matchedRule.response_type || "text";
      const menuOptions = matchedRule.menu_options as { label: string; response: string; description?: string }[] || [];

      if (responseType === "menu_list" && menuOptions.length > 0) {
        // Parse list metadata from response_text
        let listMeta = { title: "", buttonText: "VER OPÇÕES", footer: "", body: "" };
        try {
          listMeta = { ...listMeta, ...JSON.parse(matchedRule.response_text) };
        } catch {
          listMeta.body = substituteContactVars(matchedRule.response_text, contactName, phone);
        }
        // Apply var substitution to body
        listMeta.body = substituteContactVars(listMeta.body, contactName, phone);

        // Send as interactive list message
        const listRows = menuOptions.map((o, i) => ({
          title: o.label,
          description: o.description || o.label,
          rowId: `option_${i}`,
        }));

        const baseListPayload = {
          number: phone,
          title: listMeta.title || "Menu",
          description: listMeta.body || "Escolha uma opção:",
          buttonText: listMeta.buttonText || "VER OPÇÕES",
          footerText: listMeta.footer || "Selecione uma opção",
        };

        const sendListPayload = async (payload: Record<string, unknown>, format: "sections" | "values") => {
          console.log(`Sending list payload (${format}):`, JSON.stringify(payload));
          const response = await fetch(`${baseUrl}/message/sendList/${instanceName}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
            body: JSON.stringify(payload),
          });
          const responseBody = await response.text();
          console.log(`sendList response (${format}):`, response.status, responseBody);
          return { ok: response.ok, responseBody };
        };

        const sendListResult = await sendListPayload(
          {
            ...baseListPayload,
            sections: [{ title: "Opções", rows: listRows }],
          },
          "sections",
        );

        let sentBody = listMeta.body || "Escolha uma opção:";

        if (!sendListResult.ok) {
          // Evolution sendList está instável em algumas versões (ex: isZero error).
          // Primeiro tentamos botões rápidos clicáveis; se falhar, fallback para texto numerado.
          console.log("sendList failed, trying sendButtons fallback");

          const maxButtons = Math.min(menuOptions.length, 3);
          const buttonLabels = menuOptions.slice(0, maxButtons).map((o) => o.label);
          const baseButtonsPayload = {
            number: phone,
            title: listMeta.title || "Menu",
            description: listMeta.body || "Escolha uma opção:",
            footerText: listMeta.footer || "Selecione uma opção",
          };

          const sendButtonsPayload = async (payload: Record<string, unknown>, format: "simple" | "legacy") => {
            console.log(`Sending buttons payload (${format}):`, JSON.stringify(payload));
            const response = await fetch(`${baseUrl}/message/sendButtons/${instanceName}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
              body: JSON.stringify(payload),
            });
            const responseBody = await response.text();
            console.log(`sendButtons response (${format}):`, response.status, responseBody);
            return { ok: response.ok, responseBody };
          };

          let buttonsSent = false;

          if (maxButtons > 0) {
            const simpleButtonsResult = await sendButtonsPayload(
              {
                ...baseButtonsPayload,
                buttons: menuOptions.slice(0, maxButtons).map((o, i) => ({
                  type: "reply",
                  title: o.label,
                  id: `option_${i}`,
                })),
              },
              "simple",
            );

            if (simpleButtonsResult.ok) {
              buttonsSent = true;
            } else {
              const legacyButtonsResult = await sendButtonsPayload(
                {
                  ...baseButtonsPayload,
                  buttons: menuOptions.slice(0, maxButtons).map((o, i) => ({
                    buttonId: `option_${i}`,
                    buttonText: { displayText: o.label },
                    type: 1,
                  })),
                },
                "legacy",
              );

              buttonsSent = legacyButtonsResult.ok;
            }
          }

          if (buttonsSent) {
            sentBody =
              (listMeta.body || "Escolha uma opção:") +
              "\n\n" +
              buttonLabels.map((label, i) => `${i + 1}. ${label}`).join("\n");
          } else {
            const fallbackText =
              (listMeta.body || "Escolha uma opção:") +
              "\n\n" +
              menuOptions
                .map((o, i) => `${i + 1}. ${o.label}${o.description ? ` - ${o.description}` : ""}`)
                .join("\n");

            console.log("sendButtons failed, falling back to numbered text");
            const fallbackRes = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
              body: JSON.stringify({ number: phone, text: fallbackText }),
            });

            const fallbackResBody = await fallbackRes.text();
            console.log("sendText fallback response:", fallbackRes.status, fallbackResBody);

            if (!fallbackRes.ok) {
              throw new Error(`sendText fallback failed: ${fallbackRes.status} ${fallbackResBody}`);
            }

            sentBody = fallbackText;
          }
        }

        // Save to DB
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          from_me: true,
          body: sentBody,
          status: "sent",
        });

      } else if (responseType === "menu_buttons" && menuOptions.length > 0) {
        // Send as text with numbered options (Evolution API button support varies)
        const menuButtonsText = "Escolha uma opção:\n" + menuOptions.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
        const menuButtonsRes = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({
            number: phone,
            text: menuButtonsText,
          }),
        });
        const menuButtonsResBody = await menuButtonsRes.text();
        console.log("menu_buttons sendText response:", menuButtonsRes.status, menuButtonsResBody);
        if (!menuButtonsRes.ok) {
          throw new Error(`menu_buttons sendText failed: ${menuButtonsRes.status} ${menuButtonsResBody}`);
        }

        const bodyText = menuButtonsText;
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          from_me: true,
          body: bodyText,
          status: "sent",
        });

      } else if (responseType === "menu_numbered" && menuOptions.length > 0) {
        const menuText = "Escolha uma opção:\n" + menuOptions.map((o, i) => `${i + 1}. ${o.label}`).join("\n");
        const menuNumberedRes = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({ number: phone, text: menuText }),
        });
        const menuNumberedResBody = await menuNumberedRes.text();
        console.log("menu_numbered sendText response:", menuNumberedRes.status, menuNumberedResBody);
        if (!menuNumberedRes.ok) {
          throw new Error(`menu_numbered sendText failed: ${menuNumberedRes.status} ${menuNumberedResBody}`);
        }

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          from_me: true,
          body: menuText,
          status: "sent",
        });

      } else {
        // Plain text
        const plainText = substituteContactVars(matchedRule.response_text, contactName, phone);
        const plainTextRes = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({ number: phone, text: plainText }),
        });
        const plainTextResBody = await plainTextRes.text();
        console.log("plain sendText response:", plainTextRes.status, plainTextResBody);
        if (!plainTextRes.ok) {
          throw new Error(`plain sendText failed: ${plainTextRes.status} ${plainTextResBody}`);
        }

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          from_me: true,
          body: plainText,
          status: "sent",
        });
      }
    }

    return new Response(
      JSON.stringify({ triggered: true, rule: matchedRule.name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Chatbot error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
