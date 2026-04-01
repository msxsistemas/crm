import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export type AppRole = "admin" | "reseller" | "user";

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const fetchRoles = async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (error) {
        console.error("Error fetching roles:", error);
        setRoles([]);
      } else {
        setRoles((data || []).map((r: any) => r.role as AppRole));
      }
      setLoading(false);
    };

    fetchRoles();
  }, [user, authLoading]);

  return {
    roles,
    loading,
    isAdmin: roles.includes("admin"),
    isReseller: roles.includes("reseller"),
    isUser: roles.includes("user") || roles.length === 0,
  };
}
