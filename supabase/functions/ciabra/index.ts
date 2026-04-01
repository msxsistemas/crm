import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CIABRA_BASE_URL = "https://api.az.center";

function buildAuthHeader(publicKey: string, privateKey: string): string {
  const raw = `${publicKey}:${privateKey}`;
  const encoded = btoa(raw);
  return `Basic ${encoded}`;
}

async function ciabraRequest(
  path: string,
  method: string,
  authHeader: string,
  body?: unknown
) {
  const url = `${CIABRA_BASE_URL}${path}`;
  console.log(`Ciabra ${method} ${url}`);

  const opts: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
  };

  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);
  const data = await res.json();

  if (!res.ok) {
    console.error("Ciabra API error:", JSON.stringify(data));
    throw new Error(
      `Ciabra API [${res.status}]: ${JSON.stringify(data)}`
    );
  }

  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();

    // Read Ciabra keys from gateway_configs table
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: gwConfig, error: gwError } = await supabase
      .from("gateway_configs")
      .select("config, enabled")
      .eq("gateway_name", "ciabra")
      .single();

    if (gwError || !gwConfig) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Ciabra não configurada. Configure as chaves no painel Admin > Gateway.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!gwConfig.enabled) {
      return new Response(
        JSON.stringify({ success: false, error: "Gateway Ciabra está desativado." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const config = gwConfig.config as Record<string, string>;
    const publicKey = config.public_key;
    const privateKey = config.private_key;

    if (!publicKey || !privateKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Chaves Ciabra não configuradas. Adicione public_key e private_key no painel Admin > Gateway.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = buildAuthHeader(publicKey, privateKey);
    let result: unknown;

    switch (action) {
      // Verify credentials
      case "check": {
        result = await ciabraRequest("/auth/applications/check", "GET", authHeader);
        break;
      }

      // Create customer
      case "create_customer": {
        const { fullName, document, email, phone, business, address } = params;
        if (!fullName || !document) {
          return new Response(
            JSON.stringify({ success: false, error: "fullName and document are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        const customerBody: Record<string, unknown> = { fullName, document };
        if (email) customerBody.email = email;
        if (phone) customerBody.phone = phone;
        if (business) customerBody.business = business;
        if (address) customerBody.address = address;

        result = await ciabraRequest(
          "/invoices/applications/customers",
          "POST",
          authHeader,
          customerBody
        );
        break;
      }

      // Get customer detail
      case "get_customer": {
        const { customerId } = params;
        if (!customerId) {
          return new Response(
            JSON.stringify({ success: false, error: "customerId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await ciabraRequest(
          `/invoices/applications/customers/${customerId}`,
          "GET",
          authHeader
        );
        break;
      }

      // Create invoice
      case "create_invoice": {
        const {
          customerId,
          description,
          dueDate,
          price,
          paymentTypes,
          installmentCount,
          invoiceType,
          externalId,
          redirectTo,
          notifications,
          webhooks,
          items,
        } = params;

        if (!customerId || !price) {
          return new Response(
            JSON.stringify({ success: false, error: "customerId and price are required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const normalizedPaymentTypes =
          Array.isArray(paymentTypes) && paymentTypes.length > 0 ? paymentTypes : ["PIX"];
        const normalizedItems = Array.isArray(items) ? items : [];
        const normalizedNotifications = Array.isArray(notifications) ? notifications : [];
        const normalizedWebhooks = Array.isArray(webhooks) ? webhooks : [];

        const invoiceBody: Record<string, unknown> = {
          customerId,
          price: Number(price),
          paymentTypes: normalizedPaymentTypes,
          installmentCount: installmentCount || 1,
          invoiceType: invoiceType || "SINGLE",
          items: normalizedItems,
          notifications: normalizedNotifications,
          webhooks: normalizedWebhooks,
        };

        if (description) invoiceBody.description = description;
        if (dueDate) invoiceBody.dueDate = dueDate;
        if (externalId) invoiceBody.externalId = externalId;
        if (redirectTo) invoiceBody.redirectTo = redirectTo;

        result = await ciabraRequest(
          "/invoices/applications/invoices",
          "POST",
          authHeader,
          invoiceBody
        );
        break;
      }

      // Get invoice detail
      case "get_invoice": {
        const { invoiceId } = params;
        if (!invoiceId) {
          return new Response(
            JSON.stringify({ success: false, error: "invoiceId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await ciabraRequest(
          `/invoices/applications/invoices/${invoiceId}`,
          "GET",
          authHeader
        );
        break;
      }

      // Get installment payments
      case "get_payments": {
        const { installmentId } = params;
        if (!installmentId) {
          return new Response(
            JSON.stringify({ success: false, error: "installmentId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        result = await ciabraRequest(
          `/payments/applications/installments/${installmentId}`,
          "GET",
          authHeader
        );
        break;
      }

      // Get PIX QR code for an installment
      case "get_pix": {
        const { installmentId } = params;
        if (!installmentId) {
          return new Response(
            JSON.stringify({ success: false, error: "installmentId is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Try to get PIX payment info from the installment payments endpoint
        let pixData: unknown = null;
        try {
          pixData = await ciabraRequest(
            `/payments/applications/installments/${installmentId}/pix`,
            "GET",
            authHeader
          );
        } catch (_e1) {
          // Fallback: try the general payments endpoint
          try {
            pixData = await ciabraRequest(
              `/payments/applications/installments/${installmentId}`,
              "GET",
              authHeader
            );
          } catch (_e2) {
            // Last fallback: construct the payment URL
            pixData = {
              paymentUrl: `https://pagar.ciabra.com.br/i/${installmentId}`,
            };
          }
        }

        result = pixData;
        break;
      }

      default:
        return new Response(
          JSON.stringify({
            success: false,
            error: `Unknown action: ${action}. Valid actions: check, create_customer, get_customer, create_invoice, get_invoice, get_payments, get_pix`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ciabra function error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
