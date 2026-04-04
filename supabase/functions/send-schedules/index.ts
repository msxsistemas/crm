import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function addInterval(date: Date, interval: string): Date | null {
  const d = new Date(date);
  switch (interval) {
    case "daily":
    case "custom":
      d.setDate(d.getDate() + 1);
      return d;
    case "weekly":
      d.setDate(d.getDate() + 7);
      return d;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      return d;
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase env vars" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing Evolution API env vars" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const now = new Date().toISOString();

  // Fetch pending schedules that are due
  const { data: schedules, error: fetchError } = await supabase
    .from("schedules")
    .select("*, evolution_connections!connection_id(instance_name)")
    .eq("status", "pending")
    .lte("send_at", now);

  if (fetchError) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch schedules", details: fetchError.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let processed = 0;
  let sent = 0;
  let failed = 0;

  const baseUrl = EVOLUTION_API_URL.replace(/\/$/, "");

  for (const schedule of schedules ?? []) {
    processed++;

    const instanceName =
      schedule.evolution_connections?.instance_name ?? null;

    if (!instanceName || !schedule.contact_phone || !schedule.message) {
      // Mark as failed — missing required data
      await supabase
        .from("schedules")
        .update({ status: "failed" })
        .eq("id", schedule.id);
      failed++;
      continue;
    }

    let sendOk = false;
    try {
      const res = await fetch(
        `${baseUrl}/message/sendText/${instanceName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: schedule.contact_phone,
            text: schedule.message,
          }),
        }
      );
      sendOk = res.ok;
    } catch {
      sendOk = false;
    }

    if (sendOk) {
      await supabase
        .from("schedules")
        .update({ status: "sent" })
        .eq("id", schedule.id);
      sent++;

      // Handle recurrence: create next occurrence if interval is set
      const interval: string = schedule.repeat_interval ?? "none";
      if (interval && interval !== "none") {
        const nextSendAt = addInterval(new Date(schedule.send_at), interval);
        if (nextSendAt) {
          await supabase.from("schedules").insert({
            user_id: schedule.user_id,
            contact_name: schedule.contact_name,
            contact_phone: schedule.contact_phone,
            connection_id: schedule.connection_id,
            queue: schedule.queue,
            message: schedule.message,
            send_at: nextSendAt.toISOString(),
            status: "pending",
            open_ticket: schedule.open_ticket,
            create_note: schedule.create_note,
            repeat_interval: schedule.repeat_interval,
            repeat_daily: schedule.repeat_daily,
            repeat_count: schedule.repeat_count,
          });
        }
      }
    } else {
      await supabase
        .from("schedules")
        .update({ status: "failed" })
        .eq("id", schedule.id);
      failed++;
    }
  }

  return new Response(
    JSON.stringify({ processed, sent, failed }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
