import { useNavigate } from "react-router-dom";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, X, ArrowRight } from "lucide-react";
import { formatDistanceToNow, isPast, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { FollowupReminder } from "@/hooks/useFollowupReminders";
import { cn } from "@/lib/utils";

interface FollowupPanelProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reminders: FollowupReminder[];
  loading: boolean;
  dueTodayCount: number;
  onComplete: (id: string) => void;
  onDismiss: (id: string) => void;
}

export const FollowupPanel = ({
  open,
  onOpenChange,
  reminders,
  loading,
  dueTodayCount,
  onComplete,
  onDismiss,
}: FollowupPanelProps) => {
  const navigate = useNavigate();

  const getReminderColor = (reminder: FollowupReminder) => {
    const at = new Date(reminder.reminder_at);
    if (isPast(at)) return "border-l-red-500 bg-red-50 dark:bg-red-950/20";
    if (isToday(at)) return "border-l-orange-400 bg-orange-50 dark:bg-orange-950/20";
    return "border-l-blue-400";
  };

  const getTimeLabel = (reminder: FollowupReminder) => {
    const at = new Date(reminder.reminder_at);
    if (isPast(at)) {
      return (
        <span className="text-red-600 dark:text-red-400 font-semibold text-[10px]">
          Vencido — {formatDistanceToNow(at, { addSuffix: true, locale: ptBR })}
        </span>
      );
    }
    if (isToday(at)) {
      return (
        <span className="text-orange-600 dark:text-orange-400 font-semibold text-[10px]">
          Hoje às {at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      );
    }
    return (
      <span className="text-muted-foreground text-[10px]">
        {formatDistanceToNow(at, { addSuffix: true, locale: ptBR })}
      </span>
    );
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button className="hover:text-white/80 transition-colors p-1 relative flex items-center justify-center">
          <span className="text-[18px] leading-none select-none">🔔</span>
          {dueTodayCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-0.5 bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
              {dueTodayCount > 99 ? "99+" : dueTodayCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        className="w-80 p-0 max-h-[500px] overflow-y-auto"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-background z-10">
          <div className="flex items-center gap-2">
            <span className="text-base">🔔</span>
            <span className="font-semibold text-sm">Seus follow-ups</span>
            {dueTodayCount > 0 && (
              <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {dueTodayCount} hoje
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="divide-y">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : reminders.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhum follow-up pendente
            </div>
          ) : (
            reminders.map(r => (
              <div
                key={r.id}
                className={cn(
                  "px-4 py-3 border-l-[3px]",
                  getReminderColor(r)
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {r.contact_name || r.contact_phone || "Contato"}
                    </p>
                    {r.note && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{r.note}</p>
                    )}
                    <div className="mt-1">{getTimeLabel(r)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-2.5">
                  {r.conversation_id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1 px-2"
                      onClick={() => {
                        onOpenChange(false);
                        navigate(`/inbox?conversation=${r.conversation_id}`);
                      }}
                    >
                      <ArrowRight className="h-3 w-3" />
                      Ir para conversa
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 px-2 text-green-600 hover:text-green-700"
                    onClick={() => onComplete(r.id)}
                  >
                    <CheckCircle className="h-3 w-3" />
                    Concluir
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1 px-2 text-muted-foreground hover:text-foreground"
                    onClick={() => onDismiss(r.id)}
                  >
                    <X className="h-3 w-3" />
                    Dispensar
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
