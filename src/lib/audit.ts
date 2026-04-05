import { db } from "@/lib/db";

export async function logAudit(
  action: string,
  resourceType: string,
  resourceId: string,
  resourceName: string,
  metadata: Record<string, unknown> = {}
) {
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return;

  const { data: profile } = await db
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .single();

  db
    .from("access_audit")
    .insert({
      user_id: user.id,
      user_name: (profile as { name?: string } | null)?.name || user.email,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      resource_name: resourceName,
      metadata,
    })
    .then(() => {}); // fire and forget
}
