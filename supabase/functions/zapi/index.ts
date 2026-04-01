const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, instanceId, instanceToken, clientToken, data } = await req.json();

    if (!instanceId || !instanceToken || !clientToken) {
      return new Response(
        JSON.stringify({ error: "Z-API credentials (instanceId, instanceToken, clientToken) are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const baseUrl = `https://api.z-api.io/instances/${instanceId}/token/${instanceToken}`;
    let endpoint = "";
    let method = "GET";
    let body: string | undefined;

    switch (action) {
      case "get_qrcode":
        endpoint = `/qr-code`;
        method = "GET";
        break;

      case "get_status":
        endpoint = `/status`;
        method = "GET";
        break;

      case "disconnect":
        endpoint = `/disconnect`;
        method = "GET";
        break;

      case "send_message":
        endpoint = `/send-text`;
        method = "POST";
        body = JSON.stringify({
          phone: data.phone,
          message: data.message,
        });
        break;

      case "send_media":
        endpoint = `/send-image`;
        method = "POST";
        body = JSON.stringify({
          phone: data.phone,
          image: data.mediaUrl,
          caption: data.caption || "",
        });
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Client-Token": clientToken,
      },
      body,
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error(`Z-API error [${response.status}]:`, responseData);
      return new Response(
        JSON.stringify({ error: "Z-API error", details: responseData }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Z-API edge function error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
