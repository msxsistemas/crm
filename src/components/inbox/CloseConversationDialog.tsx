import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface CloseConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose: (message?: string) => void;
}

const CloseConversationDialog = ({ open, onOpenChange, onClose }: CloseConversationDialogProps) => {
  const [closingMessage, setClosingMessage] = useState("");
  const [showMessageInput, setShowMessageInput] = useState(false);

  const handleReset = () => {
    setClosingMessage("");
    setShowMessageInput(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) handleReset(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Encerrando o atendimento!</DialogTitle>
        </DialogHeader>
        {!showMessageInput ? (
          <div className="flex gap-3 pt-4">
            <Button
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6"
              onClick={() => { onClose(); handleReset(); }}
            >
              RESOLVER SEM MENSAGEM DE ENCERRAMENTO
            </Button>
            <Button
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6"
              onClick={() => setShowMessageInput(true)}
            >
              RESOLVER COM MENSAGEM DE ENCERRAMENTO
            </Button>
          </div>
        ) : (
          <div className="space-y-3 pt-4">
            <Textarea
              placeholder="Digite a mensagem de encerramento..."
              value={closingMessage}
              onChange={(e) => setClosingMessage(e.target.value)}
              rows={3}
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowMessageInput(false)}>
                Voltar
              </Button>
              <Button
                className="flex-1"
                onClick={() => { onClose(closingMessage); handleReset(); }}
                disabled={!closingMessage.trim()}
              >
                Enviar e Encerrar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CloseConversationDialog;
