import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller } } = await callerClient.auth.getUser();
    if (!caller) throw new Error("Not authenticated");

    const { data: roleCheck } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleCheck) throw new Error("Not authorized - admin only");

    const body = await req.json();
    const { mode, user_id, email, password, name, company_name, plan_id, expires_at } = body;

    let targetUserId = user_id;

    if (mode === "new") {
      if (!email || !password) throw new Error("Email and password required");

      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name || company_name },
      });

      if (createError) throw new Error("Error creating user: " + createError.message);
      targetUserId = newUser.user.id;
    }

    if (!targetUserId) throw new Error("No user ID");

    // Create reseller account
    const { error: accError } = await supabaseAdmin.from("reseller_accounts").insert({
      user_id: targetUserId,
      company_name: company_name || null,
      plan_id: plan_id || null,
      expires_at: expires_at || null,
    });
    if (accError) throw new Error(accError.message);

    // Assign reseller role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", targetUserId);
    await supabaseAdmin.from("user_roles").insert({ user_id: targetUserId, role: "reseller" });

    return new Response(JSON.stringify({ success: true, user_id: targetUserId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
