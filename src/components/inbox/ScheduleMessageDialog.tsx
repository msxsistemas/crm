import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Conversation {
  contacts: { name?: string | null; phone: string };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation | null;
  messagePreview: string;
  dateTime: string;
  onDateTimeChange: (v: string) => void;
  onConfirm: (dateTime: string) => void;
}

export default function ScheduleMessageDialog({
  open, onOpenChange,
  conversation,
  messagePreview,
  dateTime, onDateTimeChange,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Agendar mensagem
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {conversation && (
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm space-y-1">
              <p className="font-medium text-foreground">{conversation.contacts.name || conversation.contacts.phone}</p>
              <p className="text-muted-foreground">{conversation.contacts.phone}</p>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Prévia da mensagem</label>
            <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-foreground border border-border">
              {messagePreview.slice(0, 80)}{messagePreview.length > 80 ? "..." : ""}
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">Data e hora do envio</label>
            <input
              type="datetime-local"
              value={dateTime}
              onChange={e => onDateTimeChange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="flex-1 gap-2"
            onClick={() => onConfirm(dateTime)}
            disabled={!dateTime}
          >
            <Clock className="h-4 w-4" /> Agendar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
