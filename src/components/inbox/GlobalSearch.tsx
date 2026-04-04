import React, { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, User, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
  onSelectConversation: (conversationId: string) => void;
}

interface ContactResult {
  id: string;
  name: string | null;
  phone: string;
  conversation_id?: string;
}

interface MessageResult {
  id: string;
  content: string;
  created_at: string;
  conversation_id: string;
  contact_name: string | null;
  contact_phone: string;
}

type ResultItem =
  | { kind: "contact"; data: ContactResult }
  | { kind: "message"; data: MessageResult };

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-300 text-yellow-900 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "agora";
  if (diffMins < 60) return `${diffMins}min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({
  open,
  onClose,
  onSelectConversation,
}) => {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<ContactResult[]>([]);
  const [messageResults, setMessageResults] = useState<MessageResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Build flat list for keyboard navigation
  const flatResults: ResultItem[] = [
    ...contacts.map((c): ResultItem => ({ kind: "contact", data: c })),
    ...messageResults.map((m): ResultItem => ({ kind: "message", data: m })),
  ];

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setContacts([]);
      setMessageResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [{ data: contactData }, { data: msgData }] = await Promise.all([
        supabase
          .from("contacts")
          .select("id, name, phone")
          .or(`name.ilike.%${q}%,phone.ilike.%${q}%`)
          .limit(5),
        supabase
          .from("messages")
          .select(
            "id, content, created_at, conversation_id, conversations(id, contact_id, contacts(name, phone))"
          )
          .ilike("content", `%${q}%`)
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      // Map contacts and find their conversation_id if available
      const mappedContacts: ContactResult[] = (contactData || []).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
      }));

      // Map message results
      const mappedMessages: MessageResult[] = (msgData || []).map((m: any) => ({
        id: m.id,
        content: m.content || "",
        created_at: m.created_at,
        conversation_id: m.conversation_id,
        contact_name: m.conversations?.contacts?.name ?? null,
        contact_phone: m.conversations?.contacts?.phone ?? "",
      }));

      setContacts(mappedContacts);
      setMessageResults(mappedMessages);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setContacts([]);
      setMessageResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      doSearch(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, doSearch]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setContacts([]);
      setMessageResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [contacts.length, messageResults.length]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatResults[activeIndex];
        if (item) selectItem(item);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, flatResults, activeIndex]);

  const selectItem = async (item: ResultItem) => {
    if (item.kind === "message") {
      onSelectConversation(item.data.conversation_id);
    } else {
      // Find conversation for this contact
      const { data } = await supabase
        .from("conversations")
        .select("id")
        .eq("contact_id", item.data.id)
        .limit(1);
      if (data && data.length > 0) {
        onSelectConversation(data[0].id);
      }
    }
    onClose();
  };

  if (!open) return null;

  const hasResults = contacts.length > 0 || messageResults.length > 0;
  const showEmpty = !loading && query.trim() && !hasResults;

  let resultIndex = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      style={{ backdropFilter: "blur(4px)", background: "rgba(0,0,0,0.5)" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden mx-4">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar mensagens, contatos..."
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-sm"
          />
          {loading && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
          )}
          {!loading && query && (
            <button
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="text-xs text-muted-foreground border border-border rounded px-1.5 py-0.5 hover:bg-muted transition-colors"
          >
            Esc
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {showEmpty && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
              <Search className="h-8 w-8 mb-3 opacity-30" />
              <p>Nenhum resultado encontrado</p>
            </div>
          )}

          {!query.trim() && !loading && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm">
              <Search className="h-8 w-8 mb-3 opacity-20" />
              <p>Digite para buscar mensagens e contatos</p>
              <p className="text-xs mt-1 opacity-60">Pressione Esc para fechar</p>
            </div>
          )}

          {/* Contacts section */}
          {contacts.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border">
                <User className="inline h-3 w-3 mr-1" />
                Contatos
              </div>
              {contacts.map((contact) => {
                const idx = resultIndex++;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={contact.id}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                      isActive
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted/50 text-foreground"
                    )}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() =>
                      selectItem({ kind: "contact", data: contact })
                    }
                  >
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {highlightText(
                          contact.name || contact.phone,
                          query
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {highlightText(contact.phone, query)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Messages section */}
          {messageResults.length > 0 && (
            <div>
              <div className="px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-muted/30 border-b border-border">
                <MessageSquare className="inline h-3 w-3 mr-1" />
                Mensagens
              </div>
              {messageResults.map((msg) => {
                const idx = resultIndex++;
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={msg.id}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors",
                      isActive
                        ? "bg-primary/10 text-foreground"
                        : "hover:bg-muted/50 text-foreground"
                    )}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() =>
                      selectItem({ kind: "message", data: msg })
                    }
                  >
                    <div className="h-8 w-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="h-4 w-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">
                          {msg.contact_name || msg.contact_phone}
                        </p>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatTime(msg.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {highlightText(
                          msg.content.length > 100
                            ? msg.content.slice(0, 100) + "..."
                            : msg.content,
                          query
                        )}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer hint */}
        {hasResults && (
          <div className="px-4 py-2 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">↑↓</kbd> navegar
            </span>
            <span>
              <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">Enter</kbd> selecionar
            </span>
            <span>
              <kbd className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">Esc</kbd> fechar
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalSearch;
