import { GitMerge, RotateCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface Conversation {
  id: string;
  status: string;
  created_at?: string;
  last_message_body?: string;
  contacts: { name?: string | null; phone: string };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targets: Conversation[];
  search: string;
  onSearchChange: (v: string) => void;
  merging: boolean;
  onMerge: (targetId: string) => void;
}

export default function MergeConversationsDialog({
  open, onOpenChange,
  targets, search, onSearchChange,
  merging, onMerge,
}: Props) {
  const filtered = targets.filter((c) => {
    if (!search) return true;
    const name = (c.contacts?.name || "").toLowerCase();
    const phone = (c.contacts?.phone || "").toLowerCase();
    const date = c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "";
    return name.includes(search.toLowerCase()) || phone.includes(search.toLowerCase()) || date.includes(search);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-primary" />
            Mesclar com outra conversa
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2 pb-2">
          Todas as mensagens da conversa atual serão movidas para a conversa selecionada.
        </p>
        <div className="flex flex-col gap-3 flex-1 overflow-hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversa..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-thin">
            {filtered.length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">
                Nenhuma outra conversa encontrada para este contato.
              </p>
            )}
            {filtered.map((c) => (
              <div key={c.id} className="border border-border rounded-lg p-3 hover:bg-accent transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {c.status === "closed" ? (
                        <Badge className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0 font-normal">Encerrada</Badge>
                      ) : c.status === "open" ? (
                        <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1.5 py-0 font-normal">Aguardando</Badge>
                      ) : (
                        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5 py-0 font-normal">Em atendimento</Badge>
                      )}
                      {c.created_at && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(c.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                        </span>
                      )}
                    </div>
                    {c.last_message_body && (
                      <p className="text-xs text-muted-foreground truncate">{c.last_message_body}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 h-7 px-3 text-xs shrink-0"
                    onClick={() => onMerge(c.id)}
                    disabled={merging}
                  >
                    {merging ? <RotateCw className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
                    Mesclar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
