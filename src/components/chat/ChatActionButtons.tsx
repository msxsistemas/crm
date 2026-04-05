import { useState, useEffect } from "react";
import { PenLine, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { db } from "@/lib/db";

// --- Signature Button ---
interface SignatureButtonProps {
  userName: string | null;
  signing: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export const SignatureButton = ({ userName, signing, onToggle, disabled }: SignatureButtonProps) => {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn(
        "shrink-0",
        signing
          ? "text-primary hover:text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
      onClick={onToggle}
      disabled={disabled}
      title={signing ? `Assinando como ${userName || "Atendente"}` : "Ativar assinatura"}
    >
      <PenLine className="h-4 w-4" />
    </Button>
  );
};

// --- Quick Messages Button ---
const DEFAULT_QUICK_MESSAGES = [
  { label: "Saudação", text: "Olá! Como posso ajudá-lo(a) hoje? 😊" },
  { label: "Aguarde", text: "Aguarde um momento, por favor. Estou verificando suas informações." },
  { label: "Obrigado", text: "Obrigado pelo contato! Se precisar de algo mais, estou à disposição. 🙏" },
  { label: "Horário", text: "Nosso horário de atendimento é de segunda a sexta, das 9h às 18h." },
  { label: "Transferência", text: "Vou transferir você para o setor responsável. Um momento, por favor." },
  { label: "Encerramento", text: "Foi um prazer atendê-lo(a)! Tenha um ótimo dia! 🌟" },
];

const loadQuickRepliesFromDB = async (): Promise<{ label: string; text: string }[]> => {
  try {
    const { data, error } = await db
      .from("quick_replies")
      .select("shortcut, message")
      .order("created_at", { ascending: true });
    if (!error && data && data.length > 0) {
      return data.map((r) => ({ label: r.shortcut, text: r.message }));
    }
  } catch {
    // ignore
  }
  return DEFAULT_QUICK_MESSAGES;
};

interface QuickMessagesButtonProps {
  onSelect: (text: string) => void;
  disabled?: boolean;
}

export const QuickMessagesButton = ({ onSelect, disabled }: QuickMessagesButtonProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [quickMessages, setQuickMessages] = useState(DEFAULT_QUICK_MESSAGES);

  const reload = () => {
    loadQuickRepliesFromDB().then(setQuickMessages);
  };

  useEffect(() => {
    reload();
    const handler = () => reload();
    window.addEventListener("quick_replies_updated", handler);
    return () => window.removeEventListener("quick_replies_updated", handler);
  }, []);

  useEffect(() => {
    if (open) reload();
  }, [open]);

  const filtered = quickMessages.filter(
    (m) =>
      m.label.toLowerCase().includes(search.toLowerCase()) ||
      m.text.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          disabled={disabled}
          title="Mensagens rápidas"
        >
          <Zap className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-80 p-0">
        <div className="p-2 border-b border-border">
          <Input
            placeholder="Buscar mensagem rápida..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
        <div className="max-h-60 overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 text-center">Nenhuma mensagem encontrada</p>
          ) : (
            filtered.map((m, i) => (
              <button
                key={i}
                onClick={() => {
                  onSelect(m.text);
                  setOpen(false);
                  setSearch("");
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-muted transition-colors border-b border-border/30 last:border-0"
              >
                <p className="text-xs font-medium text-foreground">{m.label}</p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{m.text}</p>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
