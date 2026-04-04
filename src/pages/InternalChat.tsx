import { useState, useEffect, useRef, useCallback } from "react";
import { MessagesSquare, Users, X, Send, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
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
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedConvo = conversations.find((c) => c.id === selectedConvoId) || null;

  // Load all profiles for participant selection
  useEffect(() => {
    supabase.from("profiles").select("id, full_name").then(({ data }) => {
      setAllProfiles((data || []).filter((p) => p.id !== user?.id));
    });
  }, [user]);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("internal_conversations")
      .select("id, title, created_by, created_at, internal_conversation_participants(user_id, profiles(id, full_name))")
      .order("updated_at", { ascending: false });

    if (data) {
      setConversations(data.map((c: any) => ({
        id: c.id,
        title: c.title,
        created_by: c.created_by,
        created_at: c.created_at,
        participants: (c.internal_conversation_participants || [])
          .map((p: any) => p.profiles)
          .filter(Boolean),
      })));
    }
  }, [user]);

  const loadMessages = useCallback(async (convoId: string) => {
    const { data } = await supabase
      .from("internal_messages")
      .select("id, conversation_id, sender_id, text, created_at, profiles(full_name)")
      .eq("conversation_id", convoId)
      .order("created_at", { ascending: true });

    if (data) {
      setMessages(data.map((m: any) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        sender_id: m.sender_id,
        sender_name: m.profiles?.full_name || "Usuário",
        text: m.text,
        created_at: m.created_at,
      })));
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (selectedConvoId) loadMessages(selectedConvoId);
  }, [selectedConvoId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime subscription for messages
  useEffect(() => {
    if (!selectedConvoId) return;
    const channel = supabase
      .channel(`internal-messages-${selectedConvoId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "internal_messages", filter: `conversation_id=eq.${selectedConvoId}` },
        async (payload) => {
          const m = payload.new as any;
          const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", m.sender_id).maybeSingle();
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, {
              id: m.id,
              conversation_id: m.conversation_id,
              sender_id: m.sender_id,
              sender_name: profile?.full_name || "Usuário",
              text: m.text,
              created_at: m.created_at,
            }];
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedConvoId]);

  const handleSelectConvo = (id: string) => {
    setSelectedConvoId(id);
    setMessages([]);
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedConvoId || !user) return;
    setSending(true);
    const text = messageInput.trim();
    setMessageInput("");
    const { error } = await supabase.from("internal_messages").insert({
      conversation_id: selectedConvoId,
      sender_id: user.id,
      text,
    });
    if (error) {
      toast.error("Erro ao enviar mensagem");
      setMessageInput(text);
    } else {
      await supabase
        .from("internal_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", selectedConvoId);
    }
    setSending(false);
  };

  const handleCreateConversation = async () => {
    if (!newTitle.trim()) { toast.error("Informe um título"); return; }
    if (!user) return;
    setCreating(true);

    const { data: convo, error } = await supabase
      .from("internal_conversations")
      .insert({ title: newTitle.trim(), created_by: user.id })
      .select("id")
      .single();

    if (error || !convo) { toast.error("Erro ao criar conversa"); setCreating(false); return; }

    // Add creator + selected participants
    const participants = [user.id, ...selectedUsers].map((uid) => ({
      conversation_id: convo.id,
      user_id: uid,
    }));
    await supabase.from("internal_conversation_participants").insert(participants);

    toast.success("Conversa criada!");
    setDialogOpen(false);
    setNewTitle("");
    setSelectedUsers([]);
    setCreating(false);
    await loadConversations();
    setSelectedConvoId(convo.id);
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
                <Button size="icon" onClick={handleSendMessage} disabled={sending}>
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
              <Button onClick={handleCreateConversation} disabled={creating}>
                {creating ? "Criando..." : "Criar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default InternalChat;
