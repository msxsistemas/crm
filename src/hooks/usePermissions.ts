import { useAuth } from "@/hooks/useAuth";

export interface AgentPermissions {
  pages: {
    inbox: boolean;
    contacts: boolean;
    campaigns: boolean;
    reports: boolean;
    financial: boolean;
    settings: boolean;
    supervisor: boolean;
    kanban: boolean;
    bots: boolean;
  };
  actions: {
    export_contacts: boolean;
    delete_contacts: boolean;
    send_campaigns: boolean;
    view_all_conversations: boolean;
    transfer_conversations: boolean;
    close_conversations: boolean;
    manage_tags: boolean;
  };
}

export const DEFAULT_PERMISSIONS: AgentPermissions = {
  pages: {
    inbox: true,
    contacts: true,
    campaigns: false,
    reports: false,
    financial: false,
    settings: false,
    supervisor: false,
    kanban: true,
    bots: false,
  },
  actions: {
    export_contacts: false,
    delete_contacts: false,
    send_campaigns: false,
    view_all_conversations: true,
    transfer_conversations: true,
    close_conversations: true,
    manage_tags: true,
  },
};

export function usePermissions() {
  const { profile } = useAuth();

  const can = (action: keyof AgentPermissions["actions"]): boolean => {
    if (profile?.role === "admin") return true;
    const perms = profile?.permissions as Partial<AgentPermissions> | undefined;
    return perms?.actions?.[action] ?? DEFAULT_PERMISSIONS.actions[action];
  };

  const canPage = (page: keyof AgentPermissions["pages"]): boolean => {
    if (profile?.role === "admin") return true;
    const perms = profile?.permissions as Partial<AgentPermissions> | undefined;
    return perms?.pages?.[page] ?? DEFAULT_PERMISSIONS.pages[page];
  };

  return { can, canPage };
}
