import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DEFAULT_SHORTCUTS,
  ShortcutDefinition,
  loadShortcuts,
  saveShortcuts,
  formatShortcutKey,
} from "@/hooks/useKeyboardShortcuts";
import { Keyboard, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface KeyboardShortcutsManagerProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsManager({ open, onClose }: KeyboardShortcutsManagerProps) {
  const [shortcuts, setShortcuts] = useState<ShortcutDefinition[]>([]);
  const [capturing, setCapturing] = useState<string | null>(null); // id of shortcut being captured

  useEffect(() => {
    if (open) {
      setShortcuts(loadShortcuts());
      setCapturing(null);
    }
  }, [open]);

  const handleKeyCapture = useCallback((e: KeyboardEvent) => {
    if (!capturing) return;

    // Ignore modifier-only keys
    if (['Control', 'Shift', 'Alt', 'Meta', 'Tab', 'Escape'].includes(e.key)) {
      if (e.key === 'Escape') {
        setCapturing(null);
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const parts: string[] = [];
    if (e.ctrlKey || e.metaKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    parts.push(e.key.toLowerCase());

    const newKey = parts.join('+');

    setShortcuts(prev => {
      const updated = prev.map(s =>
        s.id === capturing ? { ...s, defaultKey: newKey } : s
      );
      saveShortcuts(updated);
      return updated;
    });
    setCapturing(null);
    toast.success('Atalho salvo');
  }, [capturing]);

  useEffect(() => {
    if (capturing) {
      window.addEventListener('keydown', handleKeyCapture, true);
      return () => window.removeEventListener('keydown', handleKeyCapture, true);
    }
  }, [capturing, handleKeyCapture]);

  const handleReset = () => {
    saveShortcuts(DEFAULT_SHORTCUTS);
    setShortcuts([...DEFAULT_SHORTCUTS]);
    toast.success('Atalhos restaurados ao padrão');
  };

  const categories = [...new Set(shortcuts.map(s => s.category))];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5 text-primary" />
            Gerenciar Atalhos de Teclado
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          Clique em um atalho para redefinir a tecla. Pressione <kbd className="px-1 py-0.5 rounded border text-[11px]">Esc</kbd> para cancelar.
        </p>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {categories.map(cat => (
            <div key={cat}>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                {cat}
              </h3>
              <div className="space-y-1">
                {shortcuts.filter(s => s.category === cat).map(shortcut => (
                  <div
                    key={shortcut.id}
                    className="flex items-center justify-between px-3 py-2 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors"
                  >
                    <span className="text-sm text-foreground">{shortcut.label}</span>
                    <button
                      onClick={() => setCapturing(shortcut.id)}
                      className={`
                        min-w-[90px] text-center text-xs font-mono px-2.5 py-1 rounded-md border transition-all
                        ${capturing === shortcut.id
                          ? 'border-primary bg-primary/10 text-primary animate-pulse'
                          : 'border-border bg-background text-foreground hover:border-primary hover:text-primary'}
                      `}
                      title="Clique para redefinir"
                    >
                      {capturing === shortcut.id
                        ? 'Pressione...'
                        : formatShortcutKey(shortcut.defaultKey)}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center pt-2 border-t">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5" />
            Restaurar padrões
          </Button>
          <Button size="sm" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
