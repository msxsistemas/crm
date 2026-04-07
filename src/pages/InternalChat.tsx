import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSocket } from "@/lib/socket";
import api from "@/lib/api";
import { MessagesSquare, Users, X, Send, Plus, Bell, BellOff } from "lucide-react";
import { useChatSound } from "@/hooks/useChatSound";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Profile {
  id: string;
  full_name: string | null;
}

interface Conversation {
  id: string;
  title: string;
  created_by: string;
  created_at: string;
  participants: Profile[];
  last_message?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  text: string;
  created_at: string;
}

const InternalChat = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { playNotification } = useChatSound();
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('chat_sound_enabled') !== 'false');

  // TanStack Query: conversations
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['internal-channels'],
    queryFn: async () => {
      const rows = await api.get<any[]>('/internal-channels');
      return rows.map((c: any) => ({
        id: c.id,
        title: c.title,
        created_by: c.created_by,
        created_at: c.created_at,
        participants: (c.participants || []).filter(Boolean),
      }));
    },
    enabled: !!user,
  });

  const selectedConvo = conversations.find((c) => c.id === selectedConvoId) || null;

  // TanStack Query: messages for selected conversation
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['internal-messages', selectedConvoId],
    queryFn: async () => {
      const rows = await api.get<any[]>(`/internal-messages?conversation_id=${selectedConvoId}`);
      return rows.map((m: any) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        sender_name: m.sender_name || "Usuário",
        text: m.text,
        created_at: m.created_at,
      }));
    },
    enabled: !!selectedConvoId,
  });

  // TanStack Query: profiles for participant selection
  const { data: allProfiles = [] } = useQuery<Profile[]>({
    queryKey: ['users-profiles'],
    queryFn: async () => {
      const rows = await api.get<any[]>('/users');
      return rows.filter((p: any) => p.id !== user?.id).map((p: any) => ({
        id: p.id,
        full_name: p.full_name || p.name,
      }));
    },
    enabled: !!user,
  });

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (text: string) => api.post('/internal-messages', { conversation_id: selectedConvoId, text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['internal-messages', selectedConvoId] }),
  });

  // Create conversation mutation
  const createMutation = useMutation({
    mutationFn: (data: { title: string; participant_ids: string[] }) => api.post('/internal-channels', data),
    onSuccess: (newConvo: any) => {
      queryClient.invalidateQueries({ queryKey: ['internal-channels'] });
      setSelectedConvoId(newConvo.id);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Socket.io: subscribe to messages in selected conversation via shared singleton
  useEffect(() => {
    if (!selectedConvoId) return;
    const socket = getSocket();
    const event = `chat:${selectedConvoId}`;
    const handler = (msg: Message) => {
      queryClient.setQueryData<Message[]>(['internal-messages', selectedConvoId], (prev = []) => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
      queryClient.invalidateQueries({ queryKey: ['internal-channels'] });
      if (msg.sender_id !== user?.id) {
        playNotification();
      }
    };
    socket.on(event, handler);
    return () => { socket.off(event, handler); };
  }, [selectedConvoId, queryClient, user?.id, playNotification]);

  const handleSelectConvo = (id: string) => {
    setSelectedConvoId(id);
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConvoId || !user) return;
    const text = messageInput.trim();
    setMessageInput("");
    try {
      await sendMutation.mutateAsync(text);
    } catch {
      toast.error("Erro ao enviar mensagem");
      setMessageInput(text);
    }
  };

  const handleCreateConversation = async () => {
    if (!newTitle.trim()) { toast.error("Informe um título"); return; }
    if (!user) return;
    try {
      await createMutation.mutateAsync({ title: newTitle.trim(), participant_ids: selectedUsers });
      toast.success("Conversa criada!");
      setDialogOpen(false);
      setNewTitle("");
      setSelectedUsers([]);
    } catch { toast.error("Erro ao criar conversa"); }
  };

  const toggleUser = (uid: string) => {
    setSelectedUsers((prev) => prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]);
  };

  const formatTime = (d: string) => new Date(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground">Chat Interno</h1>
        <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Nova Conversa
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={cn("h-8 w-8 ml-auto", soundEnabled ? "text-primary" : "text-muted-foreground")}
          title={soundEnabled ? "Desativar som" : "Ativar som"}
          onClick={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            localStorage.setItem('chat_sound_enabled', String(next));
          }}
        >
          {soundEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 border-r border-border flex flex-col bg-card">
          <div className="flex-1 overflow-auto">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6">
                <Users className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm font-medium">Nenhuma conversa</p>
                <p className="text-xs text-center mt-1">Clique em "Nova Conversa"</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {conversations.map((c) => (
                  <button key={c.id} onClick={() => handleSelectConvo(c.id)}
                    className={cn("w-full text-left px-4 py-3 transition-colors",
                      selectedConvoId === c.id ? "bg-accent" : "hover:bg-muted/50")}>
                    <p className="font-medium text-sm text-foreground truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.participants.map((p) => p.full_name || "?").join(", ") || "Sem participantes"}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-background">
          {selectedConvo ? (
            <>
              <div className="px-4 py-3 border-b border-border bg-card">
                <p className="font-semibold text-foreground">{selectedConvo.title}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedConvo.participants.map((p) => p.full_name).join(", ")}
                </p>
              </div>

              <div className="flex-1 overflow-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                    Nenhuma mensagem. Comece a conversa!
                  </div>
                )}
                {messages.map((msg) => {
                  const isMe = msg.sender_id === user?.id;
                  return (
                    <div key={msg.id} className={cn("max-w-[70%] rounded-lg p-3", isMe ? "ml-auto bg-primary text-primary-foreground" : "bg-card border border-border")}>
                      {!isMe && <p className="text-xs font-medium opacity-75 mb-1">{msg.sender_name}</p>}
                      <p className="text-sm">{msg.text}</p>
                      <p className="text-[10px] opacity-60 mt-1 text-right">{formatTime(msg.created_at)}</p>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 border-t border-border bg-card flex items-center gap-2">
                <Input placeholder="Digite sua mensagem..." value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                  className="flex-1" />
                <Button size="icon" onClick={handleSendMessage} disabled={sendMutation.isPending}>
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
          <DialogHeader><DialogTitle>Nova Conversa</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <FloatingInput label="Título" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <div>
              <p className="text-sm text-muted-foreground mb-2">Adicionar participantes:</p>
              <div className="max-h-48 overflow-auto space-y-1 border rounded-md p-2">
                {allProfiles.map((p) => (
                  <button key={p.id} onClick={() => toggleUser(p.id)}
                    className={cn("w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                      selectedUsers.includes(p.id) ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted")}>
                    {p.full_name || "Sem nome"}
                  </button>
                ))}
                {allProfiles.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhum outro usuário</p>}
              </div>
            </div>
            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedUsers.map((uid) => {
                  const p = allProfiles.find((x) => x.id === uid);
                  return (
                    <Badge key={uid} className="gap-1">
                      {p?.full_name || "?"}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => toggleUser(uid)} />
                    </Badge>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreateConversation} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Criando..." : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InternalChat;
