import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadShortcuts, formatShortcutKey } from "@/hooks/useKeyboardShortcuts";
import { Keyboard } from "lucide-react";

interface ShortcutsCheatsheetProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsCheatsheet({ open, onClose }: ShortcutsCheatsheetProps) {
  const shortcuts = loadShortcuts();
  const categories = [...new Set(shortcuts.map(s => s.category))];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            Atalhos de Teclado
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          Pressione <kbd className="px-1.5 py-0.5 rounded border text-[11px] font-mono">?</kbd> a qualquer momento para abrir este painel.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-h-[65vh] overflow-y-auto pr-1">
          {categories.map(cat => (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="h-px flex-1 bg-border" />
                {cat}
                <span className="h-px flex-1 bg-border" />
              </h3>
              <div className="space-y-2">
                {shortcuts.filter(s => s.category === cat).map(shortcut => (
                  <div
                    key={shortcut.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm text-foreground flex-1">{shortcut.label}</span>
                    <KeyBadge keyStr={shortcut.defaultKey} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t text-xs text-muted-foreground text-center">
          Acesse <strong>Configurações</strong> para personalizar seus atalhos
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KeyBadge({ keyStr }: { keyStr: string }) {
  const parts = formatShortcutKey(keyStr).split(' + ');
  return (
    <div className="flex items-center gap-1 shrink-0">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground text-[10px]">+</span>}
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted text-foreground text-[11px] font-mono font-medium shadow-sm">
            {part}
          </kbd>
        </span>
      ))}
    </div>
  );
}
