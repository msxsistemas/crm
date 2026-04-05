import { useState, useEffect, useCallback, useRef } from "react";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

export interface FollowupReminder {
  id: string;
  conversation_id: string | null;
  contact_id: string | null;
  agent_id: string;
  reminder_at: string;
  note: string | null;
  status: "pending" | "sent" | "dismissed" | "completed";
  created_at: string;
  // joined
  contact_name?: string | null;
  contact_phone?: string | null;
}

export function useFollowupReminders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reminders, setReminders] = useState<FollowupReminder[]>([]);
  const [loading, setLoading] = useState(false);
  const notifiedIds = useRef<Set<string>>(new Set());

  const fetchReminders = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await db
      .from("followup_reminders")
      .select(`
        *,
        contacts:contact_id ( name, phone )
      `)
      .eq("agent_id", user.id)
      .in("status", ["pending"])
      .order("reminder_at", { ascending: true });

    if (data) {
      const mapped: FollowupReminder[] = data.map((r: any) => ({
        ...r,
        contact_name: r.contacts?.name ?? null,
        contact_phone: r.contacts?.phone ?? null,
      }));
      setReminders(mapped);
    }
    setLoading(false);
  }, [user]);

  // Show toast for due reminders
  const checkDueReminders = useCallback(
    (list: FollowupReminder[]) => {
      const now = new Date();
      list.forEach(r => {
        if (
          r.status === "pending" &&
          new Date(r.reminder_at) <= now &&
          !notifiedIds.current.has(r.id)
        ) {
          notifiedIds.current.add(r.id);
          const name = r.contact_name || r.contact_phone || "Contato";
          toast.info(
            `🔔 Follow-up pendente: ${name}${r.note ? ` — ${r.note}` : ""}`,
            {
              duration: 8000,
              action: r.conversation_id
                ? {
                    label: "Ir para conversa",
                    onClick: () => navigate(`/inbox?conversation=${r.conversation_id}`),
                  }
                : undefined,
            }
          );
        }
      });
    },
    [navigate]
  );

  // Fetch on mount and every 5 minutes
  useEffect(() => {
    if (!user) return;
    fetchReminders();
    const interval = setInterval(fetchReminders, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchReminders, user]);

  // Check for due after each fetch
  useEffect(() => {
    checkDueReminders(reminders);
  }, [reminders, checkDueReminders]);

  const updateReminderStatus = async (
    id: string,
    status: "completed" | "dismissed"
  ) => {
    await db
      .from("followup_reminders")
      .update({ status } as any)
      .eq("id", id);
    setReminders(prev => prev.filter(r => r.id !== id));
  };

  const createReminder = async (payload: {
    conversation_id: string | null;
    contact_id: string | null;
    reminder_at: string;
    note: string;
  }) => {
    if (!user) return;
    const { error } = await db.from("followup_reminders").insert({
      ...payload,
      agent_id: user.id,
      status: "pending",
    } as any);
    if (!error) {
      fetchReminders();
    }
    return error;
  };

  // Count of reminders due today or overdue
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const dueTodayCount = reminders.filter(
    r => new Date(r.reminder_at) <= today
  ).length;

  return {
    reminders,
    loading,
    dueTodayCount,
    fetchReminders,
    updateReminderStatus,
    createReminder,
  };
}
