import { Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: string;
  onAmountChange: (v: string) => void;
  pixKey: string;
  onPixKeyChange: (v: string) => void;
  pixKeyType: string;
  onPixKeyTypeChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  merchantName: string;
  onMerchantNameChange: (v: string) => void;
  merchantCity: string;
  onMerchantCityChange: (v: string) => void;
  payload: string | null;
  onGenerate: () => void;
  onSend: () => void;
}

export default function PixDialog({
  open, onOpenChange,
  amount, onAmountChange,
  pixKey, onPixKeyChange,
  pixKeyType, onPixKeyTypeChange,
  description, onDescriptionChange,
  merchantName, onMerchantNameChange,
  merchantCity, onMerchantCityChange,
  payload, onGenerate, onSend,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">💸</span>
            Gerar cobrança Pix
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Tipo de chave</Label>
              <Select value={pixKeyType} onValueChange={onPixKeyTypeChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">CPF</SelectItem>
                  <SelectItem value="cnpj">CNPJ</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="telefone">Telefone</SelectItem>
                  <SelectItem value="aleatoria">Aleatória</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium mb-1.5 block">Chave Pix</Label>
            <Input placeholder="Informe sua chave Pix" value={pixKey} onChange={(e) => onPixKeyChange(e.target.value)} />
          </div>
          <div>
            <Label className="text-sm font-medium mb-1.5 block">Descrição</Label>
            <Input placeholder="Identificador da cobrança" value={description} onChange={(e) => onDescriptionChange(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Nome do recebedor</Label>
              <Input placeholder="Seu nome" value={merchantName} onChange={(e) => onMerchantNameChange(e.target.value)} maxLength={25} />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Cidade</Label>
              <Input placeholder="Sua cidade" value={merchantCity} onChange={(e) => onMerchantCityChange(e.target.value)} maxLength={15} />
            </div>
          </div>
          <Button className="w-full gap-2" onClick={onGenerate}>
            Gerar QR Code / Código Pix
          </Button>
          {payload && (
            <div className="space-y-3">
              <div className="rounded-lg bg-muted p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Código Pix — copia e cola</p>
                <p className="text-xs font-mono break-all text-foreground select-all leading-relaxed">{payload}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => { navigator.clipboard.writeText(payload); toast.success("Código copiado!"); }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copiar código
                </Button>
              </div>
              <div className="rounded-lg border border-border p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prévia da mensagem</p>
                <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                  {`💸 *Cobrança Pix*\nValor: R$ ${(parseFloat(amount.replace(",", ".")) || 0).toFixed(2).replace(".", ",")}\nDescrição: ${description || "—"}\n\n*Chave Pix:* ${pixKey}\n*Tipo:* ${pixKeyType}\n\nCódigo Pix (copia e cola):\n${payload.slice(0, 60)}...`}
                </p>
              </div>
              <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={onSend}>
                <Send className="h-4 w-4" />
                Enviar no chat
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
