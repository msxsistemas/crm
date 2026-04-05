import { FileText, RotateCw, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { db } from "@/lib/db";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: string;
  loading: boolean;
  conversationId: string | null;
  userId: string | undefined;
  authorName: string;
  onClose: () => void;
}

export default function SummaryDialog({
  open, onOpenChange,
  summary, loading,
  conversationId, userId, authorName,
  onClose,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-purple-500" />
            Resumo da Conversa
          </DialogTitle>
        </DialogHeader>
        <div className="py-3">
          {loading ? (
            <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
              <RotateCw className="h-5 w-5 animate-spin" />
              <span className="text-sm">Gerando resumo...</span>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {summary || 'Nenhum resumo disponível.'}
            </div>
          )}
        </div>
        <DialogFooter className="flex flex-row gap-2 sm:justify-start">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading || !summary}
            onClick={() => { navigator.clipboard.writeText(summary); toast.success('Resumo copiado!'); }}
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar resumo
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading || !summary || !conversationId}
            onClick={async () => {
              if (!conversationId || !summary) return;
              await db.from('conversation_notes').insert({
                conversation_id: conversationId,
                user_id: userId,
                content: `[Resumo IA]\n${summary}`,
                author_name: authorName,
                is_internal: true,
              } as any);
              toast.success('Resumo adicionado como nota interna!');
              onOpenChange(false);
              onClose();
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            Usar como nota interna
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { onOpenChange(false); onClose(); }}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
