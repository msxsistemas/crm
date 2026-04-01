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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify caller is admin
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const url = new URL(req.url);

    let requestBody: Record<string, unknown> = {};
    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        requestBody = await req.json();
      } catch {
        requestBody = {};
      }
    }

    const queryAction = url.searchParams.get("action");
    const bodyAction = typeof requestBody.action === "string" ? requestBody.action : null;
    const action = (queryAction || bodyAction || (req.method === "GET" ? "list" : "")).toLowerCase();

    if (action === "list") {
      const {
        data: { users },
        error,
      } = await adminClient.auth.admin.listUsers({ perPage: 1000 });

      if (error) throw error;

      const emailMap = users.map((u) => ({
        id: u.id,
        email: u.email,
      }));

      return new Response(JSON.stringify({ users: emailMap }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Actions that require admin role
    if (!["delete", "set-role"].includes(action)) {
      return new Response(JSON.stringify({ error: "Invalid action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roleData } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetUserId = typeof requestBody.userId === "string" ? requestBody.userId : null;
    if (!targetUserId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "set-role") {
      const newRole = typeof requestBody.role === "string" ? requestBody.role : null;
      // Delete existing roles
      await adminClient.from("user_roles").delete().eq("user_id", targetUserId);
      // Insert new role if not "user" (default)
      if (newRole && newRole !== "user") {
        await adminClient.from("user_roles").insert({ user_id: targetUserId, role: newRole });
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // action === "delete"
    await adminClient.from("user_roles").delete().eq("user_id", targetUserId);
    await adminClient.from("profiles").delete().eq("id", targetUserId);

    const { error } = await adminClient.auth.admin.deleteUser(targetUserId);
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
