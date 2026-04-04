import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Bell } from "lucide-react";
import { toast } from "sonner";
import type { useFollowupReminders } from "@/hooks/useFollowupReminders";

interface FollowupDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversationId: string | null;
  contactId: string | null;
  contactName: string | null;
  createReminder: ReturnType<typeof useFollowupReminders>["createReminder"];
}

type QuickOption = {
  label: string;
  getDate: () => Date;
};

const QUICK_OPTIONS: QuickOption[] = [
  {
    label: "Em 1 hora",
    getDate: () => {
      const d = new Date();
      d.setHours(d.getHours() + 1);
      return d;
    },
  },
  {
    label: "Hoje à tarde (17h)",
    getDate: () => {
      const d = new Date();
      d.setHours(17, 0, 0, 0);
      return d;
    },
  },
  {
    label: "Amanhã de manhã (9h)",
    getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  {
    label: "Em 3 dias",
    getDate: () => {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
];

function toLocalDatetimeValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const FollowupDialog = ({
  open,
  onOpenChange,
  conversationId,
  contactId,
  contactName,
  createReminder,
}: FollowupDialogProps) => {
  const defaultDate = () => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return d;
  };

  const [selectedQuick, setSelectedQuick] = useState<number | null>(null);
  const [customDate, setCustomDate] = useState(toLocalDatetimeValue(defaultDate()));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const handleQuick = (idx: number) => {
    setSelectedQuick(idx);
    const d = QUICK_OPTIONS[idx].getDate();
    setCustomDate(toLocalDatetimeValue(d));
  };

  const handleSave = async () => {
    if (!customDate) {
      toast.error("Selecione uma data/hora");
      return;
    }
    const reminderAt = new Date(customDate).toISOString();
    setSaving(true);
    const error = await createReminder({
      conversation_id: conversationId,
      contact_id: contactId,
      reminder_at: reminderAt,
      note: note.trim(),
    });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar lembrete");
      return;
    }
    toast.success("Lembrete de follow-up criado!");
    setNote("");
    setSelectedQuick(null);
    setCustomDate(toLocalDatetimeValue(defaultDate()));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" />
            Lembrete de Follow-up
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Contact (readonly) */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Contato</Label>
            <Input
              value={contactName || "—"}
              readOnly
              className="bg-muted/50 cursor-default"
            />
          </div>

          {/* Quick options */}
          <div className="space-y-1.5">
            <Label>Quando</Label>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_OPTIONS.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuick(idx)}
                  className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors text-left ${
                    selectedQuick === idx
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom date/time */}
          <div className="space-y-1.5">
            <Label htmlFor="custom-datetime" className="text-xs text-muted-foreground">
              Personalizado
            </Label>
            <Input
              id="custom-datetime"
              type="datetime-local"
              value={customDate}
              onChange={e => {
                setCustomDate(e.target.value);
                setSelectedQuick(null);
              }}
            />
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label htmlFor="followup-note">Anotação</Label>
            <Textarea
              id="followup-note"
              placeholder="O que precisa ser feito? (opcional)"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Salvar lembrete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FollowupDialog;
