import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, User, MessageSquare, FileText } from "lucide-react";
import { api } from "@/lib/api";

interface SearchContact {
  id: string;
  name: string;
  phone: string;
  email: string;
}

interface SearchConversation {
  id: string;
  contact_name: string;
  status: string;
  created_at: string;
}

interface SearchMessage {
  id: string;
  content: string;
  conversation_id: string;
  contact_name: string;
}

interface SearchResults {
  contacts: SearchContact[];
  conversations: SearchConversation[];
  messages: SearchMessage[];
}

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

const GlobalSearch = ({ open, onClose }: GlobalSearchProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>({ contacts: [], conversations: [], messages: [] });
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults({ contacts: [], conversations: [], messages: [] });
      return;
    }
    setLoading(true);
    try {
      const data = await api.get<SearchResults>(`/search/global?q=${encodeURIComponent(q)}`);
      setResults(data || { contacts: [], conversations: [], messages: [] });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      search(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults({ contacts: [], conversations: [], messages: [] });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const hasResults =
    results.contacts.length > 0 || results.conversations.length > 0 || results.messages.length > 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-20 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl mx-4 bg-background rounded-xl shadow-2xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar contatos, conversas, mensagens..."
            className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground"
          />
          {loading && (
            <span className="text-xs text-muted-foreground animate-pulse">Buscando...</span>
          )}
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Results */}
        {query.trim() && !loading && !hasResults && (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhum resultado encontrado para "{query}"
          </div>
        )}

        {hasResults && (
          <div className="max-h-[400px] overflow-y-auto divide-y divide-border/50">
            {/* Contacts */}
            {results.contacts.length > 0 && (
              <div>
                <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                  Contatos
                </p>
                {results.contacts.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      navigate(`/contatos/${c.id}/profile`);
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                  >
                    <User className="h-4 w-4 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.phone}{c.email ? ` · ${c.email}` : ""}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Conversations */}
            {results.conversations.length > 0 && (
              <div>
                <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                  Conversas
                </p>
                {results.conversations.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      localStorage.setItem("selected_conversation_id", c.id);
                      navigate("/inbox");
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                  >
                    <MessageSquare className="h-4 w-4 text-green-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.contact_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        Status: {c.status} · #{c.id.split("-")[0].toUpperCase()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Messages */}
            {results.messages.length > 0 && (
              <div>
                <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
                  Mensagens
                </p>
                {results.messages.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      localStorage.setItem("selected_conversation_id", m.conversation_id);
                      navigate("/inbox");
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                  >
                    <FileText className="h-4 w-4 text-purple-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.contact_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{m.content}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer hint */}
        {!query.trim() && (
          <div className="px-4 py-3 text-xs text-muted-foreground flex items-center gap-4">
            <span>Digite para pesquisar</span>
            <span className="ml-auto flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Esc</kbd>
              <span>fechar</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalSearch;
