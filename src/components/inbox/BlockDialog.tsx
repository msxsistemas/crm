import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Expiration = "nunca" | "7" | "30" | "90" | "custom";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  reason: string;
  onReasonChange: (v: string) => void;
  expiration: Expiration;
  onExpirationChange: (v: Expiration) => void;
  customDate: string;
  onCustomDateChange: (v: string) => void;
  blocking: boolean;
  onConfirm: () => void;
}

export default function BlockDialog({
  open, onOpenChange,
  phone, onPhoneChange,
  reason, onReasonChange,
  expiration, onExpirationChange,
  customDate, onCustomDateChange,
  blocking, onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-red-500" /> Bloquear número
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Telefone</Label>
            <input
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
              placeholder="Ex: 5511999999999"
              value={phone}
              onChange={e => onPhoneChange(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Use o formato internacional</p>
          </div>
          <div className="space-y-1.5">
            <Label>Motivo <span className="text-red-500">*</span></Label>
            <Textarea
              placeholder="Descreva o motivo do bloqueio..."
              value={reason}
              onChange={e => onReasonChange(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Expiração</Label>
            <Select value={expiration} onValueChange={v => onExpirationChange(v as Expiration)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nunca">Nunca</SelectItem>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
                <SelectItem value="custom">Data específica</SelectItem>
              </SelectContent>
            </Select>
            {expiration === "custom" && (
              <input
                type="date"
                value={customDate}
                onChange={e => onCustomDateChange(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={onConfirm}
            disabled={blocking}
          >
            {blocking ? "Bloqueando..." : "Bloquear"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
