import { useAuth } from "./useAuth";

export type AppRole = "admin" | "reseller" | "user";

export function useUserRole() {
  const { user, loading } = useAuth();

  const role = user?.role ?? "agent";
  const isAdmin = role === "admin";
  const isSupervisor = role === "supervisor";
  const isReseller = false; // no reseller concept in new backend
  const isUser = !isAdmin;

  return {
    roles: [role] as AppRole[],
    loading,
    isAdmin,
    isReseller,
    isUser,
    isSupervisor,
  };
}
