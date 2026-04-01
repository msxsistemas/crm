import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import whatsappLightWallpaper from "@/assets/whatsapp-light-wallpaper.png";
import whatsappDarkWallpaper from "@/assets/whatsapp-dark-wallpaper.png";
import { formatPhoneBR, unformatPhone } from "@/lib/phone-mask";
import { useSearchParams } from "react-router-dom";
import {
  Search, Phone, MessageCircle, Send, Smile, Paperclip, QrCode, RefreshCw,
  Wifi, WifiOff, Plus, Filter, Bell, BellOff, RotateCw, ArrowRight, User,
  Shuffle, CheckCircle, X, Image, FileText, Mic, Folder, ChevronDown, Smartphone, Star,
  Trash2, Copy, Forward, Reply, Pencil, Check,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import TransferDialog from "@/components/inbox/TransferDialog";
import CloseConversationDialog from "@/components/inbox/CloseConversationDialog";
import ConversationFilesDialog from "@/components/inbox/ConversationFilesDialog";
import MediaMessage from "@/components/chat/MediaMessage";
import { useMediaUpload } from "@/components/chat/useMediaUpload";
import { EmojiPicker, StickerPicker } from "@/components/chat/EmojiStickerPicker";
import { SignatureButton, QuickMessagesButton } from "@/components/chat/ChatActionButtons";
import ContactDetailsSidebar from "@/components/inbox/ContactDetailsSidebar";
import TagSelector from "@/components/shared/TagSelector";

const tailwindColorMap: Record<string, string> = {
  "bg-white": "#ffffff", "bg-red-500": "#ef4444", "bg-orange-500": "#f97316",
  "bg-amber-400": "#fbbf24", "bg-yellow-300": "#fde047", "bg-lime-400": "#a3e635",
  "bg-green-500": "#22c55e", "bg-emerald-500": "#10b981", "bg-teal-500": "#14b8a6",
  "bg-cyan-400": "#22d3ee", "bg-sky-500": "#0ea5e9", "bg-blue-500": "#3b82f6",
  "bg-indigo-500": "#6366f1", "bg-violet-500": "#8b5cf6", "bg-purple-500": "#a855f7",
  "bg-fuchsia-500": "#d946ef", "bg-pink-500": "#ec4899", "bg-rose-500": "#f43f5e",
  "bg-gray-400": "#9ca3af", "bg-indigo-900": "#312e81", "bg-purple-300": "#d8b4fe",
  "bg-slate-400": "#94a3b8", "bg-blue-800": "#1e40af", "bg-sky-300": "#7dd3fc",
  "bg-amber-700": "#b45309", "bg-gray-600": "#4b5563", "bg-primary": "#8B5CF6",
};

const resolveTagColor = (color: string): string => {
  if (color.startsWith("bg-")) return tailwindColorMap[color] || "#8B5CF6";
  if (color.startsWith("#")) return color;
  return "#8B5CF6";
};
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { createInstance, getQRCode, getInstanceStatus, sendMessage, setupWebhook } from "@/lib/evolution-api";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface DBContact {
  id: string;
  phone: string;
  name: string | null;
  avatar_url: string | null;
}

interface DBConversation {
  id: string;
  contact_id: string;
  instance_name: string;
  status: string;
  unread_count: number;
  last_message_at: string | null;
  last_message_body?: string;
  assigned_to: string | null;
  category_id: string | null;
  contacts: DBContact;
}

interface DBMessage {
  id: string;
  conversation_id: string;
  from_me: boolean;
  body: string;
  media_url: string | null;
  media_type: string | null;
  status: string;
  created_at: string;
  whatsapp_message_id?: string | null;
}

type TabFilter = "atendendo" | "aguardando" | "encerradas";

const Inbox = () => {
  const { user } = useAuth();

  // Detect dark mode and select wallpaper
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const currentWallpaper = isDark ? whatsappDarkWallpaper : whatsappLightWallpaper;

  // Preload wallpaper images
  useEffect(() => {
    [whatsappLightWallpaper, whatsappDarkWallpaper].forEach(src => {
      const img = new window.Image();
      img.src = src;
    });
  }, []);
  const [searchParams] = useSearchParams();
  const [conversations, setConversations] = useState<DBConversation[]>([]);
  const [messages, setMessages] = useState<DBMessage[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [messageInput, setMessageInput] = useState("");
  const [signing, setSigning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState<TabFilter>("atendendo");
  const [instanceName, setInstanceName] = useState<string>("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [audioAllowed, setAudioAllowed] = useState(() => {
    const stored = localStorage.getItem("inbox_audio_allowed");
    return stored !== null ? stored === "true" : false;
  });
  const audioAllowedRef = useRef(audioAllowed);
  useEffect(() => { audioAllowedRef.current = audioAllowed; }, [audioAllowed]);
  const conversationsRef = useRef<DBConversation[]>([]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  const instanceNameRef = useRef(instanceName);
  useEffect(() => { instanceNameRef.current = instanceName; }, [instanceName]);
  const handledAudioReplyIdsRef = useRef<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { uploading, fileInputRef, openFilePicker, uploadAndSend } = useMediaUpload();
  const [profileName, setProfileName] = useState<string | null>(null);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [creatingConvo, setCreatingConvo] = useState(false);
  const [newConvoInstance, setNewConvoInstance] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const stored = localStorage.getItem("inbox_sound_enabled");
    return stored !== null ? stored === "true" : true;
  });
  const [showFilters, setShowFilters] = useState(false);
  const [filterDepartment, setFilterDepartment] = useState("");
  const [filterConnection, setFilterConnection] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [sortOrder, setSortOrder] = useState<"recent" | "oldest" | "unread">("recent");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [connections, setConnectionsList] = useState<{ instance_name: string }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; full_name: string | null }[]>([]);
  const [contactTagMap, setContactTagMap] = useState<Map<string, string[]>>(new Map());
  const [replyTo, setReplyTo] = useState<DBMessage | null>(null);
  const [reactions, setReactions] = useState<Map<string, string>>(new Map());
  const [reactingToMsg, setReactingToMsg] = useState<string | null>(null);
  const [showFullEmojiPicker, setShowFullEmojiPicker] = useState(false);
  const [forwardingMsg, setForwardingMsg] = useState<DBMessage | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [selectingForForward, setSelectingForForward] = useState(false);
  const [selectedForForward, setSelectedForForward] = useState<Set<string>>(new Set());
  const [selectedForwardTargets, setSelectedForwardTargets] = useState<Set<string>>(new Set());
  const [forwardSending, setForwardSending] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("inbox_favorites");
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });
  const [avatarErrorContacts, setAvatarErrorContacts] = useState<Set<string>>(new Set());

  const handleAvatarError = useCallback((contactId: string) => {
    setAvatarErrorContacts((prev) => {
      if (prev.has(contactId)) return prev;
      const next = new Set(prev);
      next.add(contactId);
      return next;
    });
  }, []);

  const toggleFavorite = (convoId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(convoId)) next.delete(convoId); else next.add(convoId);
      localStorage.setItem("inbox_favorites", JSON.stringify([...next]));
      return next;
    });
  };
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);

  // Create notification audio element
  useEffect(() => {
    const audio = new Audio("https://cdn.pixabay.com/audio/2022/12/12/audio_e8e16a1497.mp3");
    audio.volume = 0.5;
    notificationAudioRef.current = audio;
  }, []);

  // Fetch profile name and signing preference
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name, signing_enabled").eq("id", user.id).single().then(({ data }) => {
      setProfileName(data?.full_name || user.user_metadata?.full_name || null);
      if (data?.signing_enabled !== undefined && data?.signing_enabled !== null) {
        setSigning(data.signing_enabled);
      }
    });
  }, [user]);

  // Helper to refresh contact_tags map
  const refreshContactTags = useCallback(async () => {
    const { data } = await supabase.from("contact_tags").select("contact_id, tag_id, created_at").order("created_at", { ascending: true });
    if (data) {
      const map = new Map<string, string[]>();
      for (const ct of data) {
        if (!map.has(ct.contact_id)) map.set(ct.contact_id, []);
        const arr = map.get(ct.contact_id)!;
        if (!arr.includes(ct.tag_id)) arr.push(ct.tag_id);
      }
      setContactTagMap(map);
    }
  }, []);

  // Load filter options (departments, connections, tags, agents, contact_tags)
  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("categories").select("id, name").eq("user_id", user.id),
      supabase.from("evolution_connections").select("instance_name").eq("user_id", user.id),
      supabase.from("tags").select("id, name, color").eq("user_id", user.id),
      supabase.from("profiles").select("id, full_name"),
    ]).then(([dRes, cRes, tRes, aRes]) => {
      if (dRes.data) setDepartments(dRes.data);
      if (cRes.data) setConnectionsList(cRes.data);
      if (tRes.data) setTags(tRes.data);
      if (aRes.data) setAgents(aRes.data);
    });
    refreshContactTags();
  }, [user, refreshContactTags]);

  // Realtime subscription on contact_tags to keep cards in sync
  useEffect(() => {
    const channel = supabase
      .channel("contact_tags_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "contact_tags" }, () => {
        refreshContactTags();
        // Also refresh tags list in case a new tag was created
        if (user) {
          supabase.from("tags").select("id, name, color").eq("user_id", user.id).then(({ data }) => {
            if (data) setTags(data);
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshContactTags, user]);

  // Fetch the connected instance name from evolution_connections
  useEffect(() => {
    const fetchInstance = async () => {
      if (!user) return;
      const { data } = await supabase
        .from("evolution_connections")
        .select("instance_name")
        .eq("user_id", user.id)
        .limit(1);
      if (data && data.length > 0) {
        setInstanceName(data[0].instance_name);
      }
    };
    fetchInstance();
  }, [user]);

  // Load conversations
  const loadConversations = useCallback(async () => {
    const { data, error } = await supabase
      .from("conversations")
      .select("id, contact_id, instance_name, status, unread_count, last_message_at, assigned_to, category_id, contacts(*)")
      .order("last_message_at", { ascending: false });

    if (error) {
      console.error("Error loading conversations:", error);
    } else {
      const convos = (data as unknown as DBConversation[]) || [];
      // Fetch last message for each conversation
      if (convos.length > 0) {
        const ids = convos.map((c) => c.id);
        const { data: msgs } = await supabase
          .from("messages")
          .select("conversation_id, body, created_at")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false });
        
        if (msgs) {
          const lastMsgMap = new Map<string, string>();
          for (const m of msgs) {
            if (!lastMsgMap.has(m.conversation_id)) {
              lastMsgMap.set(m.conversation_id, m.body);
            }
          }
          convos.forEach((c) => {
            c.last_message_body = lastMsgMap.get(c.id) || undefined;
          });
        }
      }
      setConversations(convos);
    }
    setLoading(false);
  }, []);

  // Auto-select conversation from URL phone param
  useEffect(() => {
    const phoneParam = searchParams.get("phone");
    if (phoneParam && conversations.length > 0 && !selected) {
      const match = conversations.find((c) => c.contacts?.phone === phoneParam);
      if (match) {
        setSelected(match.id);
      }
    }
  }, [searchParams, conversations, selected]);

  // Load messages for selected conversation
  const loadMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error loading messages:", error);
    } else {
      setMessages((data as DBMessage[]) || []);
    }
  }, []);

  // Check WhatsApp connection status
  const checkConnection = useCallback(async () => {
    if (!instanceName) return;
    try {
      const result = await getInstanceStatus(instanceName);
      const state = result?.instance?.state || result?.state;
      setConnected(state === "open");
    } catch {
      setConnected(false);
    }
  }, [instanceName]);

  useEffect(() => {
    loadConversations();
    checkConnection();
  }, [loadConversations, checkConnection]);

  // Realtime subscriptions
  useEffect(() => {
    const messagesChannel = supabase
      .channel("messages-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const newMsg = payload.new as DBMessage;
        if (newMsg.conversation_id === selected) {
          setMessages((prev) => {
            // Skip if already exists (optimistic or duplicate)
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Remove temp optimistic messages that match
            const filtered = prev.filter((m) => !(m.id.startsWith("temp-") && m.body === newMsg.body && m.from_me === newMsg.from_me));
            return [...filtered, newMsg];
          });
        }
        // Play notification sound for incoming messages
        if (!newMsg.from_me && soundEnabled && notificationAudioRef.current) {
          notificationAudioRef.current.currentTime = 0;
          notificationAudioRef.current.play().catch(() => {});
        }
        // Auto-reply only when audio blocking is enabled and incoming message is audio
        if (!newMsg.from_me && audioAllowedRef.current === true && newMsg.media_type?.startsWith("audio")) {
          if (handledAudioReplyIdsRef.current.has(newMsg.id)) return;
          handledAudioReplyIdsRef.current.add(newMsg.id);

          const convo = conversationsRef.current.find((c) => c.id === newMsg.conversation_id);
          if (convo) {
            const infoMsg = "**INFORMAÇÃO** Infelizmente não é possível enviar ou escutar áudios por este canal de atendimento. Envie uma mensagem de **texto**!";
            const sendInst = convo.instance_name || instanceNameRef.current;
            sendMessage(sendInst, convo.contacts.phone, infoMsg).catch(() => {});
            supabase.from("messages").insert({
              conversation_id: newMsg.conversation_id,
              from_me: true,
              body: infoMsg,
              status: "sent",
            }).then(() => {});
          }
        }
        loadConversations();
      })
      .subscribe();

    const convosChannel = supabase
      .channel("conversations-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        loadConversations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(convosChannel);
    };
  }, [selected, loadConversations, soundEnabled]);

  const prevMessagesLengthRef = useRef(0);
  useEffect(() => {
    const isInitialLoad = prevMessagesLengthRef.current === 0 && messages.length > 0;
    messagesEndRef.current?.scrollIntoView(isInitialLoad ? { behavior: "instant" } : { behavior: "smooth" });
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length]);

  const handleSelectConvo = async (id: string) => {
    setSelected(id);
    prevMessagesLengthRef.current = 0;
    await loadMessages(id);
    await supabase.from("conversations").update({ unread_count: 0 }).eq("id", id);
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selected) return;
    const convo = conversations.find((c) => c.id === selected);
    if (!convo) return;

    const signaturePrefix = signing && profileName ? `${profileName}:\n` : "";
    const text = signaturePrefix + messageInput;
    setMessageInput("");

    // Optimistic: show message instantly
    const optimisticMsg: DBMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: selected,
      from_me: true,
      body: text,
      media_url: null,
      media_type: null,
      status: "sending",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      // Fire both in parallel: send via WhatsApp + persist in DB
      const sendInstanceName = convo.instance_name || instanceName;
      const [, dbResult] = await Promise.all([
        sendMessage(sendInstanceName, convo.contacts.phone, text),
        supabase.from("messages").insert({
          conversation_id: selected,
          from_me: true,
          body: text,
          status: "sent",
        }).select().single(),
      ]);

      // Replace optimistic message with real one
      if (dbResult.data) {
        setMessages((prev) => prev.map((m) => m.id === optimisticMsg.id ? (dbResult.data as DBMessage) : m));
      }

      await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", selected);
    } catch (err: any) {
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      toast.error("Erro ao enviar: " + (err?.message || "Tente novamente"));
      setMessageInput(text);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    e.target.value = "";

    const convo = conversations.find((c) => c.id === selected);
    if (!convo) return;

    await uploadAndSend({
      file,
      instanceName,
      phone: convo.contacts.phone,
      conversationId: selected,
      onOptimistic: (opt) => {
        setMessages((prev) => [...prev, {
          id: opt.id,
          conversation_id: selected,
          from_me: true,
          body: opt.body,
          media_url: opt.mediaUrl,
          media_type: opt.mediaType,
          status: "sending",
          created_at: new Date().toISOString(),
        }]);
      },
      onError: (err) => {
        setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-media-")));
      },
    });
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      try { await createInstance(instanceName); } catch { /* may exist */ }
      const qrResult = await getQRCode(instanceName);
      const base64 = qrResult?.base64 || qrResult?.qrcode?.base64;
      if (base64) {
        setQrCode(base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`);
        setShowQR(true);
      } else {
        const status = await getInstanceStatus(instanceName);
        const state = status?.instance?.state || status?.state;
        if (state === "open") {
          setConnected(true);
          toast.success("WhatsApp já está conectado!");
          try { await setupWebhook(instanceName); } catch (e) { console.warn("Webhook setup:", e); }
        } else {
          toast.error("Não foi possível gerar QR Code. Tente novamente.");
        }
      }
    } catch (err: any) {
      toast.error("Erro ao conectar: " + (err?.message || "Verifique a Evolution API"));
    }
    setConnecting(false);
  };

  const handleCheckAfterScan = async () => {
    try {
      const status = await getInstanceStatus(instanceName);
      const state = status?.instance?.state || status?.state;
      if (state === "open") {
        setConnected(true);
        setShowQR(false);
        toast.success("WhatsApp conectado com sucesso! 🎉");
        try { await setupWebhook(instanceName); } catch (e) { console.warn("Webhook setup:", e); }
        loadConversations();
      } else {
        toast.info("Ainda não conectado. Escaneie o QR Code no seu WhatsApp.");
      }
    } catch {
      toast.error("Erro ao verificar conexão");
    }
  };

  // Handle attend conversation
  const handleAttend = async (convoId?: string) => {
    const id = convoId || selected;
    if (!id) return;
    try {
      const { error } = await supabase.from("conversations").update({ unread_count: 0, status: "attending" }).eq("id", id);
      if (error) { toast.error("Erro ao atender"); return; }
      setSelected(id);
      setActiveTab("atendendo");
      await Promise.all([loadMessages(id), loadConversations()]);
    } catch { toast.error("Erro inesperado"); }
  };

  // Handle close conversation
  const handleClose = async (closingMessage?: string) => {
    if (!selected) return;
    const convo = conversations.find((c) => c.id === selected);
    try {
      // Send closing message if provided
      if (closingMessage?.trim() && convo) {
        const sendInstanceName = convo.instance_name || instanceName;
        await Promise.all([
          sendMessage(sendInstanceName, convo.contacts.phone, closingMessage),
          supabase.from("messages").insert({
            conversation_id: selected,
            from_me: true,
            body: closingMessage,
            status: "sent",
          }),
        ]);
      }
      const { error } = await supabase.from("conversations").update({ status: "closed" }).eq("id", selected);
      if (error) { toast.error("Erro ao encerrar"); return; }
      toast.success("Conversa encerrada!");
      setShowCloseDialog(false);
      loadConversations();
    } catch { toast.error("Erro inesperado"); }
  };

  // Handle audio toggle
  const toggleAudio = (next?: boolean) => {
    const value = typeof next === "boolean" ? next : !audioAllowed;
    setAudioAllowed(value);
    localStorage.setItem("inbox_audio_allowed", String(value));
    toast.success(value ? "Bloqueio de áudio ativado" : "Bloqueio de áudio desativado");
  };

  // Handle transfer
  const handleTransfer = async (type: "user" | "department", targetId: string, targetName: string) => {
    if (!selected) return;
    try {
      const update = type === "user"
        ? { assigned_to: targetId } as any
        : { category_id: targetId } as any;
      const { error } = await supabase.from("conversations").update(update).eq("id", selected);
      if (error) { toast.error("Erro ao transferir conversa"); return; }
      toast.success(`Conversa transferida para ${targetName}`);
      loadConversations();
      setShowTransfer(false);
    } catch {
      toast.error("Erro inesperado ao transferir");
    }
  };

  // Handle new conversation
  const handleCreateConversation = async () => {
    if (!newPhone.trim()) { toast.error("Informe o número de telefone"); return; }
    setCreatingConvo(true);
    try {
      // Check if contact already exists
      let contactId: string;
      const rawPhone = unformatPhone(newPhone);
      const { data: existing } = await supabase.from("contacts").select("id").eq("phone", rawPhone).limit(1);
      if (existing && existing.length > 0) {
        contactId = existing[0].id;
        if (newName.trim()) {
          await supabase.from("contacts").update({ name: newName.trim() }).eq("id", contactId);
        }
      } else {
        const { data: newContact, error } = await supabase.from("contacts").insert({
          phone: rawPhone,
          name: newName.trim() || null,
        }).select().single();
        if (error || !newContact) { toast.error("Erro ao criar contato"); setCreatingConvo(false); return; }
        contactId = newContact.id;
      }

      // Check if conversation already exists
      const { data: existingConvo } = await supabase.from("conversations").select("id").eq("contact_id", contactId).limit(1);
      if (existingConvo && existingConvo.length > 0) {
        setSelected(existingConvo[0].id);
        await loadMessages(existingConvo[0].id);
        toast.info("Conversa já existente selecionada");
      } else {
        const { data: newConvo, error } = await supabase.from("conversations").insert({
          contact_id: contactId,
          instance_name: newConvoInstance || instanceName || "default",
          status: "open",
        }).select().single();
        if (error || !newConvo) { toast.error("Erro ao criar conversa"); setCreatingConvo(false); return; }
        setSelected(newConvo.id);
        toast.success("Nova conversa criada!");
      }

      await loadConversations();
      setShowNewConvo(false);
      setNewPhone("");
      setNewName("");
      setNewConvoInstance("");
    } catch (err: any) {
      toast.error("Erro: " + (err?.message || "Tente novamente"));
    }
    setCreatingConvo(false);
  };

  // Filter conversations
  const unreadCount = conversations.filter((c) => c.unread_count > 0).length;

  const filtered = conversations
    .filter((c) => {
      if (activeTab === "atendendo") return c.status === "attending";
      if (activeTab === "aguardando") return c.status === "open";
      if (activeTab === "encerradas") return c.status === "closed";
      return true;
    })
    .filter((c) => {
      if (filterConnection && c.instance_name !== filterConnection) return false;
      if (filterDepartment && c.category_id !== filterDepartment) return false;
      if (filterAgent && c.assigned_to !== filterAgent) return false;
      if (filterTag) {
        const contactTags = contactTagMap.get(c.contact_id);
        if (!contactTags || !contactTags.includes(filterTag)) return false;
      }
      return true;
    })
    .filter((c) =>
      (c.contacts?.name || c.contacts?.phone || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      // Favoritos sempre no topo
      const aFav = favorites.has(a.id) ? 1 : 0;
      const bFav = favorites.has(b.id) ? 1 : 0;
      if (bFav !== aFav) return bFav - aFav;

      if (sortOrder === "unread") return (b.unread_count || 0) - (a.unread_count || 0);
      if (sortOrder === "oldest") return new Date(a.last_message_at || 0).getTime() - new Date(b.last_message_at || 0).getTime();
      return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
    });

  const selectedConvo = conversations.find((c) => c.id === selected);

  const getInitials = (name: string | null, phone: string) => {
    if (name) return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
    return phone.substring(phone.length - 2);
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = Math.max(0, now.getTime() - date.getTime());
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "agora";
    if (diffMins < 60) return `${diffMins} min atrás`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} h atrás`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d atrás`;
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  const formatClockTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatMessageTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusBadge = (convo: DBConversation) => {
    if (convo.status === "closed") {
      return <Badge className="bg-muted text-muted-foreground text-[10px] px-2 py-0.5 font-normal">✓ Encerrado</Badge>;
    }
    if (convo.status === "open") {
      return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-2 py-0.5 font-normal">⊙ Aguardando</Badge>;
    }
    return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-2 py-0.5 font-normal">▶ Em atendimento</Badge>;
  };

  // Group messages by date
  const getDateLabel = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return "Hoje";
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Ontem";
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };


  return (
    <div className="flex h-full">
      {/* Conversations panel */}
      <div className="w-[380px] border-r border-border flex flex-col bg-card">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h1 className="text-lg font-bold text-foreground">Conversas</h1>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setShowNewConvo(true)} title="Nova conversa">
              <Plus className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className={cn("h-8 w-8", showFilters ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground")} onClick={() => setShowFilters(!showFilters)} title="Filtros">
              <Filter className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className={cn("h-8 w-8 relative", soundEnabled ? "text-primary" : "text-muted-foreground hover:text-foreground")} onClick={() => { const next = !soundEnabled; setSoundEnabled(next); localStorage.setItem("inbox_sound_enabled", String(next)); toast.success(next ? "Som de notificação ativado" : "Som de notificação desativado"); }} title={soundEnabled ? "Desativar som" : "Ativar som"}>
              {soundEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              {soundEnabled && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary animate-pulse" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={async () => { setRefreshing(true); await loadConversations(); setRefreshing(false); }} title="Atualizar" disabled={refreshing}>
              <RotateCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="px-4 py-3 border-b border-border space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)} className="h-9 rounded-md border border-border bg-muted/50 px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">Categoria</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select value={filterConnection} onChange={(e) => setFilterConnection(e.target.value)} className="h-9 rounded-md border border-border bg-muted/50 px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">Conexão</option>
                {connections.map((c) => <option key={c.instance_name} value={c.instance_name}>{c.instance_name}</option>)}
              </select>
              <select value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)} className="h-9 rounded-md border border-border bg-muted/50 px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">Atendente</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.full_name || "Sem nome"}</option>)}
              </select>
              <select value={filterTag} onChange={(e) => setFilterTag(e.target.value)} className="h-9 rounded-md border border-border bg-muted/50 px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">Tag</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Ordenar:</span>
              {(["recent", "oldest", "unread"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortOrder(s)}
                  className={cn(
                    "px-2 py-1 rounded-md transition-colors",
                    sortOrder === s ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {s === "recent" ? "Recentes" : s === "oldest" ? "Antigas" : "Não lidos"}
                  {s === "unread" && unreadCount > 0 && (
                    <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded bg-destructive text-destructive-foreground text-[10px] font-bold">
                      {unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="px-4 py-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar conversas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-muted/50 border-border"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 px-4 py-0 border-b border-border overflow-x-auto scrollbar-none">
          {([
            { key: "atendendo" as TabFilter, label: "ATENDENDO", count: conversations.filter((c) => c.status === "attending").length },
            { key: "aguardando" as TabFilter, label: "AGUARDANDO", count: conversations.filter((c) => c.status === "open").length },
            { key: "encerradas" as TabFilter, label: "ENCERRADAS", count: conversations.filter((c) => c.status === "closed").length },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "relative flex items-center gap-1.5 py-2.5 text-[11px] font-semibold tracking-wide whitespace-nowrap transition-colors",
                activeTab === tab.key
                  ? "text-primary after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-primary after:rounded-full"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="inline-flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full text-[10px] font-bold bg-primary text-primary-foreground">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageCircle className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            filtered.map((convo) => {
              const convoTagIds = contactTagMap.get(convo.contact_id) || [];
              const matchingTags = convoTagIds.map(id => tags.find(t => t.id === id)).filter(Boolean) as typeof tags;
              return (
                <div
                  key={convo.id}
                  onClick={() => { if (activeTab === "aguardando") return; handleSelectConvo(convo.id); }}
                  className={cn(
                    "relative flex w-full items-start gap-3 px-4 py-3 text-left transition-all duration-200 border-b border-border/30 cursor-pointer active:scale-[0.98] active:opacity-80",
                    selected === convo.id
                      ? "bg-accent conversation-selected"
                      : "hover:bg-muted/50"
                  )}
                >
                  <div className="relative shrink-0 flex flex-col items-center gap-1">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground">
                      {convo.contacts?.avatar_url && !avatarErrorContacts.has(convo.contact_id) ? (
                        <img
                          src={convo.contacts.avatar_url}
                          alt={convo.contacts?.name || convo.contacts?.phone || "Avatar do contato"}
                          className="h-11 w-11 rounded-full object-cover"
                          onError={() => handleAvatarError(convo.contact_id)}
                        />
                      ) : (
                        getInitials(convo.contacts?.name, convo.contacts?.phone)
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(convo.id); }}
                      className="inline-flex items-center text-muted-foreground hover:text-yellow-500 transition-colors"
                      title={favorites.has(convo.id) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                    >
                      <Star className={cn("h-3.5 w-3.5", favorites.has(convo.id) ? "fill-yellow-500 text-yellow-500" : "")} />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium text-foreground truncate">
                        {convo.contacts?.name || convo.contacts?.phone}
                        {" "}
                        <span className="text-[11px] text-green-500 font-normal">({formatTime(convo.last_message_at)})</span>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-1.5">
                      {convo.last_message_body || (convo.contacts?.name ? convo.contacts.phone : "Nova conversa")}
                    </p>
                    <div className="flex items-center gap-1 flex-wrap">
                      {convo.instance_name && convo.instance_name !== "default" && (
                        <span className="inline-flex items-center rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-semibold text-white uppercase">
                          {convo.instance_name}
                        </span>
                      )}
                      {matchingTags.map(tag => (
                        <span key={tag.id} className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold text-white uppercase" style={{ backgroundColor: resolveTagColor(tag.color) }}>
                          {tag.name}
                        </span>
                      ))}
                      {profileName && (
                        <span className="inline-flex items-center rounded bg-green-700 px-1.5 py-0.5 text-[9px] font-semibold text-white uppercase">
                          {profileName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0 ml-2 items-end self-start">
                    <span className="text-[11px] text-muted-foreground">
                      {formatClockTime(convo.last_message_at)}
                    </span>
                    <div className="h-5 flex items-center justify-center">
                      {convo.unread_count > 0 && (
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-600 px-1.5 text-[10px] font-bold text-white">
                          {convo.unread_count > 99 ? "99+" : convo.unread_count}
                        </span>
                      )}
                    </div>
                    {activeTab === "aguardando" && convo.status === "open" && (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAttend(convo.id); }}
                          className="px-3 py-1 rounded text-[11px] font-bold text-white bg-green-600 hover:bg-green-700 active:scale-95 transition-all duration-150 uppercase"
                        >
                          Aceitar
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelected(convo.id); setShowCloseDialog(true); }}
                          className="px-3 py-1 rounded text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all duration-150 uppercase"
                        >
                          Finalizar
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Chat area */}
      <div
        className="flex-1 flex flex-col bg-background"
        style={selectedConvo ? {
          backgroundImage: `linear-gradient(hsl(var(--chat-wallpaper-overlay) / var(--chat-wallpaper-overlay-opacity)), hsl(var(--chat-wallpaper-overlay) / var(--chat-wallpaper-overlay-opacity))), url(${currentWallpaper})`,
          backgroundRepeat: "repeat",
          backgroundSize: "512px 512px",
          backgroundPosition: "center",
        } : undefined}
      >
        {selectedConvo ? (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-card">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {selectedConvo.contacts?.avatar_url && !avatarErrorContacts.has(selectedConvo.contact_id) ? (
                      <img
                        src={selectedConvo.contacts.avatar_url}
                        alt={selectedConvo.contacts?.name || selectedConvo.contacts?.phone || "Avatar do contato"}
                        className="h-10 w-10 rounded-full object-cover"
                        onError={() => handleAvatarError(selectedConvo.contact_id)}
                      />
                    ) : (
                      getInitials(selectedConvo.contacts?.name, selectedConvo.contacts?.phone)
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {selectedConvo.contacts?.name || selectedConvo.contacts?.phone}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-full bg-[hsl(142,70%,45%)]" />
                    Meu número
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {selectedConvo.status !== "closed" ? (
                  <>
                    <Button variant="ghost" size="sm" className="gap-1.5 h-8 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowTransfer(true)}>
                      <Shuffle className="h-3.5 w-3.5" />
                      Transferir
                    </Button>
                    <Button size="sm" className="gap-1.5 h-8 rounded-full px-4 text-xs font-medium bg-[hsl(142,70%,45%)] hover:bg-[hsl(142,70%,38%)] text-white" onClick={() => setShowCloseDialog(true)}>
                      <CheckCircle className="h-3.5 w-3.5" />
                      Encerrar
                    </Button>
                  </>
                ) : null}
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setShowFiles(true)} title="Arquivos">
                  <Folder className="h-4 w-4" />
                </Button>
                <div className="flex items-center" title={audioAllowed ? "Áudio bloqueado" : "Áudio permitido"}>
                  <Switch checked={audioAllowed} onCheckedChange={toggleAudio} className="scale-75" />
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setShowDetails(!showDetails)}>
                  <User className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Inline Tags */}
            <div className="border-b border-border px-4 py-1.5 bg-card">
              <TagSelector contactId={selectedConvo.contact_id} compact onTagsChange={() => {
                refreshContactTags();
                if (user) {
                  supabase.from("tags").select("id, name, color").eq("user_id", user.id).then(({ data }) => {
                    if (data) setTags(data);
                  });
                }
              }} />
            </div>

            {/* Messages - WhatsApp style */}
            <div
              className="flex-1 p-4 space-y-1 overflow-y-auto scrollbar-thin"
            >
              {messages.length > 0 && (
                <div className="flex justify-center mb-3">
                  <span className="bg-card text-muted-foreground text-[11px] px-3 py-1 rounded-lg shadow-sm">
                    {getDateLabel(messages[0].created_at)}
                  </span>
                </div>
              )}
              {messages.map((msg, i) => {
                const showDate = i > 0 && getDateLabel(msg.created_at) !== getDateLabel(messages[i - 1].created_at);
                return (
                  <div key={msg.id}>
                    {showDate && (
                      <div className="flex justify-center my-3">
                        <span className="bg-card text-muted-foreground text-[11px] px-3 py-1 rounded-lg shadow-sm">
                          {getDateLabel(msg.created_at)}
                        </span>
                      </div>
                    )}
                    <div className={`flex ${msg.from_me ? "justify-end mb-2" : "justify-start mb-4 pl-2"} group items-start gap-2`}>
                      {/* Checkbox for forward selection - left side for received */}
                      {selectingForForward && !msg.from_me && (
                        <button
                          onClick={() => setSelectedForForward(prev => {
                            const next = new Set(prev);
                            next.has(msg.id) ? next.delete(msg.id) : next.add(msg.id);
                            return next;
                          })}
                          className="mt-2 shrink-0"
                        >
                          <div className={cn(
                            "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                            selectedForForward.has(msg.id) ? "bg-[#00a884] border-[#00a884]" : "border-[#8696a0]"
                          )}>
                            {selectedForForward.has(msg.id) && <Check className="h-3.5 w-3.5 text-white" />}
                          </div>
                        </button>
                      )}
                      <div
                        className={cn(
                          "relative rounded-lg text-[14.2px] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
                          msg.media_url && msg.media_type
                            ? "max-w-[240px] px-1.5 py-1.5"
                            : msg.from_me
                              ? "max-w-[65%] pl-3 pr-8 py-2"
                              : "max-w-[65%] pl-4 pr-8 py-2.5",
                          msg.from_me
                            ? "bg-[#dcf8c6] dark:bg-[#005c4b] text-[#111b21] dark:text-[#e9edef] rounded-tr-none"
                            : "bg-white dark:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] rounded-tl-none"
                        )}
                        onClick={() => {
                          if (selectingForForward) {
                            setSelectedForForward(prev => {
                              const next = new Set(prev);
                              next.has(msg.id) ? next.delete(msg.id) : next.add(msg.id);
                              return next;
                            });
                          }
                        }}
                      >

                        {/* WhatsApp-style dropdown menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 z-10"
                            >
                              <ChevronDown className="h-5 w-5 text-[#8696a0]" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align={msg.from_me ? "end" : "start"} className="bg-popover border border-border text-popover-foreground min-w-[140px] p-1 rounded-lg shadow-xl">
                            {msg.from_me === false ? (
                              <>
                                <DropdownMenuItem
                                  className="text-[14px] cursor-pointer hover:bg-accent focus:bg-accent focus:text-accent-foreground rounded px-3 py-2"
                                  onClick={() => { setReactingToMsg(msg.id); setShowFullEmojiPicker(false); }}
                                >
                                  Reagir
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-[14px] cursor-pointer hover:bg-accent focus:bg-accent focus:text-accent-foreground rounded px-3 py-2"
                                  onClick={() => {
                                    setSelectingForForward(true);
                                    setSelectedForForward(new Set([msg.id]));
                                  }}
                                >
                                  Encaminhar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-[14px] cursor-pointer hover:bg-accent focus:bg-accent focus:text-accent-foreground rounded px-3 py-2"
                                  onClick={() => setReplyTo(msg)}
                                >
                                  Responder
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem
                                  className="text-[14px] cursor-pointer hover:bg-accent focus:bg-accent focus:text-accent-foreground rounded px-3 py-2"
                                  onClick={() => setReplyTo(msg)}
                                >
                                  Responder
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-[14px] cursor-pointer hover:bg-accent focus:bg-accent focus:text-accent-foreground rounded px-3 py-2"
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.body);
                                    toast.success("Mensagem copiada");
                                  }}
                                >
                                  Copiar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-[14px] cursor-pointer hover:bg-accent focus:bg-accent focus:text-accent-foreground rounded px-3 py-2 text-destructive focus:text-destructive"
                                  onClick={async () => {
                                    const { error } = await supabase.from("messages").delete().eq("id", msg.id);
                                    if (error) { toast.error("Erro ao deletar"); return; }
                                    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                                    toast.success("Mensagem deletada");
                                  }}
                                >
                                  Deletar
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {msg.from_me && signing && profileName && (
                          <p className="text-[11px] font-medium text-[#06cf9c] mb-0.5">{profileName}</p>
                        )}
                        {msg.media_url && msg.media_type ? (
                          <MediaMessage
                            mediaUrl={msg.media_url}
                            mediaType={msg.media_type}
                            body={msg.body}
                            fromMe={msg.from_me}
                          />
                        ) : msg.body.startsWith("⤳") ? (
                          <div>
                            <div className="flex items-center gap-1 mb-1">
                              <span className="text-[11px] text-[#53bdeb] italic font-medium">Encaminhada</span>
                            </div>
                            <p className="whitespace-pre-wrap leading-[19px]">
                              {msg.body.replace(/^⤳\s*_Mensagem encaminhada_\n\n?/, '').replace(/\*(.*?)\*/g, '$1')}
                            </p>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap leading-[19px]">
                            {msg.body.replace(/\*(.*?)\*/g, '$1')}
                          </p>
                        )}
                        <div className="flex items-center justify-end gap-1 -mb-0.5 mt-0.5">
                          <span className="text-[11px] text-[#667781] dark:text-[#ffffff99]">
                            {formatMessageTime(msg.created_at)}
                          </span>
                          {msg.from_me && (
                            <span className="inline-flex">
                              {msg.status === "sending" ? (
                                <svg viewBox="0 0 16 11" width="16" height="11" className="text-[#b3b3b3] dark:text-[#ffffff60]"><path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.336-.153.457.457 0 0 0-.344.153l-.546.58a.506.506 0 0 0 0 .72l2.882 3.006a.463.463 0 0 0 .68-.013l.013-.014 7.063-8.712a.504.504 0 0 0-.026-.694L11.071.653z" fill="currentColor"/></svg>
                              ) : msg.status === "read" ? (
                                <svg viewBox="0 0 16 11" width="16" height="11" className="text-[#53bdeb]"><path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.336-.153.457.457 0 0 0-.344.153l-.546.58a.506.506 0 0 0 0 .72l2.882 3.006a.463.463 0 0 0 .68-.013l.013-.014 7.063-8.712a.504.504 0 0 0-.026-.694L11.071.653z" fill="currentColor"/><path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.2-1.25-.679.884 1.564 1.632a.463.463 0 0 0 .68-.013l.013-.014 7.063-8.712a.504.504 0 0 0-.026-.694L15.071.653z" fill="currentColor"/></svg>
                              ) : msg.status === "delivered" ? (
                                <svg viewBox="0 0 16 11" width="16" height="11" className="text-[#b3b3b3] dark:text-[#ffffff99]"><path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.336-.153.457.457 0 0 0-.344.153l-.546.58a.506.506 0 0 0 0 .72l2.882 3.006a.463.463 0 0 0 .68-.013l.013-.014 7.063-8.712a.504.504 0 0 0-.026-.694L11.071.653z" fill="currentColor"/><path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.2-1.25-.679.884 1.564 1.632a.463.463 0 0 0 .68-.013l.013-.014 7.063-8.712a.504.504 0 0 0-.026-.694L15.071.653z" fill="currentColor"/></svg>
                              ) : (
                                <svg viewBox="0 0 16 11" width="16" height="11" className="text-[#b3b3b3] dark:text-[#ffffff99]"><path d="M11.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-2.011-2.095a.463.463 0 0 0-.336-.153.457.457 0 0 0-.344.153l-.546.58a.506.506 0 0 0 0 .72l2.882 3.006a.463.463 0 0 0 .68-.013l.013-.014 7.063-8.712a.504.504 0 0 0-.026-.694L11.071.653z" fill="currentColor"/><path d="M15.071.653a.457.457 0 0 0-.304-.102.493.493 0 0 0-.381.178l-6.19 7.636-1.2-1.25-.679.884 1.564 1.632a.463.463 0 0 0 .68-.013l.013-.014 7.063-8.712a.504.504 0 0 0-.026-.694L15.071.653z" fill="currentColor"/></svg>
                              )}
                            </span>
                          )}
                        </div>
                        {/* Emoji reaction display */}
                        {reactions.get(msg.id) && (
                          <div className={`flex ${msg.from_me ? "justify-end" : "justify-start"} -mt-1 mb-0.5`}>
                            <button
                              onClick={() => { setReactions(prev => { const n = new Map(prev); n.delete(msg.id); return n; }); }}
                              className="bg-card border border-border rounded-full px-1.5 py-0.5 text-base hover:scale-110 transition-transform shadow-sm"
                              title="Remover reação"
                            >
                              {reactions.get(msg.id)}
                            </button>
                          </div>
                        )}
                        {/* Inline emoji reaction picker */}
                        {reactingToMsg === msg.id && (
                          <div className={`flex ${msg.from_me ? "justify-end" : "justify-start"} mb-1`}>
                            <Popover open={reactingToMsg === msg.id} onOpenChange={(open) => { if (!open) setReactingToMsg(null); }}>
                              <PopoverTrigger asChild>
                                <div className="bg-card rounded-full px-2 py-1 flex items-center gap-1 shadow-lg border border-border animate-in fade-in zoom-in-95 duration-150">
                                  {["👍", "❤️", "😂", "😮", "😢", "🙏"].map(emoji => (
                                    <button
                                      key={emoji}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setReactions(prev => new Map(prev).set(msg.id, emoji));
                                        setReactingToMsg(null);
                                      }}
                                      className="text-xl hover:scale-125 transition-transform p-1"
                                    >
                                      {emoji}
                                    </button>
                                  ))}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowFullEmojiPicker(prev => !prev);
                                    }}
                                    className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setReactingToMsg(null);
                                      setShowFullEmojiPicker(false);
                                    }}
                                    className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              </PopoverTrigger>
                              {showFullEmojiPicker && (
                                <PopoverContent
                                  side="top"
                                  align={msg.from_me ? "end" : "start"}
                                  sideOffset={8}
                                  collisionPadding={16}
                                  className="w-80 p-0 bg-card border-border rounded-xl shadow-xl"
                                  onOpenAutoFocus={(e) => e.preventDefault()}
                                >
                                  <div className="p-3 grid grid-cols-8 gap-1 max-h-56 overflow-y-auto scrollbar-thin">
                                    {["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊","😇","🥰","😍","🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸","😎","🤓","🧐","😕","🫤","😟","🙁","☹️","😮","😯","😲","😳","🥺","🥹","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖","👍","👎","👊","✊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✌️","🤞","🫰","🤟","🤘","👌","🤌","🤏","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖","👋","🤙","💪","❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","💕","💞","💓","💗","💖","💘","💝","💟","🎉","🎊","🎈","🎁","🏆","🥇","🔥","⭐","💡","🚀","🎯","💬","📢","✅","❌","⚠️"].map(emoji => (
                                      <button
                                        key={emoji}
                                        onClick={() => {
                                          setReactions(prev => new Map(prev).set(msg.id, emoji));
                                          setReactingToMsg(null);
                                          setShowFullEmojiPicker(false);
                                        }}
                                        className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-accent text-lg transition-colors"
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                </PopoverContent>
                              )}
                            </Popover>
                          </div>
                        )}
                      </div>
                      {/* Checkbox for forward selection - right side for sent */}
                      {selectingForForward && msg.from_me && (
                        <button
                          onClick={() => setSelectedForForward(prev => {
                            const next = new Set(prev);
                            next.has(msg.id) ? next.delete(msg.id) : next.add(msg.id);
                            return next;
                          })}
                          className="mt-2 shrink-0"
                        >
                          <div className={cn(
                            "h-5 w-5 rounded border-2 flex items-center justify-center transition-colors",
                            selectedForForward.has(msg.id) ? "bg-[#00a884] border-[#00a884]" : "border-[#8696a0]"
                          )}>
                            {selectedForForward.has(msg.id) && <Check className="h-3.5 w-3.5 text-white" />}
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Forward selection bar */}
            {selectingForForward && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-card">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">{selectedForForward.size} selecionada(s)</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground hover:bg-accent"
                    onClick={() => { setSelectingForForward(false); setSelectedForForward(new Set()); }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    className="bg-[#00a884] hover:bg-[#00a884]/80 text-white gap-1.5"
                    disabled={selectedForForward.size === 0}
                    onClick={() => {
                      const firstSelected = messages.find(m => selectedForForward.has(m.id)) || null;
                      setSelectingForForward(false);
                      // Use setTimeout to avoid state conflicts
                      setTimeout(() => setForwardingMsg(firstSelected), 0);
                    }}
                  >
                    <Forward className="h-4 w-4" />
                    Encaminhar
                  </Button>
                </div>
              </div>
            )}

            {/* Message input - WhatsApp style */}
            {!selectingForForward && <div className="border-t border-border px-3 py-2 bg-card">
              {/* Reply preview */}
              {replyTo && (
                <div className="flex items-center gap-2 mb-2 bg-muted rounded-lg px-3 py-2 border-l-4 border-[hsl(var(--whatsapp))]">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[hsl(var(--whatsapp))]">
                      {replyTo.from_me ? (profileName || "Você") : (selectedConvo?.contacts?.name || "Contato")}
                    </p>
                    <p className="text-[12px] text-muted-foreground truncate">
                      {replyTo.media_type ? (replyTo.media_type === "audio" ? "🎤 Áudio" : replyTo.media_type === "image" ? "📷 Imagem" : "📄 Arquivo") : replyTo.body}
                    </p>
                  </div>
                  <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
                onChange={handleFileUpload}
              />
              <div className="flex gap-2 items-center">
                <div className="flex items-center gap-0.5">
                  <EmojiPicker
                    onSelect={(emoji) => setMessageInput((prev) => prev + emoji)}
                    disabled={uploading}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-transparent"
                    onClick={openFilePicker}
                    disabled={uploading}
                    title="Enviar arquivo"
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                </div>
                <Input
                  placeholder={uploading ? "Enviando arquivo..." : "Digite uma mensagem"}
                  className="flex-1 bg-muted border-0 text-foreground placeholder:text-muted-foreground rounded-lg h-10 focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSendMessage();
                  }}
                  disabled={uploading}
                />
                <div className="flex items-center gap-0.5">
                  <SignatureButton
                    userName={profileName}
                    signing={signing}
                    onToggle={async () => { const next = !signing; setSigning(next); if (user) { const { error } = await supabase.from("profiles").update({ signing_enabled: next }).eq("id", user.id); if (error) setSigning(!next); } }}
                    disabled={uploading}
                  />
                  <QuickMessagesButton
                    onSelect={(text) => setMessageInput(text)}
                    disabled={uploading}
                  />
                  <StickerPicker
                    onSelect={(sticker) => {
                      setMessageInput(sticker);
                      setTimeout(() => handleSendMessage(), 50);
                    }}
                    disabled={uploading}
                  />
                </div>
                {messageInput.trim() ? (
                  <Button size="icon" onClick={handleSendMessage} className="shrink-0 h-10 w-10 rounded-full bg-[#00a884] hover:bg-[#06cf9c] text-white" disabled={uploading}>
                    <Send className="h-5 w-5" />
                  </Button>
                ) : (
                  <Button size="icon" variant="ghost" className="shrink-0 h-10 w-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-transparent" disabled={uploading} title="Gravar áudio">
                    <Mic className="h-5 w-5" />
                  </Button>
                )}
              </div>
            </div>}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="h-20 w-20 rounded-2xl bg-muted flex items-center justify-center mb-6">
              <MessageCircle className="h-10 w-10 text-muted-foreground/50" />
            </div>
            <p className="text-foreground font-semibold text-lg mb-1">Selecione uma conversa</p>
            <p className="text-muted-foreground text-sm">Escolha uma conversa para começar o atendimento</p>
          </div>
        )}
      </div>

      {/* Contact Details Sidebar */}
      {showDetails && selectedConvo && (
        <ContactDetailsSidebar
          contactId={selectedConvo.contact_id}
          contactName={selectedConvo.contacts?.name}
          contactPhone={selectedConvo.contacts?.phone}
          contactAvatar={selectedConvo.contacts?.avatar_url}
          conversationId={selectedConvo.id}
          conversationCreatedAt={selectedConvo.last_message_at || new Date().toISOString()}
          onClose={() => setShowDetails(false)}
        />
      )}

      {/* Transfer Dialog */}
      <TransferDialog
        open={showTransfer}
        onOpenChange={setShowTransfer}
        onTransfer={handleTransfer}
      />

      {/* Close Conversation Dialog */}
      <CloseConversationDialog
        open={showCloseDialog}
        onOpenChange={setShowCloseDialog}
        onClose={handleClose}
      />

      {/* Conversation Files Dialog */}
      {selectedConvo && (
        <ConversationFilesDialog
          open={showFiles}
          onOpenChange={setShowFiles}
          conversationId={selectedConvo.id}
          contactName={selectedConvo.contacts?.name || selectedConvo.contacts?.phone || "Contato"}
        />
      )}

      {/* QR Code Dialog */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Escaneie o QR Code
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-4">
            {qrCode ? (
              <img src={qrCode} alt="QR Code WhatsApp" className="w-64 h-64 rounded-lg" />
            ) : (
              <div className="w-64 h-64 bg-muted rounded-lg flex items-center justify-center">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            )}
            <p className="text-sm text-muted-foreground text-center">
              Abra o WhatsApp → Menu → Aparelhos Conectados → Conectar Aparelho
            </p>
            <div className="flex gap-2">
              <Button onClick={handleCheckAfterScan} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Já escaneei
              </Button>
              <Button variant="outline" onClick={handleConnect}>
                Novo QR Code
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* New Conversation Dialog */}
      <Dialog open={showNewConvo} onOpenChange={setShowNewConvo}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Nova Conversa
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Conexão *</label>
              <select
                value={newConvoInstance}
                onChange={(e) => setNewConvoInstance(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                <option value="">Selecione uma conexão</option>
                {connections.map((c) => (
                  <option key={c.instance_name} value={c.instance_name}>{c.instance_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Telefone *</label>
              <Input
                placeholder="(11) 99999-9999"
                value={newPhone}
                onChange={(e) => setNewPhone(formatPhoneBR(e.target.value))}
                maxLength={15}
              />
              <p className="text-xs text-muted-foreground mt-1">Formato: (DDD) número</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Nome (opcional)</label>
              <Input
                placeholder="Nome do contato"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button
              className="w-full gap-2"
              onClick={handleCreateConversation}
              disabled={creatingConvo || !newPhone.trim() || !newConvoInstance}
            >
              {creatingConvo ? <RotateCw className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              {creatingConvo ? "Criando..." : "Iniciar Conversa"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Forward Message Dialog */}
      <Dialog open={!!forwardingMsg} onOpenChange={(open) => { if (!open) { setForwardingMsg(null); setForwardSearch(""); setSelectedForForward(new Set()); setSelectedForwardTargets(new Set()); } }}>
        <DialogContent className="bg-[#111b21] border-[#2a3942] text-[#e9edef] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#e9edef]">Encaminhar {selectedForForward.size > 1 ? `${selectedForForward.size} mensagens` : "mensagem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Buscar conversa..."
              value={forwardSearch}
              onChange={(e) => setForwardSearch(e.target.value)}
              className="bg-[#202c33] border-[#2a3942] text-[#e9edef] placeholder:text-[#8696a0]"
            />
            <div className="bg-[#1a2930] rounded-lg px-3 py-2 border-l-4 border-[#00a884] max-h-20 overflow-y-auto">
              {messages.filter(m => selectedForForward.has(m.id)).map(m => (
                <p key={m.id} className="text-[12px] text-[#8696a0] truncate">{m.body}</p>
              ))}
              {selectedForForward.size === 0 && forwardingMsg && (
                <p className="text-[12px] text-[#8696a0] truncate">{forwardingMsg.body}</p>
              )}
            </div>
            {selectedForwardTargets.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Array.from(selectedForwardTargets).map(id => {
                  const convo = conversations.find(c => c.id === id);
                  if (!convo) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1 bg-[#00a884]/20 text-[#00a884] text-xs px-2 py-1 rounded-full">
                      {convo.contacts?.name || formatPhoneBR(convo.contacts?.phone || "")}
                      <button onClick={() => setSelectedForwardTargets(prev => { const n = new Set(prev); n.delete(id); return n; })}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            <div className="max-h-60 overflow-y-auto space-y-1">
              {conversations
                .filter((c) => c.id !== selected)
                .filter((c) => {
                  if (!forwardSearch) return true;
                  const name = c.contacts?.name?.toLowerCase() || "";
                  const phone = c.contacts?.phone?.toLowerCase() || "";
                  return name.includes(forwardSearch.toLowerCase()) || phone.includes(forwardSearch.toLowerCase());
                })
                .map((convo) => {
                  const isSelected = selectedForwardTargets.has(convo.id);
                  return (
                    <button
                      key={convo.id}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left",
                        isSelected ? "bg-[#00a884]/10" : "hover:bg-[#202c33]"
                      )}
                      onClick={() => {
                        setSelectedForwardTargets(prev => {
                          const next = new Set(prev);
                          next.has(convo.id) ? next.delete(convo.id) : next.add(convo.id);
                          return next;
                        });
                      }}
                    >
                      <div className={cn(
                        "h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                        isSelected ? "bg-[#00a884] border-[#00a884]" : "border-[#8696a0]"
                      )}>
                        {isSelected && <Check className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <div className="w-10 h-10 rounded-full bg-[#2a3942] flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-[#8696a0]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#e9edef] truncate">
                          {convo.contacts?.name || formatPhoneBR(convo.contacts?.phone || "")}
                        </p>
                        <p className="text-xs text-[#8696a0] truncate">
                          {formatPhoneBR(convo.contacts?.phone || "")}
                        </p>
                      </div>
                    </button>
                  );
                })}
              {conversations.filter((c) => c.id !== selected).length === 0 && (
                <p className="text-center text-[#8696a0] text-sm py-4">Nenhuma conversa encontrada</p>
              )}
            </div>
            <Button
              className="w-full bg-[#00a884] hover:bg-[#00a884]/80 text-white gap-2"
              disabled={selectedForwardTargets.size === 0 || forwardSending}
              onClick={async () => {
                const msgsToForward = selectedForForward.size > 0
                  ? messages.filter(m => selectedForForward.has(m.id))
                  : forwardingMsg ? [forwardingMsg] : [];
                if (msgsToForward.length === 0) return;

                setForwardSending(true);
                const fwdBody = `⤳ _Mensagem encaminhada_\n\n${msgsToForward.map(m => m.body).join("\n\n")}`;
                try {
                  const targets = conversations.filter(c => selectedForwardTargets.has(c.id));
                  await Promise.all(targets.map(async (convo) => {
                    const sendInst = convo.instance_name || instanceName;
                    await sendMessage(sendInst, convo.contacts.phone, fwdBody);
                    await supabase.from("messages").insert({
                      conversation_id: convo.id,
                      from_me: true,
                      body: fwdBody,
                      status: "sent",
                    });
                    await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", convo.id);
                  }));
                  toast.success(`Encaminhado para ${targets.length} conversa(s)`);
                  setForwardingMsg(null);
                  setForwardSearch("");
                  setSelectedForForward(new Set());
                  setSelectedForwardTargets(new Set());
                } catch (err: any) {
                  toast.error("Erro ao encaminhar: " + (err?.message || "Tente novamente"));
                } finally {
                  setForwardSending(false);
                }
              }}
            >
              {forwardSending ? <RotateCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {forwardSending ? "Enviando..." : `Enviar${selectedForwardTargets.size > 0 ? ` (${selectedForwardTargets.size})` : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inbox;
