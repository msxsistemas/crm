import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SHORTCUTS = [
  { key: "J", action: "Próxima conversa" },
  { key: "K", action: "Conversa anterior" },
  { key: "R", action: "Focar campo de resposta" },
  { key: "N", action: "Marcar conversa como lida" },
  { key: "S", action: "Favoritar/Desfavoritar conversa" },
  { key: "Esc", action: "Fechar modal / Desselecionar conversa" },
  { key: "Ctrl+K", action: "Busca global" },
  { key: "Ctrl+Enter", action: "Enviar mensagem" },
  { key: "Ctrl+/", action: "Mostrar esta ajuda" },
];

export default function ShortcutsModal({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-base font-bold">Atalhos de Teclado</span>
          </DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase border-b border-border">
                <th className="text-left pb-2 font-semibold">Atalho</th>
                <th className="text-left pb-2 font-semibold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {SHORTCUTS.map(({ key, action }) => (
                <tr key={key} className="py-2">
                  <td className="py-2 pr-4">
                    <kbd className="bg-muted border border-border rounded px-2 py-0.5 text-xs font-mono font-semibold text-foreground">
                      {key}
                    </kbd>
                  </td>
                  <td className="py-2 text-muted-foreground">{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
