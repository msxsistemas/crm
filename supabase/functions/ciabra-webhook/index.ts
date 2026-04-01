import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const body = await req.json();
    console.log("Ciabra webhook received:", JSON.stringify(body));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const eventType = body.hookType || body.event || body.type || "unknown";
    const invoiceId = body.invoiceId || body.invoice?.id || body.id || null;
    const externalId = body.externalId || body.invoice?.externalId || null;
    const paymentStatus = body.status || body.paymentStatus || null;

    console.log(`Ciabra event: ${eventType}, invoice: ${invoiceId}, externalId: ${externalId}, status: ${paymentStatus}`);

    // Handle payment confirmation events
    const isPaymentConfirmed =
      eventType === "PAYMENT_CONFIRMED" ||
      eventType === "PAYMENT_RECEIVED" ||
      eventType === "INVOICE_PAID" ||
      eventType === "INSTALLMENT_PAID" ||
      paymentStatus === "PAID" ||
      paymentStatus === "CONFIRMED";

    if (isPaymentConfirmed && externalId) {
      // Parse externalId format: sub_{userId}_{planId}_{timestamp}
      const parts = externalId.split("_");
      if (parts.length >= 3 && parts[0] === "sub") {
        const userId = parts[1];
        const planId = parts[2];

        console.log(`Activating subscription for user ${userId}, plan ${planId}`);

        // Calculate expiry (30 days from now)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        // Update existing pending subscription or insert
        const { data: existing } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("ciabra_external_id", externalId)
          .single();

        if (existing) {
          const { error } = await supabase
            .from("subscriptions")
            .update({
              status: "active",
              paid_at: new Date().toISOString(),
              expires_at: expiresAt.toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

          if (error) {
            console.error("Error updating subscription:", error);
          } else {
            console.log(`Subscription ${existing.id} activated`);
          }
        } else {
          // Insert new active subscription
          const { error } = await supabase
            .from("subscriptions")
            .insert({
              user_id: userId,
              plan_id: planId,
              status: "active",
              ciabra_invoice_id: invoiceId,
              ciabra_external_id: externalId,
              payment_method: "pix",
              paid_at: new Date().toISOString(),
              expires_at: expiresAt.toISOString(),
            });

          if (error) {
            console.error("Error creating subscription:", error);
          } else {
            console.log(`Subscription created and activated for user ${userId}`);
          }
        }

        // Also update reseller_transactions if applicable
        const { error: txError } = await supabase
          .from("reseller_transactions")
          .update({ status: "paid" })
          .eq("description", externalId);

        if (txError) {
          console.warn("No matching reseller_transaction found:", txError.message);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ciabra webhook error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Webhook processing failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
