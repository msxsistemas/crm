import { useState } from "react";
import { MessagesSquare, Users, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface ChatUser {
  id: string;
  name: string;
}

interface Conversation {
  id: string;
  title: string;
  participants: ChatUser[];
  messages: ChatMessage[];
  createdAt: Date;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: Date;
}

const MOCK_USERS: ChatUser[] = [
  { id: "1", name: "Usuário 1" },
  { id: "2", name: "Usuário 2" },
];

const InternalChat = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [messageInput, setMessageInput] = useState("");

  const activeConvo = conversations.find((c) => c.id === selectedConvo);

  const handleCreateConversation = () => {
    if (!newTitle.trim()) {
      toast.error("Informe um título para a conversa");
      return;
    }
    const convo: Conversation = {
      id: crypto.randomUUID(),
      title: newTitle.trim(),
      participants: MOCK_USERS.filter((u) => selectedUsers.includes(u.id)),
      messages: [],
      createdAt: new Date(),
    };
    setConversations((prev) => [convo, ...prev]);
    setSelectedConvo(convo.id);
    setDialogOpen(false);
    setNewTitle("");
    setSelectedUsers([]);
    toast.success("Conversa criada!");
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedConvo) return;
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      senderId: "me",
      senderName: "Você",
      text: messageInput.trim(),
      timestamp: new Date(),
    };
    setConversations((prev) =>
      prev.map((c) =>
        c.id === selectedConvo ? { ...c, messages: [...c.messages, msg] } : c
      )
    );
    setMessageInput("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground">Chat Interno</h1>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-primary hover:bg-primary/90 uppercase font-semibold text-xs"
        >
          Nova Conversa
        </Button>
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar conversation list */}
        <div className="w-80 border-r border-border flex flex-col bg-card">
          <div className="flex-1 overflow-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
                <Users className="h-14 w-14 mb-3 opacity-30" />
                <p className="text-lg font-semibold">Nenhuma conversa</p>
                <p className="text-sm text-center">
                  Clique em "Nova Conversa" para começar
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {conversations.map((convo) => (
                  <button
                    key={convo.id}
                    onClick={() => setSelectedConvo(convo.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 transition-colors relative",
                      selectedConvo === convo.id
                        ? "bg-accent conversation-selected"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <p className="font-medium text-foreground text-sm">{convo.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {convo.participants.map((p) => p.name).join(", ") || "Sem participantes"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-background">
          {activeConvo ? (
            <>
              {/* Chat header */}
              <div className="px-4 py-3 border-b border-border bg-card">
                <p className="font-semibold text-foreground">{activeConvo.title}</p>
                <p className="text-xs text-muted-foreground">
                  {activeConvo.participants.map((p) => p.name).join(", ")}
                </p>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-auto p-4 space-y-3">
                {activeConvo.messages.length === 0 && (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    Nenhuma mensagem ainda. Comece a conversa!
                  </div>
                )}
                {activeConvo.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "max-w-[70%] rounded-lg p-3",
                      msg.senderId === "me"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "bg-card border border-border"
                    )}
                  >
                    <p className="text-xs font-medium opacity-75 mb-1">{msg.senderName}</p>
                    <p className="text-sm">{msg.text}</p>
                    <p className="text-[10px] opacity-60 mt-1 text-right">
                      {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>

              {/* Input */}
              <div className="p-3 border-t border-border bg-card flex items-center gap-2">
                <Input
                  placeholder="Digite sua mensagem..."
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  className="flex-1"
                />
                <Button size="icon" onClick={handleSendMessage} className="bg-primary hover:bg-primary/90">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessagesSquare className="h-16 w-16 mb-4 opacity-20" />
              <p className="text-lg font-semibold">Selecione uma conversa</p>
              <p className="text-sm">Ou crie uma nova para começar</p>
            </div>
          )}
        </div>
      </div>

      {/* New conversation dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Iniciar Nova Conversa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <FloatingInput
              label="Título"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
            />
            <Select onValueChange={(val) => toggleUser(val)}>
              <SelectTrigger>
                <SelectValue placeholder="Filtro por Users" />
              </SelectTrigger>
              <SelectContent>
                {MOCK_USERS.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedUsers.map((uid) => {
                  const user = MOCK_USERS.find((u) => u.id === uid);
                  return (
                    <Badge key={uid} className="gap-1 bg-primary text-primary-foreground">
                      {user?.name}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => toggleUser(uid)}
                      />
                    </Badge>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="uppercase font-semibold text-xs text-primary"
              >
                Fechar
              </Button>
              <Button
                onClick={handleCreateConversation}
                className="bg-primary hover:bg-primary/90 uppercase font-semibold text-xs"
              >
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InternalChat;
