import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { conversationId, contactId, instanceName, phone, message } = await req.json();

    // Get active chatbot rules ordered by priority
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
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // If user answered a menu, send the option response
    if (menuResponse && EVOLUTION_API_URL && EVOLUTION_API_KEY) {
      const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
      const menuAnswerRes = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
        body: JSON.stringify({ number: phone, text: menuResponse.option.response }),
      });
      const menuAnswerResBody = await menuAnswerRes.text();
      console.log("menu answer sendText response:", menuAnswerRes.status, menuAnswerResBody);
      if (!menuAnswerRes.ok) {
        throw new Error(`menu answer sendText failed: ${menuAnswerRes.status} ${menuAnswerResBody}`);
      }
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        from_me: true,
        body: menuResponse.option.response,
        status: "sent",
      });
      return new Response(
        JSON.stringify({ triggered: true, rule: menuResponse.rule.name, type: "menu_answer" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
          listMeta.body = matchedRule.response_text;
        }

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
          "sections"
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
              "simple"
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
                "legacy"
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
        const plainTextRes = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
          body: JSON.stringify({ number: phone, text: matchedRule.response_text }),
        });
        const plainTextResBody = await plainTextRes.text();
        console.log("plain sendText response:", plainTextRes.status, plainTextResBody);
        if (!plainTextRes.ok) {
          throw new Error(`plain sendText failed: ${plainTextRes.status} ${plainTextResBody}`);
        }

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          from_me: true,
          body: matchedRule.response_text,
          status: "sent",
        });
      }
    }

    return new Response(
      JSON.stringify({ triggered: true, rule: matchedRule.name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Chatbot error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
