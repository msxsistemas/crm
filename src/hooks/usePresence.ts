import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AgentPresence {
  user_id: string;
  name: string;
  avatar_url?: string;
  status: "online" | "away" | "offline";
  last_seen: string;
}

export function usePresence(userId: string | undefined, userName: string) {
  const [onlineAgents, setOnlineAgents] = useState<AgentPresence[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel("agent-presence", {
      config: { presence: { key: userId } },
    });

    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<AgentPresence>();
        const agents: AgentPresence[] = [];
        for (const key of Object.keys(state)) {
          const presences = state[key] as AgentPresence[];
          if (presences.length > 0) {
            agents.push(presences[presences.length - 1]);
          }
        }
        setOnlineAgents(agents);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({
            user_id: userId,
            name: userName,
            status: "online",
            last_seen: new Date().toISOString(),
          } as AgentPresence);
        }
      });

    // Handle window focus/blur for away status
    const handleBlur = async () => {
      await channel.track({
        user_id: userId,
        name: userName,
        status: "away",
        last_seen: new Date().toISOString(),
      } as AgentPresence);
    };

    const handleFocus = async () => {
      await channel.track({
        user_id: userId,
        name: userName,
        status: "online",
        last_seen: new Date().toISOString(),
      } as AgentPresence);
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      supabase.removeChannel(channel);
    };
  }, [userId, userName]);

  const updateStatus = async (status: "online" | "away" | "offline") => {
    if (!channelRef.current || !userId) return;
    await channelRef.current.track({
      user_id: userId,
      name: userName,
      status,
      last_seen: new Date().toISOString(),
    } as AgentPresence);
  };

  return { onlineAgents, updateStatus };
}
