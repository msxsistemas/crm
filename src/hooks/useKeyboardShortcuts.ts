import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

export interface ShortcutDefinition {
  id: string;
  label: string;
  defaultKey: string;
  category: string;
}

export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  { id: 'open_inbox', label: 'Abrir Inbox', defaultKey: 'g+i', category: 'Navegação' },
  { id: 'open_contacts', label: 'Abrir Contatos', defaultKey: 'g+c', category: 'Navegação' },
  { id: 'open_search', label: 'Pesquisa Global', defaultKey: 'ctrl+k', category: 'Navegação' },
  { id: 'close_conversation', label: 'Fechar Conversa', defaultKey: 'ctrl+w', category: 'Conversa' },
  { id: 'assign_to_me', label: 'Atribuir a mim', defaultKey: 'ctrl+m', category: 'Conversa' },
  { id: 'quick_reply', label: 'Abrir Respostas Rápidas', defaultKey: '/', category: 'Conversa' },
  { id: 'send_message', label: 'Enviar Mensagem', defaultKey: 'ctrl+enter', category: 'Mensagem' },
  { id: 'new_note', label: 'Nova Nota Interna', defaultKey: 'ctrl+shift+n', category: 'Mensagem' },
  { id: 'toggle_copilot', label: 'Abrir/Fechar Copiloto IA', defaultKey: 'ctrl+shift+a', category: 'IA' },
];

const STORAGE_KEY = 'shortcuts_config';

export function loadShortcuts(): ShortcutDefinition[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_SHORTCUTS;
    const parsed: Partial<ShortcutDefinition>[] = JSON.parse(saved);
    // Merge saved with defaults (keep defaults for any not in saved)
    return DEFAULT_SHORTCUTS.map(def => {
      const saved_item = parsed.find(p => p.id === def.id);
      return saved_item ? { ...def, defaultKey: saved_item.defaultKey ?? def.defaultKey } : def;
    });
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

export function saveShortcuts(shortcuts: ShortcutDefinition[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
}

export function keyEventMatchesShortcut(e: KeyboardEvent, shortcutKey: string): boolean {
  const parts = shortcutKey.toLowerCase().split('+');
  const key = parts[parts.length - 1];
  const ctrl = parts.includes('ctrl') || parts.includes('cmd');
  const shift = parts.includes('shift');
  const alt = parts.includes('alt');

  if (ctrl && !(e.ctrlKey || e.metaKey)) return false;
  if (shift && !e.shiftKey) return false;
  if (alt && !e.altKey) return false;
  if (!ctrl && !shift && !alt && (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) return false;

  return e.key.toLowerCase() === key;
}

export function formatShortcutKey(key: string): string {
  return key
    .split('+')
    .map(part => {
      switch (part.toLowerCase()) {
        case 'ctrl': return 'Ctrl';
        case 'shift': return 'Shift';
        case 'alt': return 'Alt';
        case 'enter': return 'Enter';
        case 'escape': return 'Esc';
        default: return part.toUpperCase();
      }
    })
    .join(' + ');
}

export function useGlobalKeyboardShortcuts(callbacks?: {
  onOpenSearch?: () => void;
  onOpenCheatsheet?: () => void;
}) {
  const navigate = useNavigate();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable;

    // Show cheatsheet on "?" — only when not in input
    if (e.key === '?' && !isInput) {
      e.preventDefault();
      callbacks?.onOpenCheatsheet?.();
      return;
    }

    const shortcuts = loadShortcuts();

    // Ctrl+K — global search (works even in inputs for discoverability)
    const searchShortcut = shortcuts.find(s => s.id === 'open_search');
    if (searchShortcut && keyEventMatchesShortcut(e, searchShortcut.defaultKey)) {
      e.preventDefault();
      callbacks?.onOpenSearch?.();
      return;
    }

    // Navigation shortcuts — only outside inputs
    if (!isInput) {
      const inboxShortcut = shortcuts.find(s => s.id === 'open_inbox');
      if (inboxShortcut && keyEventMatchesShortcut(e, inboxShortcut.defaultKey)) {
        // g+i is a sequence, handle via simple key check
        navigate('/inbox');
        return;
      }

      const contactsShortcut = shortcuts.find(s => s.id === 'open_contacts');
      if (contactsShortcut && keyEventMatchesShortcut(e, contactsShortcut.defaultKey)) {
        navigate('/contatos');
        return;
      }
    }
  }, [navigate, callbacks]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
