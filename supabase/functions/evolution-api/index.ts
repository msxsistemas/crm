

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

  if (!EVOLUTION_API_URL) {
    return new Response(JSON.stringify({ error: "EVOLUTION_API_URL not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!EVOLUTION_API_KEY) {
    return new Response(JSON.stringify({ error: "EVOLUTION_API_KEY not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { action, instanceName, data } = await req.json();
    const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");
    let endpoint = "";
    let method = "GET";
    let body: string | undefined;

    switch (action) {
      case "create_instance":
        endpoint = `/instance/create`;
        method = "POST";
        body = JSON.stringify({
          instanceName: data.instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        });
        break;

      case "get_qrcode":
        endpoint = `/instance/connect/${instanceName}`;
        method = "GET";
        break;

      case "instance_status":
        endpoint = `/instance/connectionState/${instanceName}`;
        method = "GET";
        break;

      case "send_message":
        endpoint = `/message/sendText/${instanceName}`;
        method = "POST";
        body = JSON.stringify({
          number: data.phone,
          text: data.message,
        });
        break;

      case "send_media":
        endpoint = `/message/sendMedia/${instanceName}`;
        method = "POST";
        body = JSON.stringify({
          number: data.phone,
          mediatype: data.mediaType,
          media: data.mediaUrl,
          caption: data.caption || "",
        });
        break;

      case "list_instances":
        endpoint = `/instance/fetchInstances`;
        method = "GET";
        break;

      case "set_webhook":
        endpoint = `/webhook/set/${instanceName}`;
        method = "POST";
        body = JSON.stringify({
          webhook: {
            url: data.webhookUrl,
            enabled: true,
            webhookByEvents: false,
            webhookBase64: true,
            events: [
              "MESSAGES_UPSERT",
              "MESSAGES_UPDATE",
              "CONNECTION_UPDATE",
              "QRCODE_UPDATED",
            ],
          },
        });
        break;

      case "fetch_profile_pic":
        endpoint = `/chat/fetchProfilePictureUrl/${instanceName}`;
        method = "POST";
        body = JSON.stringify({ number: data.phone });
        break;

      case "set_presence":
        endpoint = `/instance/setPresence/${instanceName}`;
        method = "POST";
        body = JSON.stringify({ presence: data.presence });
        break;

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_API_KEY,
      },
      body,
    });

    const rawResponse = await response.text();
    let responseData: any = null;

    try {
      responseData = rawResponse ? JSON.parse(rawResponse) : null;
    } catch {
      responseData = { raw: rawResponse };
    }

    if (!response.ok) {
      const isNotFound = response.status === 404 && (action === "instance_status" || action === "get_qrcode");

      if (isNotFound) {
        const safePayload = action === "instance_status"
          ? {
              instance: { instanceName, state: "not_found" },
              exists: false,
              notFound: true,
              details: responseData,
            }
          : {
              qrcode: null,
              exists: false,
              notFound: true,
              details: responseData,
            };

        return new Response(JSON.stringify(safePayload), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.error(`Evolution API error [${response.status}]:`, responseData);
      return new Response(JSON.stringify({ error: "Evolution API error", details: responseData }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(responseData ?? {}), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
