import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
type RealtimeChannel = { unsubscribe: () => void; on: (...args: unknown[]) => unknown; subscribe: (...args: unknown[]) => unknown };
import whatsappLightWallpaper from "@/assets/whatsapp-light-wallpaper.png";
import whatsappDarkWallpaper from "@/assets/whatsapp-dark-wallpaper.png";
import { formatPhoneBR, unformatPhone } from "@/lib/phone-mask";
import { useSearchParams } from "react-router-dom";
import {
  Search, Phone, MessageCircle, Send, Smile, Paperclip, QrCode, RefreshCw,
  Wifi, WifiOff, Plus, Filter, Bell, BellOff, RotateCw, ArrowRight, User,
  Shuffle, CheckCircle, X, Image, FileText, Mic, Folder, ChevronDown, Smartphone, Star,
  Trash2, Copy, Forward, Reply, Pencil, Check, AlertCircle, Bot, Clock, Target, Sparkles,
  LayoutTemplate, Tag, History, Ban, LayoutList, List, GitMerge, ShoppingBag,
} from "lucide-react";
import { useFollowupReminders } from "@/hooks/useFollowupReminders";
import FollowupDialog from "@/components/followup/FollowupDialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import GlobalSearch from "@/components/inbox/GlobalSearch";
import TransferDialog from "@/components/inbox/TransferDialog";
import CloseConversationDialog from "@/components/inbox/CloseConversationDialog";
import ConversationFilesDialog from "@/components/inbox/ConversationFilesDialog";
import MediaMessage from "@/components/chat/MediaMessage";
import { useMediaUpload } from "@/components/chat/useMediaUpload";
import { EmojiPicker, StickerPicker } from "@/components/chat/EmojiStickerPicker";
import { SignatureButton, QuickMessagesButton } from "@/components/chat/ChatActionButtons";
import ContactDetailsSidebar from "@/components/inbox/ContactDetailsSidebar";
import TagSelector from "@/components/shared/TagSelector";
import type { TemplateButton } from "@/pages/HSMTemplates";
import type { FlowTemplate, FlowTemplateStep } from "@/pages/FlowTemplates";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { createInstance, getQRCode, getInstanceStatus, sendMessage, setupWebhook } from "@/lib/evolution-api";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useMessageQueue } from "@/hooks/useMessageQueue";
import { loadDistributionConfig, distributeConversation } from "@/lib/autoDistribution";
import type { DistributionConfig } from "@/lib/autoDistribution";

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

interface ConversationLabel {
  id: string;
  name: string;
  color: string;
}

interface ConversationTransfer {
  id: string;
  conversation_id: string;
  from_agent_id: string | null;
  to_agent_id: string | null;
  from_agent_name: string | null;
  to_agent_name: string | null;
  note: string | null;
  transferred_at: string;
}

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
  starred: boolean;
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent' | null;
  label_ids: string[];
  created_at?: string;
  is_merged?: boolean;
  merged_into?: string | null;
  contacts: DBContact;
}

interface DBMessage {
  id: string;
  conversation_id: string;
  from_me: boolean;
  direction?: 'inbound' | 'outbound';
  body: string;
  media_url: string | null;
  media_type: string | null;
  status: string;
  created_at: string;
  whatsapp_message_id?: string | null;
  content?: string;
}

type TabFilter = "atendendo" | "aguardando" | "encerradas" | "favoritas";

interface CatalogProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  active: boolean;
}

interface HSMTemplateInbox {
  id: string;
  name: string;
  category: string;
  status: string;
  body: string;
  footer: string | null;
  header_type: string | null;
  header_content: string | null;
  buttons: TemplateButton[];
  variables: string[];
  language: string;
}

function substituteQuickReplyVars(text: string, contactName: string | null, contactPhone: string): string {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = (contactName || contactPhone).split(" ")[0];
  const protocol = `#${Date.now().toString().slice(-6)}`;

  return text
    .replace(/\{\{nome\}\}/gi, contactName || contactPhone)
    .replace(/\{\{primeiro_nome\}\}/gi, firstName)
    .replace(/\{\{saudacao\}\}/gi, greeting)
    .replace(/\{\{protocolo\}\}/gi, protocol)
    .replace(/\{\{protocolo_aleatorio\}\}/gi, Math.random().toString(36).slice(2, 8).toUpperCase())
    .replace(/\{\{data\}\}/gi, now.toLocaleDateString("pt-BR"))
    .replace(/\{\{hora\}\}/gi, now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
    .replace(/\{\{telefone\}\}/gi, contactPhone)
    .replace(/\{\{numero_cliente\}\}/gi, protocol)
    .replace(/\{\{setor\}\}/gi, "Atendimento")
    .replace(/\{\{conexao\}\}/gi, "WhatsApp");
}

const Inbox = () => {
  const { user } = useAuth();
  const { isOnline } = useOnlineStatus();
  const { queue, enqueue, dequeue } = useMessageQueue();

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

  // Flush queued messages when coming back online
  useEffect(() => {
    if (!isOnline || queue.length === 0) return;
    const pendingForConvo = selected
      ? queue.filter((m) => m.conversationId === selected)
      : [];
    pendingForConvo.forEach(async (qm) => {
      const convo = conversations.find((c) => c.id === qm.conversationId);
      if (!convo) return;
      try {
        const sendInst = convo.instance_name || instanceName;
        await Promise.all([
          sendMessage(sendInst, convo.contacts.phone, qm.content),
          supabase.from("messages").insert({
            conversation_id: qm.conversationId,
            from_me: true,
            body: qm.content,
            status: "sent",
          }),
        ]);
        dequeue(qm.id);
      } catch {
        // leave in queue for next attempt
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

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
  const [msgSearch, setMsgSearch] = useState("");
  const [showMsgSearch, setShowMsgSearch] = useState(false);
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
  const [selectedConvos, setSelectedConvos] = useState<Set<string>>(new Set());
  const reconnectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Audio recording states
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Slash autocomplete state
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [quickRepliesForSlash, setQuickRepliesForSlash] = useState<{ shortcut: string; message: string }[]>([]);
  const CONVO_PAGE_SIZE = 30;
  const [convoPage, setConvoPage] = useState(1);

  // File Manager state
  const [fileManagerOpen, setFileManagerOpen] = useState(false);
  const [fileManagerFiles, setFileManagerFiles] = useState<{ name: string; metadata: { size?: number } | null }[]>([]);
  const [fileManagerSearch, setFileManagerSearch] = useState("");
  const [fileManagerLoading, setFileManagerLoading] = useState(false);
  const [fileManagerSelected, setFileManagerSelected] = useState<{ url: string; name: string; type: string } | null>(null);
  const fileManagerUploadRef = useRef<HTMLInputElement>(null);

  // Conversation labels state
  const [allLabels, setAllLabels] = useState<ConversationLabel[]>([]);
  const [filterLabel, setFilterLabel] = useState("");
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false);
  const [historyPopoverOpen, setHistoryPopoverOpen] = useState(false);
  const [transferHistory, setTransferHistory] = useState<ConversationTransfer[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // SLA filter state
  const [slaFilterOnly, setSlaFilterOnly] = useState(false);
  const [contactDisableChatbot, setContactDisableChatbot] = useState(false);

  // Schedule message state
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [scheduleDateTime, setScheduleDateTime] = useState("");

  // HSM Template state
  const [hsmDialogOpen, setHsmDialogOpen] = useState(false);
  const [hsmTemplates, setHsmTemplates] = useState<HSMTemplateInbox[]>([]);
  const [hsmSearch, setHsmSearch] = useState("");
  const [hsmSelected, setHsmSelected] = useState<HSMTemplateInbox | null>(null);
  const [hsmVarValues, setHsmVarValues] = useState<Record<string, string>>({});
  const [hsmSending, setHsmSending] = useState(false);

  // Blacklist state
  const [blacklistedPhones, setBlacklistedPhones] = useState<Set<string>>(new Set());
  const [showBlockedConvos, setShowBlockedConvos] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [blockPhone, setBlockPhone] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockExpiration, setBlockExpiration] = useState<"nunca" | "7" | "30" | "90" | "custom">("nunca");
  const [blockCustomDate, setBlockCustomDate] = useState("");
  const [blocking, setBlocking] = useState(false);

  // Global search state
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  // Keyboard shortcuts help modal
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);

  // Follow-up reminder state
  const [showFollowupDialog, setShowFollowupDialog] = useState(false);
  const { reminders: followupReminders, createReminder } = useFollowupReminders();
  // Map of conversation_id -> has pending reminder
  const followupConvoIds = new Set(
    followupReminders
      .filter(r => r.status === "pending" && r.conversation_id)
      .map(r => r.conversation_id as string)
  );

  // Merge Conversations state
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeTargetConvos, setMergeTargetConvos] = useState<DBConversation[]>([]);
  const [mergeSearch, setMergeSearch] = useState("");
  const [merging, setMerging] = useState(false);

  // Flow Templates (Apply) state
  const [flowTemplateDialogOpen, setFlowTemplateDialogOpen] = useState(false);
  const [flowTemplates, setFlowTemplates] = useState<FlowTemplate[]>([]);
  const [flowTemplatesLoading, setFlowTemplatesLoading] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null);

  // Focus Mode state
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem("inbox_focus_mode") === "true");

  // Compact Mode state
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem("inbox_compact_mode") === "true");

  // AI Suggested Replies state
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // AI Summary state
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Pix QR Code state
  const [pixDialogOpen, setPixDialogOpen] = useState(false);
  const [pixAmount, setPixAmount] = useState("");
  const [pixDescription, setPixDescription] = useState("");
  const [pixKey, setPixKey] = useState("");
  const [pixKeyType, setPixKeyType] = useState("aleatoria");
  const [pixPayload, setPixPayload] = useState<string | null>(null);
  const [pixMerchantName, setPixMerchantName] = useState("");
  const [pixMerchantCity, setPixMerchantCity] = useState("");

  // Product catalog state
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [sendingCatalog, setSendingCatalog] = useState(false);

  // Sentiment override dropdown
  const [sentimentDropdownOpen, setSentimentDropdownOpen] = useState(false);

  // Auto distribution config
  const [distConfig, setDistConfig] = useState<DistributionConfig | null>(null);

  // Typing indicator state
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typingUsers, setTypingUsers] = useState<{ user_id: string; user_name: string }[]>([]);

  // Message reactions state: messageId -> array of {emoji, count, users[]}
  const [messageReactions, setMessageReactions] = useState<
    Record<string, { emoji: string; count: number; users: string[] }[]>
  >({});
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);

  const handleAvatarError = useCallback((contactId: string) => {
    setAvatarErrorContacts((prev) => {
      if (prev.has(contactId)) return prev;
      const next = new Set(prev);
      next.add(contactId);
      return next;
    });
  }, []);

  // Typing indicator: subscribe/unsubscribe per active conversation
  useEffect(() => {
    if (typingChannelRef.current) {
      supabase.removeChannel(typingChannelRef.current);
      typingChannelRef.current = null;
    }
    setTypingUsers([]);
    if (!selected) return;

    const channel = supabase.channel(`typing:${selected}`, {
      config: { presence: { key: user?.id || "anon" } },
    });

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{ typing: boolean; user_id: string; user_name: string }>();
      const typers: { user_id: string; user_name: string }[] = [];
      for (const presences of Object.values(state)) {
        for (const p of presences) {
          if (p.typing && p.user_id !== user?.id) {
            typers.push({ user_id: p.user_id, user_name: p.user_name });
          }
        }
      }
      setTypingUsers(typers);
    });

    channel.subscribe();
    typingChannelRef.current = channel;

    return () => {
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, user?.id]);

  const broadcastTyping = useCallback(() => {
    if (!typingChannelRef.current || !user) return;
    typingChannelRef.current.track({
      typing: true,
      user_id: user.id,
      user_name: profileName || user.email || "Agente",
    });
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      typingChannelRef.current?.track({
        typing: false,
        user_id: user.id,
        user_name: profileName || user.email || "Agente",
      });
    }, 1500);
  }, [user, profileName]);

  // Load message reactions for the active conversation
  const loadMessageReactions = useCallback(async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from("message_reactions" as any)
        .select("message_id, user_id, emoji, profiles(full_name)")
        .filter("message_id", "like", `%${conversationId}%`);

      if (error || !data) return;

      const map: Record<string, { emoji: string; count: number; users: string[] }[]> = {};
      for (const row of data as any[]) {
        if (!map[row.message_id]) map[row.message_id] = [];
        const existing = map[row.message_id].find((r) => r.emoji === row.emoji);
        const userName = row.profiles?.full_name || "Agente";
        if (existing) {
          existing.count += 1;
          existing.users.push(userName);
        } else {
          map[row.message_id].push({ emoji: row.emoji, count: 1, users: [userName] });
        }
      }
      setMessageReactions(map);
    } catch {
      // table may not exist yet, ignore
    }
  }, []);

  // Load reactions when messages are loaded
  useEffect(() => {
    if (selected) loadMessageReactions(selected);
  }, [selected, messages.length, loadMessageReactions]);

  // Close reaction picker on outside click
  useEffect(() => {
    if (!reactionPickerMsgId) return;
    const handler = () => setReactionPickerMsgId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [reactionPickerMsgId]);

  // Close sentiment dropdown on outside click
  useEffect(() => {
    if (!sentimentDropdownOpen) return;
    const handler = () => setSentimentDropdownOpen(false);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [sentimentDropdownOpen]);

  const handleToggleReaction = useCallback(
    async (msgId: string, emoji: string) => {
      if (!user) return;
      const currentReactions = messageReactions[msgId] || [];
      const existing = currentReactions.find((r) => r.emoji === emoji);
      const alreadyReacted = existing?.users.some((u) => u === (profileName || user.email || "Agente"));

      // Optimistic update
      setMessageReactions((prev) => {
        const arr = [...(prev[msgId] || [])];
        const idx = arr.findIndex((r) => r.emoji === emoji);
        if (alreadyReacted) {
          if (idx !== -1) {
            const updated = { ...arr[idx], count: arr[idx].count - 1, users: arr[idx].users.filter((u) => u !== (profileName || user.email || "Agente")) };
            if (updated.count <= 0) arr.splice(idx, 1);
            else arr[idx] = updated;
          }
        } else {
          if (idx !== -1) {
            arr[idx] = { ...arr[idx], count: arr[idx].count + 1, users: [...arr[idx].users, profileName || user.email || "Agente"] };
          } else {
            arr.push({ emoji, count: 1, users: [profileName || user.email || "Agente"] });
          }
        }
        return { ...prev, [msgId]: arr };
      });

      try {
        if (alreadyReacted) {
          await (supabase.from("message_reactions" as any) as any)
            .delete()
            .eq("message_id", msgId)
            .eq("user_id", user.id)
            .eq("emoji", emoji);
        } else {
          await (supabase.from("message_reactions" as any) as any).upsert({
            message_id: msgId,
            user_id: user.id,
            emoji,
          });
        }
      } catch {
        // table may not exist yet, ignore
      }
    },
    [user, profileName, messageReactions]
  );

  // Ctrl+K / Cmd+K → open global search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setGlobalSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Keyboard shortcuts (J/K/R/Esc/N/S/Ctrl+/)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only fire if no input/textarea/select/contenteditable is focused
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const isEditable = (document.activeElement as HTMLElement)?.isContentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || isEditable) return;

      // Ctrl+/ → toggle shortcuts modal
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
        return;
      }

      if (e.key === "Escape") {
        if (showShortcutsModal) { setShowShortcutsModal(false); return; }
        if (globalSearchOpen) { setGlobalSearchOpen(false); return; }
        setSelected(null);
        return;
      }

      // J → next conversation
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        const idx = focusFiltered.findIndex((c) => c.id === selected);
        const next = focusFiltered[idx + 1];
        if (next) handleSelectConvo(next.id);
        return;
      }

      // K → previous conversation
      if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        const idx = focusFiltered.findIndex((c) => c.id === selected);
        const prev = focusFiltered[Math.max(0, idx - 1)];
        if (prev) handleSelectConvo(prev.id);
        return;
      }

      // R → focus reply textarea
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        (document.querySelector('textarea[placeholder*="mensagem"]') as HTMLTextAreaElement | null)?.focus();
        return;
      }

      // N → mark current conversation as read
      if (e.key === "n" || e.key === "N") {
        if (!selected) return;
        e.preventDefault();
        supabase.from("conversations").update({ unread_count: 0 }).eq("id", selected).then(() => {
          setConversations((prev) => prev.map((c) => c.id === selected ? { ...c, unread_count: 0 } : c));
        });
        return;
      }

      // S → toggle star on current conversation
      if (e.key === "s" || e.key === "S") {
        if (!selected) return;
        e.preventDefault();
        const conv = conversations.find((c) => c.id === selected);
        if (conv) toggleStarred(conv.id, conv.starred);
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, focusFiltered, conversations, showShortcutsModal, globalSearchOpen]);

  const toggleFavorite = (convoId: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(convoId)) next.delete(convoId); else next.add(convoId);
      localStorage.setItem("inbox_favorites", JSON.stringify([...next]));
      return next;
    });
  };
  // Toggle starred in DB and local state
  const toggleStarred = async (convoId: string, currentStarred: boolean) => {
    await supabase.from("conversations").update({ starred: !currentStarred }).eq("id", convoId);
    setConversations(prev => prev.map(c => c.id === convoId ? { ...c, starred: !currentStarred } : c));
  };

  // Audio recording functions
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch {
      toast.error("Permissão de microfone negada");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    setIsRecording(false);
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
    setIsRecording(false);
    setAudioBlob(null);
    if (audioUrl) { URL.revokeObjectURL(audioUrl); }
    setAudioUrl(null);
    setRecordingSeconds(0);
  };

  const sendAudio = async () => {
    if (!audioBlob || !selected) return;
    const convo = conversations.find((c) => c.id === selected);
    if (!convo) return;

    const timestamp = Date.now();
    const fileName = `audio/${selected}_${timestamp}.webm`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(fileName, audioBlob, { contentType: "audio/webm", upsert: true });

      if (uploadError) { toast.error("Erro ao enviar áudio: " + uploadError.message); return; }

      const { data: urlData } = supabase.storage.from("chat-media").getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      const sendInstanceName = convo.instance_name || instanceName;
      const optimisticMsg: DBMessage = {
        id: `temp-audio-${timestamp}`,
        conversation_id: selected,
        from_me: true,
        body: "🎤 Áudio",
        media_url: publicUrl,
        media_type: "audio",
        status: "sending",
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      const [, dbResult] = await Promise.all([
        sendMessage(sendInstanceName, convo.contacts.phone, publicUrl),
        supabase.from("messages").insert({
          conversation_id: selected,
          from_me: true,
          body: "🎤 Áudio",
          media_url: publicUrl,
          media_type: "audio",
          status: "sent",
        }).select().single(),
      ]);

      if (dbResult.data) {
        setMessages((prev) => prev.map((m) => m.id === optimisticMsg.id ? (dbResult.data as DBMessage) : m));
      }
      await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", selected);

      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioBlob(null);
      setAudioUrl(null);
      setRecordingSeconds(0);
    } catch (err: any) {
      toast.error("Erro ao enviar áudio: " + (err?.message || "Tente novamente"));
    }
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

  // Load all conversation labels
  useEffect(() => {
    supabase.from("conversation_labels" as any).select("*").order("name").then(({ data }) => {
      if (data) setAllLabels(data as ConversationLabel[]);
    });
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

  // Load quick replies for slash autocomplete
  useEffect(() => {
    supabase.from("quick_replies").select("shortcut, message").order("created_at").then(({ data }) => {
      if (data) setQuickRepliesForSlash(data);
    });
  }, []);

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
      .select("id, contact_id, instance_name, status, unread_count, last_message_at, assigned_to, category_id, starred, sentiment, label_ids, created_at, is_merged, merged_into, contacts(*)")
      .eq("is_merged", false)
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

  // Load active blacklist phones
  const loadBlacklist = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("blacklist" as any)
        .select("phone, expires_at, is_active")
        .eq("is_active", true);
      if (data) {
        const now = new Date();
        const phones = new Set<string>(
          (data as { phone: string; expires_at: string | null; is_active: boolean }[])
            .filter(e => !e.expires_at || new Date(e.expires_at) > now)
            .map(e => e.phone)
        );
        setBlacklistedPhones(phones);
      }
    } catch {
      // table may not exist yet
    }
  }, []);

  useEffect(() => { loadBlacklist(); }, [loadBlacklist]);

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
    // Load auto distribution config once on mount
    loadDistributionConfig().then((cfg) => {
      if (cfg) setDistConfig(cfg);
    });
  }, [loadConversations, checkConnection]);

  // Auto-reconnect: verificar status a cada 30 segundos
  useEffect(() => {
    if (!instanceName) return;
    reconnectIntervalRef.current = setInterval(async () => {
      try {
        const result = await getInstanceStatus(instanceName);
        const state = result?.instance?.state || result?.state;
        const isConnected = state === "open";
        setConnected(isConnected);
      } catch {
        setConnected(false);
      }
    }, 30000);

    return () => {
      if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
    };
  }, [instanceName]);

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
        // Analyze sentiment for new inbound messages
        if (!newMsg.from_me) {
          setMessages(prev => {
            const convoMsgs = prev.filter(m => m.conversation_id === newMsg.conversation_id);
            const allMsgs = [...convoMsgs, newMsg];
            analyzeSentiment(newMsg.conversation_id, allMsgs);
            return prev;
          });
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
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations" }, (payload) => {
        const newConvo = payload.new as { id: string; assigned_to: string | null };
        // Auto-distribute if config is active and conversation is unassigned
        if (newConvo && !newConvo.assigned_to && distConfig?.is_active) {
          distributeConversation(newConvo.id, distConfig).catch(console.error);
        }
        loadConversations();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, () => {
        loadConversations();
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "conversations" }, () => {
        loadConversations();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(convosChannel);
    };
  }, [selected, loadConversations, soundEnabled, distConfig]);

  const prevMessagesLengthRef = useRef(0);
  useEffect(() => {
    const isInitialLoad = prevMessagesLengthRef.current === 0 && messages.length > 0;
    messagesEndRef.current?.scrollIntoView(isInitialLoad ? { behavior: "instant" } : { behavior: "smooth" });
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length]);

  const handleSelectConvo = async (id: string) => {
    setSelected(id);
    prevMessagesLengthRef.current = 0;
    setMsgSearch(""); setShowMsgSearch(false);
    // Atualiza estado local imediatamente para o badge sumir
    setConversations((prev) => prev.map((c) => c.id === id ? { ...c, unread_count: 0 } : c));
    await loadMessages(id);
    await supabase.from("conversations").update({ unread_count: 0 }).eq("id", id);
    // Load disable_chatbot for selected contact
    const selectedConvo = conversations.find((c) => c.id === id);
    if (selectedConvo?.contact_id) {
      const { data } = await supabase
        .from("contacts")
        .select("disable_chatbot")
        .eq("id", selectedConvo.contact_id)
        .maybeSingle();
      setContactDisableChatbot(data?.disable_chatbot || false);
    }
  };


  // ── Pix helpers ──────────────────────────────────────────────────────────────────────
  const calculateCRC16Pix = (str: string): string => {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1;
      }
    }
    return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
  };

  const generatePixPayload = (params: {
    pixKey: string;
    merchantName: string;
    merchantCity: string;
    amount: number;
    description: string;
    txId: string;
  }): string => {
    const fmt = (id: string, value: string) => {
      const len = value.length.toString().padStart(2, "0");
      return id + len + value;
    };
    const gui = "BR.GOV.BCB.PIX";
    const merchantAccountInfo = fmt("00", gui) + fmt("01", params.pixKey);
    const payload =
      fmt("00", "01") +
      fmt("26", merchantAccountInfo) +
      fmt("52", "0000") +
      fmt("53", "986") +
      (params.amount > 0 ? fmt("54", params.amount.toFixed(2)) : "") +
      fmt("58", "BR") +
      fmt("59", params.merchantName.substring(0, 25)) +
      fmt("60", params.merchantCity.substring(0, 15)) +
      fmt("62", fmt("05", params.txId.substring(0, 25))) +
      "6304";
    return payload + calculateCRC16Pix(payload);
  };

  const handleOpenPixDialog = () => {
    const saved = localStorage.getItem("pix_config");
    if (saved) {
      try {
        const cfg = JSON.parse(saved);
        if (cfg.pixKey) setPixKey(cfg.pixKey);
        if (cfg.pixKeyType) setPixKeyType(cfg.pixKeyType);
        if (cfg.merchantName) setPixMerchantName(cfg.merchantName);
        if (cfg.merchantCity) setPixMerchantCity(cfg.merchantCity);
      } catch { /* ignore */ }
    }
    setPixAmount("");
    setPixDescription("");
    setPixPayload(null);
    setPixDialogOpen(true);
  };

  const handleGeneratePixPayload = () => {
    const amount = parseFloat(pixAmount.replace(",", "."));
    if (!pixKey.trim()) { toast.error("Informe a chave Pix"); return; }
    if (isNaN(amount) || amount < 0) { toast.error("Valor inválido"); return; }
    const txId = "MSXCRM" + Date.now().toString().slice(-10);
    const payload = generatePixPayload({
      pixKey: pixKey.trim(),
      merchantName: pixMerchantName || "Recebedor",
      merchantCity: pixMerchantCity || "CIDADE",
      amount,
      description: pixDescription.trim(),
      txId,
    });
    setPixPayload(payload);
  };

  const handleSendPixMessage = () => {
    if (!pixPayload || !selected) return;
    const amount = parseFloat(pixAmount.replace(",", "."));
    const pixKeyTypeLabel: Record<string, string> = {
      cpf: "CPF", cnpj: "CNPJ", email: "E-mail", telefone: "Telefone", aleatoria: "Aleatória",
    };
    const valStr = isNaN(amount) ? "0,00" : amount.toFixed(2).replace(".", ",");
    const msgLines = [
      "💸 *Cobrança Pix*",
      "Valor: R$ " + valStr,
      "Descrição: " + (pixDescription || "—"),
      "",
      "*Chave Pix:* " + pixKey,
      "*Tipo:* " + (pixKeyTypeLabel[pixKeyType] || pixKeyType),
      "",
      "Código Pix (copia e cola):",
      pixPayload,
    ];
    const text = msgLines.join("\n");
    setPixDialogOpen(false);
    setMessageInput(text);
    setTimeout(() => handleSendMessage(), 50);
  };
  // ───────────────────────────────────────────────────────────────────────────

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selected) return;
    const convo = conversations.find((c) => c.id === selected);
    if (!convo) return;

    const signaturePrefix = signing && profileName ? `${profileName}:\n` : "";
    const text = signaturePrefix + messageInput;

    // If offline, queue the message instead of sending
    if (!isOnline) {
      enqueue({ conversationId: selected, content: text, type: "text" });
      setMessageInput("");
      toast.info("Mensagem salva na fila");
      return;
    }

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

  const openHsmDialog = async () => {
    const { data } = await supabase
      .from("hsm_templates")
      .select("*")
      .eq("status", "approved")
      .order("name");
    setHsmTemplates(
      (data || []).map((t: any) => ({
        ...t,
        buttons: Array.isArray(t.buttons) ? t.buttons : [],
        variables: Array.isArray(t.variables) ? t.variables : [],
      }))
    );
    setHsmSelected(null);
    setHsmVarValues({});
    setHsmSearch("");
    setHsmDialogOpen(true);
  };

  // ── Catalog handlers ──────────────────────────────────────────────────────────

  const openCatalogDialog = async () => {
    setCatalogSearch("");
    setSelectedProducts(new Set());
    const { data } = await supabase
      .from("products")
      .select("id, name, description, price, image_url, active")
      .eq("active", true)
      .order("name");
    setCatalogProducts((data || []) as CatalogProduct[]);
    setCatalogOpen(true);
  };

  const toggleProductSelection = (id: string) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSendCatalog = async () => {
    if (!selected || selectedProducts.size === 0) return;
    const convo = conversations.find((c) => c.id === selected);
    if (!convo) return;

    setSendingCatalog(true);
    try {
      const sendInst = convo.instance_name || instanceName;
      const toSend = catalogProducts.filter((p) => selectedProducts.has(p.id));

      for (let i = 0; i < toSend.length; i++) {
        const p = toSend[i];
        const priceFormatted = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(p.price ?? 0);

        const lines: string[] = [];
        lines.push(`🛍️ *${p.name}*`);
        lines.push(`💰 ${priceFormatted}`);
        if (p.description) lines.push(`📝 ${p.description}`);
        if (p.image_url) lines.push(`\n${p.image_url}`);
        const body = lines.join("\n");

        await sendMessage(sendInst, convo.contacts.phone, body);
        await supabase.from("messages").insert({
          conversation_id: selected,
          from_me: true,
          body,
          status: "sent",
        });

        if (i < toSend.length - 1) {
          await new Promise((res) => setTimeout(res, 500));
        }
      }

      toast.success(
        `${toSend.length} produto${toSend.length !== 1 ? "s" : ""} enviado${toSend.length !== 1 ? "s" : ""}!`
      );
      setCatalogOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao enviar produtos";
      toast.error(msg);
    } finally {
      setSendingCatalog(false);
    }
  };

  const handleSendHSM = async () => {
    if (!hsmSelected || !selected) return;
    const convo = conversations.find((c) => c.id === selected);
    if (!convo) return;

    const body = hsmSelected.body.replace(/\{\{(\d+)\}\}/g, (_: string, n: string) => hsmVarValues[n] || `{{${n}}}`);

    setHsmSending(true);
    try {
      const sendInstanceName = convo.instance_name || instanceName;
      await Promise.all([
        sendMessage(sendInstanceName, convo.contacts.phone, body),
        supabase.from("messages").insert({
          conversation_id: selected,
          from_me: true,
          body,
          status: "sent",
        }),
      ]);
      await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", selected);
      toast.success("Template HSM enviado!");
      setHsmDialogOpen(false);
      setHsmSelected(null);
    } catch (err: any) {
      toast.error("Erro ao enviar template: " + (err?.message || "Tente novamente"));
    } finally {
      setHsmSending(false);
    }
  };

  const handleScheduleMessage = async (dateTime: string) => {
    const convoForSchedule = conversations.find((c) => c.id === selected);
    if (!convoForSchedule || !messageInput.trim()) return;
    const { error } = await supabase.from("schedules").insert({
      user_id: user?.id,
      contact_name: convoForSchedule.contacts.name || convoForSchedule.contacts.phone,
      contact_phone: convoForSchedule.contacts.phone,
      connection: convoForSchedule.instance_name,
      message: messageInput.trim(),
      send_at: new Date(dateTime).toISOString(),
      status: "pending",
      open_ticket: false,
      create_note: false,
      repeat_interval: "none",
      repeat_daily: "none",
      repeat_count: "unlimited",
    });
    if (error) {
      toast.error("Erro ao agendar mensagem");
      return;
    }
    toast.success("Mensagem agendada! Veja em Agendamentos.");
    setMessageInput("");
    setScheduleDialogOpen(false);
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
      const { error } = await supabase.from("conversations").update({ unread_count: 0, status: "in_progress" }).eq("id", id);
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
      const { error } = await supabase.from("conversations").update({ status: "closed", awaiting_csat: false } as any).eq("id", selected);
      if (error) { toast.error("Erro ao encerrar"); return; }

      // Auto CSAT survey
      if (localStorage.getItem("auto_csat_enabled") === "true" && convo) {
        const contactName = convo.contacts.name || convo.contacts.phone;
        const csatMessage = `Olá ${contactName}! 😊 Como você avalia o atendimento que recebeu hoje?\n\n1️⃣ - Péssimo\n2️⃣ - Ruim\n3️⃣ - Regular\n4️⃣ - Bom\n5️⃣ - Excelente\n\nResponda com o número correspondente.`;
        const sendInstanceName = convo.instance_name || instanceName;
        try {
          await Promise.all([
            sendMessage(sendInstanceName, convo.contacts.phone, csatMessage),
            supabase.from("messages").insert({
              conversation_id: selected,
              from_me: true,
              body: csatMessage,
              status: "sent",
            }),
            supabase.from("conversations").update({ awaiting_csat: true } as any).eq("id", selected),
          ]);
        } catch {
          // Non-blocking: CSAT send failure should not break the close flow
        }
      }

      toast.success("Conversa encerrada!");
      setShowCloseDialog(false);
      loadConversations();
    } catch { toast.error("Erro inesperado"); }
  };

  // Handle chatbot toggle for contact
  const handleToggleChatbot = async () => {
    const currentConvo = conversations.find((c) => c.id === selected);
    if (!currentConvo?.contact_id) return;
    const newValue = !contactDisableChatbot;
    await supabase.from("contacts").update({ disable_chatbot: newValue }).eq("id", currentConvo.contact_id);
    setContactDisableChatbot(newValue);
    toast.success(newValue ? "Bot pausado para este contato" : "Bot reativado para este contato");
  };

  // Handle audio toggle
  const toggleAudio = (next?: boolean) => {
    const value = typeof next === "boolean" ? next : !audioAllowed;
    setAudioAllowed(value);
    localStorage.setItem("inbox_audio_allowed", String(value));
    toast.success(value ? "Notificações de áudio ativadas" : "Notificações de áudio desativadas");
  };

  // Handle transfer
  const handleTransfer = async (type: "user" | "department", targetId: string, targetName: string, transferNote: string) => {
    if (!selected) return;
    try {
      const update = type === "user"
        ? { assigned_to: targetId } as any
        : { category_id: targetId } as any;
      const { error } = await supabase.from("conversations").update(update).eq("id", selected);
      if (error) { toast.error("Erro ao transferir conversa"); return; }

      // Insert into conversation_transfers for history
      if (type === "user" && user) {
        await (supabase.from("conversation_transfers" as any) as any).insert({
          conversation_id: selected,
          from_agent_id: user.id,
          from_agent_name: profileName || user.email || "Agente",
          to_agent_id: targetId,
          to_agent_name: targetName,
          note: transferNote || null,
        });
      }

      // Insert transfer note as internal note (if provided or always as log)
      const noteContent = `[Transferência] ${transferNote || `Conversa transferida para ${targetName}`}`;
      const authorName = profileName || user?.email || "Agente";
      await supabase.from("conversation_notes").insert({
        conversation_id: selected,
        user_id: user?.id,
        content: noteContent,
        author_name: authorName,
        is_internal: true,
      } as any);

      // Insert notification for receiving agent (only when transferring to a user)
      if (type === "user") {
        const convo = conversations.find((c) => c.id === selected);
        const contactName = convo?.contacts?.name || convo?.contacts?.phone || "";
        await supabase.from("notifications").insert({
          user_id: targetId,
          title: "Conversa transferida para você",
          body: contactName + (transferNote ? ": " + transferNote : ""),
          type: "transfer",
          reference_id: selected,
        } as any);
      }

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

  // Bulk actions
  const handleBulkClose = async () => {
    const ids = Array.from(selectedConvos);
    await supabase.from("conversations").update({ status: "closed", updated_at: new Date().toISOString() }).in("id", ids);
    setSelectedConvos(new Set());
    toast.success(`${ids.length} conversa(s) encerrada(s)`);
    loadConversations();
  };

  const handleBulkMarkRead = async () => {
    const ids = Array.from(selectedConvos);
    await supabase.from("conversations").update({ unread_count: 0, updated_at: new Date().toISOString() }).in("id", ids);
    setSelectedConvos(new Set());
    toast.success(`${ids.length} conversa(s) marcada(s) como lida(s)`);
    loadConversations();
  };

  // Load merge candidates
  const loadMergeCandidates = useCallback(async () => {
    if (!selected) return;
    const currentConvo = conversations.find((c) => c.id === selected);
    if (!currentConvo) return;
    const { data } = await supabase
      .from("conversations")
      .select("*, contacts(name, phone)")
      .eq("contact_id", currentConvo.contact_id)
      .neq("id", currentConvo.id)
      .eq("is_merged", false)
      .order("created_at", { ascending: false });
    setMergeTargetConvos((data as unknown as DBConversation[]) || []);
  }, [selected, conversations]);

  // Merge conversations
  const handleMergeConversations = async (targetConversationId: string) => {
    if (!selected) return;
    setMerging(true);
    try {
      // 1. Move messages
      await supabase.from("messages")
        .update({ conversation_id: targetConversationId })
        .eq("conversation_id", selected);

      // 2. Move notes
      await supabase.from("conversation_notes" as any)
        .update({ conversation_id: targetConversationId })
        .eq("conversation_id", selected);

      // 3. Mark current as merged
      await supabase.from("conversations")
        .update({ is_merged: true, merged_into: targetConversationId, status: "closed" } as any)
        .eq("id", selected);

      // 4. Insert system message in target
      await supabase.from("messages").insert({
        conversation_id: targetConversationId,
        content: "[Sistema] Conversa mesclada: histórico importado de uma conversa anterior.",
        body: "[Sistema] Conversa mesclada: histórico importado de uma conversa anterior.",
        direction: "outbound",
        from_me: true,
        type: "text",
        status: "sent",
        created_at: new Date().toISOString(),
      });

      // 5. Navigate to target
      toast.success("Conversas mescladas com sucesso!");
      setMergeDialogOpen(false);
      await loadConversations();
      handleSelectConvo(targetConversationId);
    } catch (err: any) {
      toast.error("Erro ao mesclar: " + (err?.message || "Tente novamente"));
    } finally {
      setMerging(false);
    }
  };

  // Load flow templates
  const loadFlowTemplates = useCallback(async () => {
    setFlowTemplatesLoading(true);
    const { data } = await (supabase.from("attendance_flow_templates" as any) as any)
      .select("*")
      .order("name");
    if (data) {
      setFlowTemplates(
        (data as any[]).map((t) => ({
          ...t,
          steps: Array.isArray(t.steps) ? (t.steps as FlowTemplateStep[]) : [],
        }))
      );
    }
    setFlowTemplatesLoading(false);
  }, []);

  // Apply a flow template to the current conversation
  const handleApplyFlowTemplate = async (template: FlowTemplate) => {
    if (!selected) return;
    const convo = conversations.find((c) => c.id === selected);
    if (!convo) return;
    setApplyingTemplate(template.id);
    try {
      const sortedSteps = template.steps.slice().sort((a, b) => a.order - b.order);
      let completedSteps = 0;
      let skippedWaits = 0;

      for (const step of sortedSteps) {
        if (step.type === "wait") {
          skippedWaits++;
          continue;
        }
        if (step.type === "send_message" && step.config.message) {
          const sendInstanceName = convo.instance_name || instanceName;
          const { sendMessage: sendMsg } = await import("@/lib/evolution-api");
          await sendMsg(sendInstanceName, convo.contacts.phone, step.config.message);
          await supabase.from("messages").insert({
            conversation_id: selected,
            from_me: true,
            body: step.config.message,
            status: "sent",
          });
          await supabase.from("conversations").update({ last_message_at: new Date().toISOString() }).eq("id", selected);
        } else if (step.type === "send_note" && step.config.note) {
          await supabase.from("conversation_notes").insert({
            conversation_id: selected,
            user_id: user?.id,
            content: step.config.note,
            author_name: profileName || user?.email || "Agente",
            is_internal: true,
          } as any);
        } else if (step.type === "close_conversation") {
          await supabase.from("conversations").update({ status: "closed" }).eq("id", selected);
          setConversations((prev) => prev.map((c) => c.id === selected ? { ...c, status: "closed" } : c));
        } else if (step.type === "assign_agent" && step.config.agent_id) {
          await supabase.from("conversations").update({ assigned_to: step.config.agent_id } as any).eq("id", selected);
          setConversations((prev) => prev.map((c) => c.id === selected ? { ...c, assigned_to: step.config.agent_id! } : c));
        } else if (step.type === "add_label" && step.config.label_id) {
          const currentConvo = conversations.find((c) => c.id === selected);
          if (currentConvo) {
            const current = currentConvo.label_ids || [];
            if (!current.includes(step.config.label_id)) {
              const next = [...current, step.config.label_id];
              await (supabase.from("conversations") as any).update({ label_ids: next }).eq("id", selected);
              setConversations((prev) => prev.map((c) => c.id === selected ? { ...c, label_ids: next } : c));
            }
          }
        } else if (step.type === "add_tag" && step.config.tag) {
          // Tag is applied by name; look up existing tag
          const existingTag = tags.find((t) => t.name.toLowerCase() === step.config.tag!.toLowerCase());
          if (existingTag && convo.contact_id) {
            await supabase.from("contact_tags").upsert({ contact_id: convo.contact_id, tag_id: existingTag.id });
            refreshContactTags();
          }
        } else if (step.type === "remove_tag" && step.config.tag) {
          const existingTag = tags.find((t) => t.name.toLowerCase() === step.config.tag!.toLowerCase());
          if (existingTag && convo.contact_id) {
            await supabase.from("contact_tags").delete()
              .eq("contact_id", convo.contact_id)
              .eq("tag_id", existingTag.id);
            refreshContactTags();
          }
        }
        completedSteps++;
      }

      // Increment usage_count
      await (supabase.from("attendance_flow_templates" as any) as any)
        .update({ usage_count: (template.usage_count || 0) + 1 })
        .eq("id", template.id);

      const msg = skippedWaits > 0
        ? `Template aplicado! ${completedSteps} passo(s) executado(s). ${skippedWaits} passo(s) de espera ignorado(s).`
        : `Template aplicado! ${completedSteps} passo(s) executado(s).`;
      toast.success(msg);
      setFlowTemplateDialogOpen(false);
      await loadMessages(selected);
    } catch (err: any) {
      toast.error("Erro ao aplicar template: " + (err?.message || "Tente novamente"));
    } finally {
      setApplyingTemplate(null);
    }
  };

  // Load transfer history for active conversation
  const loadTransferHistory = useCallback(async (conversationId: string) => {
    setLoadingHistory(true);
    try {
      const { data } = await (supabase.from("conversation_transfers" as any) as any)
        .select("*")
        .eq("conversation_id", conversationId)
        .order("transferred_at", { ascending: true });
      if (data) setTransferHistory(data as ConversationTransfer[]);
    } catch {
      setTransferHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // Handle label assignment toggle
  const handleToggleLabel = async (labelId: string) => {
    if (!selectedConvo) return;
    const current = selectedConvo.label_ids || [];
    const next = current.includes(labelId)
      ? current.filter(id => id !== labelId)
      : [...current, labelId];
    await (supabase.from("conversations") as any).update({ label_ids: next }).eq("id", selectedConvo.id);
    setConversations(prev => prev.map(c => c.id === selectedConvo.id ? { ...c, label_ids: next } : c));
  };

  const handleBlockNumber = async () => {
    if (!blockPhone.trim()) { toast.error("Informe o número de telefone"); return; }
    if (!blockReason.trim()) { toast.error("Motivo é obrigatório"); return; }
    setBlocking(true);
    let expiresAt: string | null = null;
    if (blockExpiration !== "nunca") {
      if (blockExpiration === "custom") {
        expiresAt = blockCustomDate ? new Date(blockCustomDate).toISOString() : null;
      } else {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(blockExpiration));
        expiresAt = d.toISOString();
      }
    }
    const profileNameVal = user?.user_metadata?.full_name || user?.email || null;
    const { error } = await (supabase.from("blacklist" as any) as any).upsert({
      phone: blockPhone.trim(),
      reason: blockReason.trim(),
      blocked_by: user?.id || null,
      blocked_by_name: profileNameVal,
      expires_at: expiresAt,
      is_active: true,
    }, { onConflict: "phone" });
    setBlocking(false);
    if (error) {
      toast.error("Erro ao bloquear: " + error.message);
    } else {
      toast.success("Número bloqueado!");
      setBlockDialogOpen(false);
      setBlockPhone("");
      setBlockReason("");
      setBlockExpiration("nunca");
      setBlockCustomDate("");
      loadBlacklist();
    }
  };

  // AI Suggested Replies handler
  const fetchAiSuggestions = async () => {
    if (!selected || loadingSuggestions) return;
    setLoadingSuggestions(true);
    setAiSuggestions([]);
    try {
      const last10 = messages.slice(-10);
      const contextMessages = last10.map((m) => ({
        role: m.from_me ? "assistant" : "user",
        content: m.body,
      }));
      contextMessages.push({
        role: "user",
        content:
          "Sugira 3 respostas curtas e profissionais em português para esta conversa. Retorne apenas as 3 sugestões numeradas, uma por linha.",
      });

      const { data, error } = await supabase.functions.invoke("ai-agent", {
        body: { messages: contextMessages },
      });

      if (error || !data?.reply) {
        toast.error("Erro ao buscar sugestões de IA");
        return;
      }

      const lines = (data.reply as string)
        .split("\n")
        .map((l: string) => l.replace(/^\d+[\.\)]\s*/, "").trim())
        .filter((l: string) => l.length > 0)
        .slice(0, 3);

      setAiSuggestions(lines);
    } catch (err: any) {
      toast.error("Erro ao sugerir respostas: " + (err?.message || "Tente novamente"));
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // AI Conversation Summary handler
  async function handleSummarizeConversation() {
    if (!selected || messages.length === 0) return;
    setSummaryLoading(true);
    setSummaryOpen(true);
    setSummary('');

    const context = messages.slice(-20).map(m =>
      `${!m.from_me ? 'Cliente' : 'Agente'}: ${m.body}`
    ).join('\n');

    const prompt = `Resuma esta conversa de atendimento em 3-5 frases em português. Inclua: qual é o assunto principal, o que o cliente precisa, e qual foi o desfecho ou status atual.\n\nConversa:\n${context}`;

    try {
      const { data } = await supabase.functions.invoke('ai-agent', {
        body: { messages: [{ role: 'user', content: prompt }], model: 'claude-haiku-4-5-20251001' }
      });
      setSummary(data?.response || data?.content || data?.message || data?.reply || '');
    } catch {
      setSummary('Não foi possível gerar o resumo.');
    } finally {
      setSummaryLoading(false);
    }
  }

  // Sentiment analysis (keyword-based, no API call)
  async function analyzeSentiment(conversationId: string, lastMessages: DBMessage[]) {
    const recentInbound = lastMessages.filter(m => !m.from_me).slice(-5);
    if (recentInbound.length === 0) return;

    const text = recentInbound.map(m => m.body).join(' ');
    const urgentWords = ['urgente', 'socorro', 'problema', 'erro', 'cancelar', 'reembolso', 'nunca', 'péssimo'];
    const negativeWords = ['ruim', 'mal', 'não funciona', 'insatisfeito', 'decepcionado', 'raiva', 'absurdo'];
    const positiveWords = ['ótimo', 'excelente', 'perfeito', 'obrigado', 'maravilhoso', 'satisfeito', 'adorei'];

    const lower = text.toLowerCase();
    let sentiment: 'positive' | 'neutral' | 'negative' | 'urgent' = 'neutral';

    if (urgentWords.some(w => lower.includes(w))) sentiment = 'urgent';
    else if (negativeWords.some(w => lower.includes(w))) sentiment = 'negative';
    else if (positiveWords.some(w => lower.includes(w))) sentiment = 'positive';

    await supabase.from('conversations').update({ sentiment } as any).eq('id', conversationId);
    setConversations(prev => prev.map(c => c.id === conversationId ? { ...c, sentiment } : c));
  }

  // Slash autocomplete helpers
  const slashResults = useMemo(() => {
    if (slashQuery === null) return [];
    const q = slashQuery.toLowerCase();
    const filtered = q === ""
      ? quickRepliesForSlash
      : quickRepliesForSlash.filter(
          (r) => r.shortcut.toLowerCase().includes(q) || r.message.toLowerCase().includes(q)
        );
    return filtered.slice(0, 8);
  }, [slashQuery, quickRepliesForSlash]);

  const handleSlashSelect = (reply: { shortcut: string; message: string }) => {
    const lastSlashIdx = messageInput.lastIndexOf("/");
    const contactName = selectedConvo?.contacts?.name ?? null;
    const contactPhone = selectedConvo?.contacts?.phone ?? "";
    const substituted = substituteQuickReplyVars(reply.message, contactName, contactPhone);
    const newText = messageInput.slice(0, lastSlashIdx) + substituted;
    setMessageInput(newText);
    setSlashQuery(null);
  };

  // Filter conversations
  const unreadCount = conversations.filter((c) => c.unread_count > 0).length;

  const statusCounts = useMemo(() => ({
    aguardando: conversations.filter(c => c.status === "open").length,
    atendendo: conversations.filter(c => c.status === "in_progress").length,
    encerradas: conversations.filter(c => c.status === "closed").length,
    favoritas: conversations.filter(c => c.starred).length,
  }), [conversations]);

  const filtered = conversations
    .filter((c) => {
      if (activeTab === "atendendo") return c.status === "in_progress";
      if (activeTab === "aguardando") return c.status === "open";
      if (activeTab === "encerradas") return c.status === "closed";
      if (activeTab === "favoritas") return c.starred === true;
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
      if (filterLabel) {
        if (!c.label_ids || !c.label_ids.includes(filterLabel)) return false;
      }
      return true;
    })
    .filter((c) =>
      (c.contacts?.name || c.contacts?.phone || "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      // Favoritos sempre no topo
      const aFav = a.starred ? 1 : 0;
      const bFav = b.starred ? 1 : 0;
      if (bFav !== aFav) return bFav - aFav;

      if (sortOrder === "unread") return (b.unread_count || 0) - (a.unread_count || 0);
      if (sortOrder === "oldest") return new Date(a.last_message_at || 0).getTime() - new Date(b.last_message_at || 0).getTime();
      return new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime();
    });

  const slaFiltered = slaFilterOnly
    ? filtered.filter((c) => {
        const sla = getSLAStatus(c.last_message_at, c.unread_count);
        return sla !== null && sla.pulse;
      })
    : filtered;

  const focusFiltered0 = focusMode && user
    ? slaFiltered.filter((c) => c.assigned_to === user.id)
    : slaFiltered;

  // Blacklist filter: hide blocked convos by default
  const focusFiltered = showBlockedConvos
    ? focusFiltered0
    : focusFiltered0.filter(c => !blacklistedPhones.has(c.contacts?.phone || ""));

  const blockedInView = focusFiltered0.filter(c => blacklistedPhones.has(c.contacts?.phone || "")).length;

  const paginatedConvos = focusFiltered.slice(0, convoPage * CONVO_PAGE_SIZE);
  const hasMoreConvos = focusFiltered.length > convoPage * CONVO_PAGE_SIZE;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setConvoPage(1); }, [activeTab, filterDepartment, filterConnection, filterAgent, filterTag, filterLabel, search]);

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

  const displayMessages = useMemo(() => {
    if (!msgSearch.trim()) return messages;
    return messages.filter(m => m.body?.toLowerCase().includes(msgSearch.toLowerCase()));
  }, [messages, msgSearch]);

  const highlightText = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase()
        ? <mark key={i} className="bg-yellow-300 text-yellow-900 rounded-sm px-0.5">{part}</mark>
        : part
    );
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

  // SLA helper
  function getSLAStatus(lastMessageAt: string | null, unreadCount: number): { label: string; color: string; pulse: boolean } | null {
    if (!lastMessageAt || unreadCount === 0) return null;
    const minutes = Math.floor((Date.now() - new Date(lastMessageAt).getTime()) / 60000);
    if (minutes < 30) return { label: minutes < 1 ? '<1min' : `${minutes}min`, color: 'bg-green-500', pulse: false };
    if (minutes < 60) return { label: `${minutes}min`, color: 'bg-yellow-500', pulse: false };
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return { label: m > 0 ? `${h}h${m}m` : `${h}h`, color: 'bg-red-500', pulse: true };
  }

  // File Manager helpers
  const getMediaTypeFromName = (name: string): string => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
    if (['mp4', 'mov', 'avi'].includes(ext)) return 'video';
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx'].includes(ext)) return 'document';
    return 'document';
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const loadFileManagerFiles = async () => {
    if (!user) return;
    setFileManagerLoading(true);
    const { data, error } = await supabase.storage.from('file-manager').list(user.id + '/', { limit: 100 });
    if (!error && data) {
      setFileManagerFiles(data.filter(f => f.name && f.name !== '.emptyFolderPlaceholder'));
    }
    setFileManagerLoading(false);
  };

  const handleFileManagerOpen = async () => {
    setFileManagerOpen(true);
    setFileManagerSearch('');
    await loadFileManagerFiles();
  };

  const handleFileManagerSelect = (file: { name: string; metadata: { size?: number } | null }) => {
    if (!user) return;
    const publicUrl = supabase.storage.from('file-manager').getPublicUrl(user.id + '/' + file.name).data.publicUrl;
    const type = getMediaTypeFromName(file.name);
    setFileManagerSelected({ url: publicUrl, name: file.name, type });
    setFileManagerOpen(false);
  };

  const handleFileManagerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = '';
    const path = user.id + '/' + file.name;
    const { error } = await supabase.storage.from('file-manager').upload(path, file, { upsert: true });
    if (error) { toast.error('Erro ao fazer upload: ' + error.message); return; }
    toast.success('Arquivo enviado!');
    await loadFileManagerFiles();
  };

  const handleSendFileManagerFile = async () => {
    if (!fileManagerSelected || !selected) return;
    const convo = conversations.find((c) => c.id === selected);
    if (!convo) return;

    const { url, name, type } = fileManagerSelected;
    setFileManagerSelected(null);

    const optimisticMsg: DBMessage = {
      id: `temp-media-${Date.now()}`,
      conversation_id: selected,
      from_me: true,
      body: name,
      media_url: url,
      media_type: type,
      status: 'sending',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const sendInstanceName = convo.instance_name || instanceName;
      const [, dbResult] = await Promise.all([
        sendMessage(sendInstanceName, convo.contacts.phone, url),
        supabase.from('messages').insert({
          conversation_id: selected,
          from_me: true,
          body: name,
          media_url: url,
          media_type: type,
          status: 'sent',
        }).select().single(),
      ]);
      if (dbResult.data) {
        setMessages((prev) => prev.map((m) => m.id === optimisticMsg.id ? (dbResult.data as DBMessage) : m));
      }
      await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', selected);
    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));
      toast.error('Erro ao enviar arquivo: ' + (err?.message || 'Tente novamente'));
    }
  };

  return (
    <div className="flex h-full">
      {/* Conversations panel */}
      <div className="w-[380px] border-r border-border flex flex-col bg-card">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h1 className="text-lg font-bold text-foreground">Conversas</h1>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setGlobalSearchOpen(true)} title="Busca global (Ctrl+K)">
              <Search className="h-4 w-4" />
            </Button>
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
            <Button
              size="icon"
              variant="ghost"
              className={cn("h-8 w-8", focusMode ? "text-blue-500 bg-blue-500/10" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setFocusMode((v) => { localStorage.setItem("inbox_focus_mode", String(!v)); return !v; })}
              title="Modo Foco"
            >
              <Target className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={cn("h-8 w-8", compactMode ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground")}
              onClick={() => setCompactMode((v) => { localStorage.setItem("inbox_compact_mode", String(!v)); return !v; })}
              title={compactMode ? "Modo normal" : "Modo compacto"}
            >
              {compactMode ? <List className="h-4 w-4" /> : <LayoutList className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setShowShortcutsModal(true)} title="Atalhos de teclado (Ctrl+/)">
              <span className="text-xs font-bold">?</span>
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
              <select value={filterLabel} onChange={(e) => setFilterLabel(e.target.value)} className="h-9 rounded-md border border-border bg-muted/50 px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">Etiqueta</option>
                {allLabels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
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
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={slaFilterOnly}
                onChange={(e) => setSlaFilterOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-red-500 cursor-pointer"
              />
              <span className={cn("font-medium", slaFilterOnly ? "text-red-500" : "text-muted-foreground")}>
                Mostrar apenas vencidos (SLA &gt; 1h)
              </span>
            </label>
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

        {/* Status counters bar */}
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border bg-muted/30">
          <button
            onClick={() => setActiveTab("aguardando")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold transition-colors",
              activeTab === "aguardando" ? "bg-yellow-500/20 text-yellow-500" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <span>Aguardando:</span>
            <span className="font-bold">{statusCounts.aguardando}</span>
          </button>
          <button
            onClick={() => setActiveTab("atendendo")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold transition-colors",
              activeTab === "atendendo" ? "bg-green-500/20 text-green-500" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <span>Atendendo:</span>
            <span className="font-bold">{statusCounts.atendendo}</span>
          </button>
          <button
            onClick={() => setActiveTab("encerradas")}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold transition-colors",
              activeTab === "encerradas" ? "bg-muted-foreground/20 text-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            <span>Encerradas:</span>
            <span className="font-bold">{statusCounts.encerradas}</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 px-4 py-0 border-b border-border overflow-x-auto scrollbar-none">
          {([
            { key: "atendendo" as TabFilter, label: "ATENDENDO", count: statusCounts.atendendo },
            { key: "aguardando" as TabFilter, label: "AGUARDANDO", count: statusCounts.aguardando },
            { key: "encerradas" as TabFilter, label: "ENCERRADAS", count: statusCounts.encerradas },
            { key: "favoritas" as TabFilter, label: "⭐ FAVORITAS", count: statusCounts.favoritas },
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

        {/* Focus Mode banner */}
        {focusMode && (
          <div className="px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-medium flex items-center gap-2">
            🎯 Modo Foco ativo — mostrando apenas suas conversas
          </div>
        )}

        {/* Blocked conversations banner */}
        {blockedInView > 0 && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium flex items-center justify-between gap-2">
            <span>🚫 {blockedInView} conversa(s) bloqueada(s) oculta(s)</span>
            <button
              className="underline hover:no-underline"
              onClick={() => setShowBlockedConvos(v => !v)}
            >
              {showBlockedConvos ? "Ocultar bloqueadas" : "Mostrar bloqueadas"}
            </button>
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Carregando...
            </div>
          ) : focusFiltered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <MessageCircle className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Nenhuma conversa encontrada</p>
            </div>
          ) : (
            paginatedConvos.map((convo) => {
              const convoTagIds = contactTagMap.get(convo.contact_id) || [];
              const matchingTags = convoTagIds.map(id => tags.find(t => t.id === id)).filter(Boolean) as typeof tags;
              const sla = getSLAStatus(convo.last_message_at, convo.unread_count);

              if (compactMode) {
                // ── Compact mode item ──────────────────────────────────────
                return (
                  <div
                    key={convo.id}
                    onClick={() => { if (activeTab === "aguardando") return; handleSelectConvo(convo.id); }}
                    className={cn(
                      "relative flex w-full items-center gap-2 px-3 py-2 text-left transition-all duration-200 border-b border-border/30 cursor-pointer active:scale-[0.98] active:opacity-80",
                      selected === convo.id
                        ? "bg-accent conversation-selected"
                        : "hover:bg-muted/50"
                    )}
                  >
                    {/* Avatar */}
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                      {convo.contacts?.avatar_url && !avatarErrorContacts.has(convo.contact_id) ? (
                        <img
                          src={convo.contacts.avatar_url}
                          alt={convo.contacts?.name || convo.contacts?.phone || "Avatar"}
                          className="h-7 w-7 rounded-full object-cover"
                          onError={() => handleAvatarError(convo.contact_id)}
                        />
                      ) : (
                        getInitials(convo.contacts?.name, convo.contacts?.phone)
                      )}
                    </div>

                    {/* Name */}
                    <span className="font-medium text-sm truncate flex-1 text-foreground">
                      {blacklistedPhones.has(convo.contacts?.phone || "") && (
                        <span className="mr-0.5" title="Número bloqueado">🚫</span>
                      )}
                      {convo.contacts?.name || convo.contacts?.phone}
                    </span>

                    {/* Trailing info */}
                    <div className="flex items-center gap-1 shrink-0">
                      {followupConvoIds.has(convo.id) && (
                        <span title="Follow-up pendente" className="text-[11px] leading-none select-none">🔔</span>
                      )}
                      {convo.sentiment === 'urgent' && (
                        <span title="Urgente" className="text-[13px] leading-none animate-pulse">🚨</span>
                      )}
                      {sla && sla.pulse && (
                        <span className={cn("text-[9px] font-bold text-white px-1 py-0.5 rounded-full", sla.color, "animate-pulse")}>
                          {sla.label}
                        </span>
                      )}
                      {convo.unread_count > 0 && (
                        <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-green-600 px-1 text-[9px] font-bold text-white">
                          {convo.unread_count > 99 ? "99+" : convo.unread_count}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {formatClockTime(convo.last_message_at)}
                      </span>
                    </div>

                    {/* Accept/Close buttons for waiting tab */}
                    {activeTab === "aguardando" && convo.status === "open" && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAttend(convo.id); }}
                          className="px-2 py-0.5 rounded text-[10px] font-bold text-white bg-green-600 hover:bg-green-700 active:scale-95 transition-all duration-150 uppercase"
                        >
                          Aceitar
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelected(convo.id); setShowCloseDialog(true); }}
                          className="px-2 py-0.5 rounded text-[10px] font-bold text-white bg-red-600 hover:bg-red-700 active:scale-95 transition-all duration-150 uppercase"
                        >
                          Fechar
                        </button>
                      </div>
                    )}
                  </div>
                );
              }

              // ── Normal mode item ────────────────────────────────────────
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
                  <div
                    className="shrink-0 flex items-center self-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={selectedConvos.has(convo.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSelectedConvos((prev) => {
                          const next = new Set(prev);
                          if (next.has(convo.id)) next.delete(convo.id);
                          else next.add(convo.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                    />
                  </div>
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
                      onClick={(e) => { e.stopPropagation(); toggleStarred(convo.id, convo.starred); }}
                      className="inline-flex items-center text-muted-foreground hover:text-yellow-500 transition-colors"
                      title={convo.starred ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                    >
                      <Star className={cn("h-3.5 w-3.5", convo.starred ? "fill-yellow-500 text-yellow-500" : "")} />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium text-foreground truncate">
                        {blacklistedPhones.has(convo.contacts?.phone || "") && (
                          <span className="mr-1" title="Número bloqueado">🚫</span>
                        )}
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
                    {/* Conversation label dots */}
                    {(() => {
                      const convoLabels = (convo.label_ids || [])
                        .map(id => allLabels.find(l => l.id === id))
                        .filter(Boolean) as ConversationLabel[];
                      if (convoLabels.length === 0) return null;
                      const shown = convoLabels.slice(0, 2);
                      const extra = convoLabels.length - shown.length;
                      return (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {shown.map(label => (
                            <span
                              key={label.id}
                              title={label.name}
                              className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white"
                              style={{ backgroundColor: label.color }}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-white/70 shrink-0" />
                              {label.name}
                            </span>
                          ))}
                          {extra > 0 && (
                            <span className="text-[9px] text-muted-foreground font-semibold">+{extra}</span>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0 ml-2 items-end self-start">
                    <span className="text-[11px] text-muted-foreground">
                      {formatClockTime(convo.last_message_at)}
                    </span>
                    <div className="h-5 flex items-center justify-center gap-1">
                      {followupConvoIds.has(convo.id) && (
                        <span title="Follow-up pendente" className="text-[12px] leading-none select-none">🔔</span>
                      )}
                      {convo.unread_count > 0 && (
                        <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-600 px-1.5 text-[10px] font-bold text-white">
                          {convo.unread_count > 99 ? "99+" : convo.unread_count}
                        </span>
                      )}
                      {convo.sentiment && (
                        <span
                          title={`Sentimento: ${{ positive: 'Positivo', neutral: 'Neutro', negative: 'Negativo', urgent: 'Urgente' }[convo.sentiment]}`}
                          className={cn("text-[14px] leading-none", convo.sentiment === 'urgent' && "animate-pulse")}
                        >
                          {{ positive: '😊', neutral: '😐', negative: '😟', urgent: '🚨' }[convo.sentiment]}
                        </span>
                      )}
                    </div>
                    {(() => {
                      if (!sla) return null;
                      return (
                        <span className={cn("text-[10px] font-bold text-white px-1.5 py-0.5 rounded-full shrink-0", sla.color, sla.pulse && "animate-pulse")}>
                          {sla.label}
                        </span>
                      );
                    })()}
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
          {hasMoreConvos && (
            <button
              onClick={() => setConvoPage(p => p + 1)}
              className="w-full py-3 text-xs text-primary font-medium hover:bg-muted/50 transition-colors border-t border-border"
            >
              Carregar mais ({focusFiltered.length - paginatedConvos.length} restantes)
            </button>
          )}
        </div>

        {/* Bulk action bar */}
        {selectedConvos.size > 0 && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-primary text-primary-foreground text-xs font-medium border-t border-primary/50">
            <span>{selectedConvos.size} selecionada(s)</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleBulkMarkRead}
                className="px-2 py-1 rounded bg-primary-foreground/20 hover:bg-primary-foreground/30 transition-colors whitespace-nowrap"
              >
                Marcar como lido
              </button>
              <button
                onClick={handleBulkClose}
                className="px-2 py-1 rounded bg-primary-foreground/20 hover:bg-primary-foreground/30 transition-colors"
              >
                Fechar
              </button>
              <button
                onClick={() => setSelectedConvos(new Set())}
                className="px-2 py-1 rounded bg-primary-foreground/20 hover:bg-primary-foreground/30 transition-colors"
              >
                Desmarcar
              </button>
            </div>
          </div>
        )}
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
                  {/* Selected labels pills */}
                  {(selectedConvo.label_ids || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-0.5">
                      {(selectedConvo.label_ids || [])
                        .map(id => allLabels.find(l => l.id === id))
                        .filter(Boolean)
                        .map(label => (
                          <span
                            key={label!.id}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                            style={{ backgroundColor: label!.color }}
                          >
                            {label!.name}
                          </span>
                        ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-[hsl(142,70%,45%)]" />
                      Meu número
                    </p>
                    {selectedConvo.sentiment && (() => {
                      const sentimentConfig = {
                        positive: { emoji: '😊', label: 'Positivo', bg: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700', pulse: false },
                        neutral:  { emoji: '😐', label: 'Neutro',   bg: 'bg-gray-100 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600', pulse: false },
                        negative: { emoji: '😟', label: 'Negativo', bg: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700', pulse: false },
                        urgent:   { emoji: '🚨', label: 'Urgente',  bg: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-300 dark:border-orange-700', pulse: true },
                      };
                      const cfg = sentimentConfig[selectedConvo.sentiment];
                      return (
                        <div className="relative">
                          <button
                            title="Sentimento detectado automaticamente. Clique para alterar."
                            onClick={() => setSentimentDropdownOpen(v => !v)}
                            className={cn(
                              "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer select-none transition-all hover:opacity-80",
                              cfg.bg,
                              cfg.pulse && "animate-pulse"
                            )}
                          >
                            <span>{cfg.emoji}</span>
                            <span>{cfg.label}</span>
                          </button>
                          {sentimentDropdownOpen && (
                            <div className="absolute top-full left-0 mt-1 z-50 bg-popover border border-border rounded-lg shadow-xl overflow-hidden min-w-[130px]">
                              {(['positive', 'neutral', 'negative', 'urgent'] as const).map(s => {
                                const c = sentimentConfig[s];
                                return (
                                  <button
                                    key={s}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent transition-colors"
                                    onClick={async () => {
                                      setSentimentDropdownOpen(false);
                                      await supabase.from('conversations').update({ sentiment: s } as any).eq('id', selectedConvo.id);
                                      setConversations(prev => prev.map(c => c.id === selectedConvo.id ? { ...c, sentiment: s } : c));
                                    }}
                                  >
                                    <span>{c.emoji}</span>
                                    <span>{c.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {selectedConvo.status !== "closed" ? (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      title={contactDisableChatbot ? "Bot pausado — clique para reativar" : "Bot ativo — clique para pausar"}
                      onClick={handleToggleChatbot}
                      className={cn("gap-1.5 text-xs", contactDisableChatbot ? "text-red-500" : "text-green-500")}
                    >
                      <Bot className={cn("h-4 w-4")} />
                      {contactDisableChatbot ? "Bot pausado" : "Bot ativo"}
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1.5 h-8 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowTransfer(true)}>
                      <Shuffle className="h-3.5 w-3.5" />
                      Transferir
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 h-8 rounded-full px-3 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                      onClick={() => {
                        const phone = selectedConvo?.contacts?.phone || "";
                        setBlockPhone(phone);
                        setBlockReason("");
                        setBlockExpiration("nunca");
                        setBlockCustomDate("");
                        setBlockDialogOpen(true);
                      }}
                    >
                      <Ban className="h-3.5 w-3.5" />
                      Bloquear
                    </Button>
                    <Popover open={labelPopoverOpen} onOpenChange={setLabelPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="gap-1.5 h-8 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground">
                          <Tag className="h-3.5 w-3.5" />
                          Etiquetar
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3" align="start">
                        <p className="text-xs font-semibold text-foreground mb-2">Etiquetas da conversa</p>
                        <div className="space-y-1">
                          {allLabels.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Nenhuma etiqueta cadastrada</p>
                          ) : allLabels.map(label => {
                            const active = (selectedConvo?.label_ids || []).includes(label.id);
                            return (
                              <label key={label.id} className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-muted/50 transition-colors">
                                <input
                                  type="checkbox"
                                  checked={active}
                                  onChange={() => handleToggleLabel(label.id)}
                                  className="h-3.5 w-3.5 rounded accent-primary cursor-pointer"
                                />
                                <span
                                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                                  style={{ backgroundColor: label.color }}
                                >
                                  {label.name}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button variant="ghost" size="sm" className="gap-1.5 h-8 rounded-full px-3 text-xs text-orange-500 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20" onClick={() => setShowFollowupDialog(true)}>
                      <Bell className="h-3.5 w-3.5" />
                      Follow-up
                    </Button>
                    <Button size="sm" className="gap-1.5 h-8 rounded-full px-4 text-xs font-medium bg-[hsl(142,70%,45%)] hover:bg-[hsl(142,70%,38%)] text-white" onClick={() => setShowCloseDialog(true)}>
                      <CheckCircle className="h-3.5 w-3.5" />
                      Encerrar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 h-8 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => { setMergeSearch(""); loadMergeCandidates(); setMergeDialogOpen(true); }}
                      title="Mesclar conversa"
                    >
                      <GitMerge className="h-3.5 w-3.5" />
                      Mesclar
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => { loadFlowTemplates(); setFlowTemplateDialogOpen(true); }}
                  title="Aplicar template de atendimento"
                >
                  <LayoutTemplate className="h-4 w-4" />
                </Button>
                <Popover open={historyPopoverOpen} onOpenChange={(open) => {
                  setHistoryPopoverOpen(open);
                  if (open && selectedConvo) loadTransferHistory(selectedConvo.id);
                }}>
                  <PopoverTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Histórico de transferências">
                      <History className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-3" align="end">
                    <p className="text-xs font-semibold text-foreground mb-3">Histórico de Atendimento</p>
                    {loadingHistory ? (
                      <p className="text-xs text-muted-foreground text-center py-4">Carregando...</p>
                    ) : (
                      <div className="space-y-3">
                        {/* First item: conversation started */}
                        {selectedConvo && (
                          <div className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="h-7 w-7 rounded-full bg-blue-500/20 text-blue-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                                <MessageCircle className="h-3.5 w-3.5" />
                              </div>
                              {transferHistory.length > 0 && <div className="w-0.5 flex-1 bg-border mt-1" />}
                            </div>
                            <div className="flex-1 min-w-0 pb-2">
                              <p className="text-xs font-semibold text-foreground">Conversa iniciada</p>
                              {selectedConvo.created_at && (
                                <p className="text-[10px] text-muted-foreground">
                                  {new Date(selectedConvo.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        {/* Transfer items */}
                        {transferHistory.map((t, idx) => {
                          const isLast = idx === transferHistory.length - 1;
                          const initials = (name: string | null) => (name || "?").split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
                          return (
                            <div key={t.id} className="flex gap-3">
                              <div className="flex flex-col items-center">
                                <div className="h-7 w-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {initials(t.to_agent_name)}
                                </div>
                                {!isLast && <div className="w-0.5 flex-1 bg-border mt-1" />}
                              </div>
                              <div className="flex-1 min-w-0 pb-2">
                                <p className="text-xs font-semibold text-foreground">
                                  Transferido de <span className="text-muted-foreground">{t.from_agent_name || "—"}</span>{" "}
                                  → <span className="text-primary">{t.to_agent_name || "—"}</span>
                                </p>
                                {t.note && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5 italic">{t.note}</p>
                                )}
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {new Date(t.transferred_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                        {/* Current agent */}
                        {selectedConvo?.assigned_to && agents.length > 0 && (() => {
                          const agent = agents.find(a => a.id === selectedConvo.assigned_to);
                          if (!agent) return null;
                          const name = agent.full_name || "Agente";
                          const initials = name.split(" ").map((n: string) => n[0]).join("").substring(0, 2).toUpperCase();
                          return (
                            <div className="flex gap-3">
                              <div className="flex flex-col items-center">
                                <div className="h-7 w-7 rounded-full bg-green-500/20 text-green-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                                  {initials}
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-green-600">Atendendo agora: {name}</p>
                              </div>
                            </div>
                          );
                        })()}
                        {transferHistory.length === 0 && !selectedConvo?.assigned_to && (
                          <p className="text-xs text-muted-foreground text-center py-2">Sem transferências registradas</p>
                        )}
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setShowFiles(true)} title="Arquivos">
                  <Folder className="h-4 w-4" />
                </Button>
                <div className="flex items-center" title={audioAllowed ? "Áudio bloqueado" : "Áudio permitido"}>
                  <Switch checked={audioAllowed} onCheckedChange={toggleAudio} className="scale-75" />
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => setShowDetails(!showDetails)}>
                  <User className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-purple-500" onClick={handleSummarizeConversation} title="Resumir conversa">
                  <FileText className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => { setShowMsgSearch(v => !v); if (showMsgSearch) setMsgSearch(""); }} title="Buscar mensagem">
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Message search bar */}
            {showMsgSearch && (
              <div className="px-4 py-2 border-b border-border bg-muted/30">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    className="w-full pl-8 pr-8 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                    placeholder="Buscar mensagens..."
                    value={msgSearch}
                    onChange={e => setMsgSearch(e.target.value)}
                  />
                  {msgSearch && (
                    <button className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setMsgSearch("")}>
                      ×
                    </button>
                  )}
                </div>
                {msgSearch && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {displayMessages.length} mensagem(s) encontrada(s)
                  </p>
                )}
              </div>
            )}

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
              {displayMessages.map((msg, i) => {
                const showDate = i > 0 && getDateLabel(msg.created_at) !== getDateLabel(displayMessages[i - 1].created_at);
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
                              {highlightText(msg.body.replace(/^⤳\s*_Mensagem encaminhada_\n\n?/, '').replace(/\*(.*?)\*/g, '$1'), msgSearch)}
                            </p>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap leading-[19px]">
                            {highlightText(msg.body.replace(/\*(.*?)\*/g, '$1'), msgSearch)}
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
                              ) : msg.status === "error" ? (
                                <AlertCircle className="h-3 w-3 text-red-400" />
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

                        {/* Message reactions from DB */}
                        {(messageReactions[msg.id] || []).length > 0 && (
                          <div className={`flex flex-wrap gap-1 ${msg.from_me ? "justify-end" : "justify-start"} mt-1`}>
                            {(messageReactions[msg.id] || []).map((r) => (
                              <button
                                key={r.emoji}
                                title={r.users.join(", ")}
                                onClick={() => { handleToggleReaction(msg.id, r.emoji); setReactionPickerMsgId(null); }}
                                className="inline-flex items-center gap-0.5 bg-card border border-border rounded-full px-1.5 py-0.5 text-xs hover:scale-110 transition-transform shadow-sm"
                              >
                                <span>{r.emoji}</span>
                                <span className="text-muted-foreground font-medium">{r.count}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Reaction picker button on hover */}
                        <button
                          className="absolute -bottom-3 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-card border border-border rounded-full w-6 h-6 flex items-center justify-center shadow-sm z-10 text-[14px] leading-none"
                          title="Reagir"
                          onClick={(e) => { e.stopPropagation(); setReactionPickerMsgId(prev => prev === msg.id ? null : msg.id); }}
                        >
                          😊
                        </button>
                        {/* Mini emoji picker popover */}
                        {reactionPickerMsgId === msg.id && (
                          <div
                            className={`absolute ${msg.from_me ? "right-0" : "left-0"} -bottom-10 z-50 bg-card border border-border rounded-full px-2 py-1 flex items-center gap-1 shadow-lg animate-in fade-in zoom-in-95 duration-150`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {["👍", "❤️", "😂", "😮", "😢", "👎"].map((emoji) => (
                              <button
                                key={emoji}
                                onClick={() => { handleToggleReaction(msg.id, emoji); setReactionPickerMsgId(null); }}
                                className="text-xl hover:scale-125 transition-transform p-0.5"
                              >
                                {emoji}
                              </button>
                            ))}
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

            {/* Typing indicator */}
            {typingUsers.length > 0 && (
              <div className="px-4 py-1 bg-transparent animate-in fade-in duration-200">
                <p className="text-xs text-muted-foreground italic">
                  {typingUsers.length === 1
                    ? `${typingUsers[0].user_name} está digitando...`
                    : typingUsers.length === 2
                    ? `${typingUsers[0].user_name} e ${typingUsers[1].user_name} estão digitando...`
                    : `${typingUsers[0].user_name} e mais ${typingUsers.length - 1} estão digitando...`}
                </p>
              </div>
            )}

            {/* Message input - WhatsApp style */}
            {!selectingForForward && <div className="border-t border-border px-3 py-2 bg-card">
              {/* File Manager selected preview */}
              {fileManagerSelected && (
                <div className="flex items-center gap-2 mb-2 bg-muted rounded-lg px-3 py-2 border-l-4 border-primary">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-primary">Arquivo do Gerenciador</p>
                    <p className="text-[12px] text-muted-foreground truncate">{fileManagerSelected.name}</p>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 px-2 text-[11px] bg-primary hover:bg-primary/80 text-primary-foreground"
                    onClick={handleSendFileManagerFile}
                  >
                    Enviar
                  </Button>
                  <button onClick={() => setFileManagerSelected(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {/* AI Suggestions chips */}
              {aiSuggestions.length > 0 && (
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex gap-2 flex-wrap flex-1">
                    {aiSuggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => { setMessageInput(s); setAiSuggestions([]); }}
                        className="bg-blue-50 border border-blue-200 text-blue-700 rounded-full px-3 py-1 text-sm cursor-pointer hover:bg-blue-100 transition-colors text-left"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setAiSuggestions([])}
                    className="shrink-0 text-muted-foreground hover:text-foreground mt-1"
                    title="Dispensar sugestões"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

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

              {/* Audio recording UI */}
              {isRecording ? (
                <div className="flex items-center gap-3 py-1">
                  <span className="inline-flex h-3 w-3 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <span className="text-sm font-mono text-red-500 shrink-0">
                    0:{String(recordingSeconds).padStart(2, "0")}
                  </span>
                  <span className="flex-1 text-xs text-muted-foreground">Gravando áudio...</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-muted-foreground hover:text-foreground"
                    onClick={cancelRecording}
                    title="Cancelar"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    className="h-10 w-10 rounded-full bg-red-500 hover:bg-red-600 text-white"
                    onClick={stopRecording}
                    title="Parar gravação"
                  >
                    <span className="h-3.5 w-3.5 rounded-sm bg-white" />
                  </Button>
                </div>
              ) : audioUrl ? (
                <div className="flex items-center gap-2 py-1">
                  <audio src={audioUrl} controls className="flex-1 h-9" />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-muted-foreground hover:text-foreground shrink-0"
                    onClick={cancelRecording}
                    title="Descartar áudio"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                  <Button
                    size="icon"
                    className="h-10 w-10 rounded-full bg-[#00a884] hover:bg-[#06cf9c] text-white shrink-0"
                    onClick={sendAudio}
                    title="Enviar áudio"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
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
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-transparent"
                      onClick={handleFileManagerOpen}
                      disabled={uploading}
                      title="Gerenciador de arquivos"
                    >
                      <Folder className="h-5 w-5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 h-9 w-9 text-muted-foreground hover:text-green-600 hover:bg-transparent"
                      onClick={handleOpenPixDialog}
                      disabled={uploading}
                      title="Gerar cobrança Pix"
                    >
                      <span className="text-base leading-none">💸</span>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="shrink-0 h-9 w-9 text-muted-foreground hover:text-orange-600 hover:bg-transparent"
                      onClick={openCatalogDialog}
                      disabled={uploading}
                      title="Enviar produto do catálogo"
                    >
                      <ShoppingBag className="h-5 w-5" />
                    </Button>
                  </div>
                  <div className="relative flex-1">
                    {slashQuery !== null && slashResults.length > 0 && (
                      <div className="absolute bottom-full left-0 right-0 mb-1 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden max-h-64 overflow-y-auto">
                        {slashResults.map((reply, idx) => (
                          <button
                            key={reply.shortcut}
                            className={cn(
                              "w-full text-left px-3 py-2 hover:bg-accent flex items-start gap-2",
                              idx === slashSelectedIndex && "bg-accent"
                            )}
                            onMouseDown={(e) => { e.preventDefault(); handleSlashSelect(reply); }}
                          >
                            <span className="text-primary font-semibold text-xs shrink-0 mt-0.5">/{reply.shortcut}</span>
                            <span className="text-xs text-muted-foreground truncate">{reply.message.slice(0, 60)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <Input
                      placeholder={uploading ? "Enviando arquivo..." : "Digite uma mensagem ou / para respostas rápidas"}
                      className="w-full bg-muted border-0 text-foreground placeholder:text-muted-foreground rounded-lg h-10 focus-visible:ring-0 focus-visible:ring-offset-0"
                      value={messageInput}
                      onChange={(e) => {
                        const newValue = e.target.value;
                        setMessageInput(newValue);
                        broadcastTyping();
                        const lastSlashIdx = newValue.lastIndexOf("/");
                        if (lastSlashIdx !== -1) {
                          const afterSlash = newValue.slice(lastSlashIdx + 1);
                          if (!afterSlash.includes(" ") || afterSlash.length === 0) {
                            setSlashQuery(afterSlash.toLowerCase());
                            setSlashSelectedIndex(0);
                          } else {
                            setSlashQuery(null);
                          }
                        } else {
                          setSlashQuery(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (slashQuery !== null && slashResults.length > 0) {
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setSlashSelectedIndex((i) => Math.min(i + 1, slashResults.length - 1));
                            return;
                          }
                          if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setSlashSelectedIndex((i) => Math.max(i - 1, 0));
                            return;
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleSlashSelect(slashResults[slashSelectedIndex]);
                            return;
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            setSlashQuery(null);
                            return;
                          }
                        }
                        if (e.key === "Enter" && !e.shiftKey) handleSendMessage();
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSendMessage(); }
                      }}
                      disabled={uploading}
                    />
                  </div>
                  <div className="flex items-center gap-0.5">
                    <SignatureButton
                      userName={profileName}
                      signing={signing}
                      onToggle={async () => { const next = !signing; setSigning(next); if (user) { const { error } = await supabase.from("profiles").update({ signing_enabled: next }).eq("id", user.id); if (error) setSigning(!next); } }}
                      disabled={uploading}
                    />
                    <QuickMessagesButton
                      onSelect={(text) => {
                        const contactName = selectedConvo?.contacts?.name ?? null;
                        const contactPhone = selectedConvo?.contacts?.phone ?? "";
                        setMessageInput(substituteQuickReplyVars(text, contactName, contactPhone));
                      }}
                      disabled={uploading}
                    />
                    <StickerPicker
                      onSelect={(sticker) => {
                        setMessageInput(sticker);
                        setTimeout(() => handleSendMessage(), 50);
                      }}
                      disabled={uploading}
                    />
                    {/* HSM Templates button – shown when convo is >24h or always for convenience */}
                    {(() => {
                      const lastMsg = selectedConvo?.last_message_at;
                      const isOld = !lastMsg || (Date.now() - new Date(lastMsg).getTime() > 24 * 60 * 60 * 1000);
                      if (!isOld) return null;
                      return (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0 h-9 w-9 text-muted-foreground hover:text-[#25d366] hover:bg-transparent"
                          onClick={openHsmDialog}
                          disabled={uploading}
                          title="Enviar template HSM (WhatsApp Business)"
                        >
                          <LayoutTemplate className="h-5 w-5" />
                        </Button>
                      );
                    })()}
                  </div>
                  {messageInput.trim() ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn("h-9 w-9 text-muted-foreground hover:text-purple-500 hover:bg-transparent", loadingSuggestions && "animate-pulse text-purple-500")}
                        onClick={fetchAiSuggestions}
                        disabled={uploading || loadingSuggestions}
                        title="Sugerir resposta com IA"
                      >
                        <Sparkles className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-10 w-10 rounded-full border-[#2a3942] dark:bg-[#202c33] text-muted-foreground hover:text-primary hover:border-primary"
                        onClick={() => {
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          tomorrow.setHours(9, 0, 0, 0);
                          const pad = (n: number) => String(n).padStart(2, "0");
                          const local = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;
                          setScheduleDateTime(local);
                          setScheduleDialogOpen(true);
                        }}
                        disabled={uploading}
                        title="Agendar mensagem"
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                      <div className="relative">
                        <Button size="icon" onClick={handleSendMessage} className="h-10 w-10 rounded-full bg-[#00a884] hover:bg-[#06cf9c] text-white" disabled={uploading}>
                          <Send className="h-5 w-5" />
                        </Button>
                        {!isOnline && queue.length > 0 && (
                          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-orange-500 border-2 border-white flex items-center justify-center text-[9px] font-bold text-white">
                            {queue.length}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className={cn("h-9 w-9 text-muted-foreground hover:text-purple-500 hover:bg-transparent", loadingSuggestions && "animate-pulse text-purple-500")}
                        onClick={fetchAiSuggestions}
                        disabled={uploading || loadingSuggestions}
                        title="Sugerir resposta com IA"
                      >
                        <Sparkles className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 h-10 w-10 rounded-full text-muted-foreground hover:text-[#00a884] hover:bg-transparent"
                        disabled={uploading}
                        title="Gravar áudio"
                        onClick={startRecording}
                      >
                        <Mic className="h-5 w-5" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
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
          customFields={(selectedConvo.contacts as any)?.custom_fields ?? null}
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
      {/* Pix QR Code Dialog */}
      <Dialog open={pixDialogOpen} onOpenChange={setPixDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-xl">💸</span>
              Gerar cobrança Pix
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={pixAmount}
                  onChange={(e) => setPixAmount(e.target.value)}
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Tipo de chave</Label>
                <Select value={pixKeyType} onValueChange={setPixKeyType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                    <SelectItem value="aleatoria">Aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Chave Pix</Label>
              <Input
                placeholder="Informe sua chave Pix"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1.5 block">Descrição</Label>
              <Input
                placeholder="Identificador da cobrança"
                value={pixDescription}
                onChange={(e) => setPixDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Nome do recebedor</Label>
                <Input
                  placeholder="Seu nome"
                  value={pixMerchantName}
                  onChange={(e) => setPixMerchantName(e.target.value)}
                  maxLength={25}
                />
              </div>
              <div>
                <Label className="text-sm font-medium mb-1.5 block">Cidade</Label>
                <Input
                  placeholder="Sua cidade"
                  value={pixMerchantCity}
                  onChange={(e) => setPixMerchantCity(e.target.value)}
                  maxLength={15}
                />
              </div>
            </div>
            <Button className="w-full gap-2" onClick={handleGeneratePixPayload}>
              Gerar QR Code / Código Pix
            </Button>
            {pixPayload && (
              <div className="space-y-3">
                <div className="rounded-lg bg-muted p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Código Pix — copia e cola</p>
                  <p className="text-xs font-mono break-all text-foreground select-all leading-relaxed">{pixPayload}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => { navigator.clipboard.writeText(pixPayload); toast.success("Código copiado!"); }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copiar código
                  </Button>
                </div>
                <div className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Prévia da mensagem</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                    {`💸 *Cobrança Pix*\nValor: R$ ${(parseFloat(pixAmount.replace(",", ".")) || 0).toFixed(2).replace(".", ",")}\nDescrição: ${pixDescription || "—"}\n\n*Chave Pix:* ${pixKey}\n*Tipo:* ${pixKeyType}\n\nCódigo Pix (copia e cola):\n${pixPayload.slice(0, 60)}...`}
                  </p>
                </div>
                <Button className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white" onClick={handleSendPixMessage}>
                  <Send className="h-4 w-4" />
                  Enviar no chat
                </Button>
              </div>
            )}
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

      {/* Schedule Message Dialog */}
      {scheduleDialogOpen && (() => {
        const convoForDialog = conversations.find((c) => c.id === selected);
        return (
          <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Agendar mensagem
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {convoForDialog && (
                  <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm space-y-1">
                    <p className="font-medium text-foreground">{convoForDialog.contacts.name || convoForDialog.contacts.phone}</p>
                    <p className="text-muted-foreground">{convoForDialog.contacts.phone}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Prévia da mensagem</label>
                  <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-foreground border border-border">
                    {messageInput.slice(0, 80)}{messageInput.length > 80 ? "..." : ""}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Data e hora do envio</label>
                  <input
                    type="datetime-local"
                    value={scheduleDateTime}
                    onChange={e => setScheduleDateTime(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setScheduleDialogOpen(false)}>Cancelar</Button>
                <Button
                  className="flex-1 gap-2"
                  onClick={() => handleScheduleMessage(scheduleDateTime)}
                  disabled={!scheduleDateTime}
                >
                  <Clock className="h-4 w-4" /> Agendar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Global Search */}
      <GlobalSearch
        open={globalSearchOpen}
        onClose={() => setGlobalSearchOpen(false)}
        onSelectConversation={(id) => {
          handleSelectConvo(id);
          setGlobalSearchOpen(false);
        }}
      />

      {/* Keyboard Shortcuts Modal */}
      <Dialog open={showShortcutsModal} onOpenChange={setShowShortcutsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-base font-bold">Atalhos de Teclado</span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground uppercase border-b border-border">
                  <th className="text-left pb-2 font-semibold">Atalho</th>
                  <th className="text-left pb-2 font-semibold">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { key: "J", action: "Próxima conversa" },
                  { key: "K", action: "Conversa anterior" },
                  { key: "R", action: "Focar campo de resposta" },
                  { key: "N", action: "Marcar conversa como lida" },
                  { key: "S", action: "Favoritar/Desfavoritar conversa" },
                  { key: "Esc", action: "Fechar modal / Desselecionar conversa" },
                  { key: "Ctrl+K", action: "Busca global" },
                  { key: "Ctrl+Enter", action: "Enviar mensagem" },
                  { key: "Ctrl+/", action: "Mostrar esta ajuda" },
                ].map(({ key, action }) => (
                  <tr key={key} className="py-2">
                    <td className="py-2 pr-4">
                      <kbd className="bg-muted border border-border rounded px-2 py-0.5 text-xs font-mono font-semibold text-foreground">
                        {key}
                      </kbd>
                    </td>
                    <td className="py-2 text-muted-foreground">{action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* File Manager Upload Input */}
      <input
        type="file"
        ref={fileManagerUploadRef}
        className="hidden"
        onChange={handleFileManagerUpload}
      />

      {/* File Manager Dialog */}
      <Dialog open={fileManagerOpen} onOpenChange={setFileManagerOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Folder className="h-5 w-5" />
              Selecionar Arquivo
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar arquivos..."
                value={fileManagerSearch}
                onChange={(e) => setFileManagerSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {fileManagerLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
                  <RotateCw className="h-5 w-5 animate-spin mr-2" /> Carregando...
                </div>
              ) : fileManagerFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Folder className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm">Nenhum arquivo encontrado</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 p-1">
                  {fileManagerFiles
                    .filter((f) => f.name.toLowerCase().includes(fileManagerSearch.toLowerCase()))
                    .map((file) => {
                      const type = getMediaTypeFromName(file.name);
                      const publicUrl = user ? supabase.storage.from('file-manager').getPublicUrl(user.id + '/' + file.name).data.publicUrl : '';
                      return (
                        <button
                          key={file.name}
                          onClick={() => handleFileManagerSelect(file)}
                          className="flex flex-col items-center gap-1.5 p-2 rounded-lg border border-border hover:border-primary hover:bg-accent transition-all text-left group"
                        >
                          {type === 'image' ? (
                            <div className="w-full aspect-square rounded-md overflow-hidden bg-muted">
                              <img src={publicUrl} alt={file.name} className="w-full h-full object-cover" />
                            </div>
                          ) : (
                            <div className="w-full aspect-square rounded-md bg-muted flex items-center justify-center">
                              <FileText className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
                            </div>
                          )}
                          <p className="text-[11px] text-foreground font-medium truncate w-full text-center">{file.name}</p>
                          {file.metadata?.size && (
                            <p className="text-[10px] text-muted-foreground">{formatFileSize(file.metadata.size)}</p>
                          )}
                        </button>
                      );
                    })}
                </div>
              )}
            </div>
            <div className="border-t border-border pt-3">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => fileManagerUploadRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
                Upload novo arquivo
              </Button>
            </div>
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

      {/* AI Conversation Summary Dialog */}
      <Dialog open={summaryOpen} onOpenChange={(open) => { setSummaryOpen(open); if (!open) setSummary(''); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-500" />
              Resumo da Conversa
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            {summaryLoading ? (
              <div className="flex items-center justify-center py-10 gap-3 text-muted-foreground">
                <RotateCw className="h-5 w-5 animate-spin" />
                <span className="text-sm">Gerando resumo...</span>
              </div>
            ) : (
              <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {summary || 'Nenhum resumo disponível.'}
              </div>
            )}
          </div>
          <DialogFooter className="flex flex-row gap-2 sm:justify-start">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={summaryLoading || !summary}
              onClick={() => {
                navigator.clipboard.writeText(summary);
                toast.success('Resumo copiado!');
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              Copiar resumo
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={summaryLoading || !summary || !selected}
              onClick={async () => {
                if (!selected || !summary) return;
                const authorName = profileName || user?.email || 'Agente';
                await supabase.from('conversation_notes').insert({
                  conversation_id: selected,
                  user_id: user?.id,
                  content: `[Resumo IA]\n${summary}`,
                  author_name: authorName,
                  is_internal: true,
                } as any);
                toast.success('Resumo adicionado como nota interna!');
                setSummaryOpen(false);
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              Usar como nota interna
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSummaryOpen(false)}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* HSM Template Dialog */}
      <Dialog open={hsmDialogOpen} onOpenChange={(o) => !o && setHsmDialogOpen(false)}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-[#25d366]" />
              Enviar Template HSM
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col gap-4 py-2">
            {/* Search templates */}
            {!hsmSelected && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar template..."
                    value={hsmSearch}
                    onChange={(e) => setHsmSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 max-h-[40vh]">
                  {hsmTemplates.length === 0 && (
                    <p className="text-center text-muted-foreground text-sm py-8">
                      Nenhum template aprovado encontrado.<br />
                      Crie e aprove templates em <strong>Templates HSM</strong>.
                    </p>
                  )}
                  {hsmTemplates
                    .filter((t) => !hsmSearch || t.name.toLowerCase().includes(hsmSearch.toLowerCase()))
                    .map((tpl) => (
                      <button
                        key={tpl.id}
                        className="w-full text-left border border-border rounded-lg px-4 py-3 hover:bg-accent transition-colors"
                        onClick={() => {
                          setHsmSelected(tpl);
                          setHsmVarValues({});
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-mono text-sm font-medium text-foreground">{tpl.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{tpl.language}</span>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{tpl.body.slice(0, 100)}</p>
                      </button>
                    ))}
                </div>
              </>
            )}

            {/* Variable fill + preview */}
            {hsmSelected && (
              <div className="space-y-4 overflow-y-auto flex-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHsmSelected(null)}
                    className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1"
                  >
                    <X className="h-3.5 w-3.5" /> Voltar
                  </button>
                  <span className="font-mono text-sm font-semibold text-foreground">{hsmSelected.name}</span>
                </div>

                {/* Variable inputs */}
                {hsmSelected.variables.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Preencha as variáveis</Label>
                    {hsmSelected.variables.map((v) => {
                      const n = v.replace(/\{\{|\}\}/g, "");
                      return (
                        <div key={v} className="flex items-center gap-3">
                          <span className="font-mono text-xs text-muted-foreground w-10 shrink-0">{v}</span>
                          <Input
                            className="h-8 text-sm flex-1"
                            placeholder={`Valor para ${v}`}
                            value={hsmVarValues[n] || ""}
                            onChange={(e) => setHsmVarValues((prev) => ({ ...prev, [n]: e.target.value }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Preview */}
                <div className="bg-[#e5ddd5] dark:bg-[#0b141a] rounded-xl p-4">
                  <div className="max-w-xs">
                    <div className="bg-white dark:bg-[#202c33] rounded-xl shadow-md overflow-hidden">
                      {hsmSelected.header_type === "TEXT" && hsmSelected.header_content && (
                        <div className="px-3 pt-3 pb-1">
                          <p className="font-semibold text-sm">{hsmSelected.header_content}</p>
                        </div>
                      )}
                      <div className="px-3 py-2">
                        <p className="text-sm whitespace-pre-wrap">
                          {hsmSelected.body.replace(/\{\{(\d+)\}\}/g, (_: string, n: string) => hsmVarValues[n] || `{{${n}}}`)}
                        </p>
                      </div>
                      {hsmSelected.footer && (
                        <div className="px-3 pb-2">
                          <p className="text-xs text-muted-foreground">{hsmSelected.footer}</p>
                        </div>
                      )}
                    </div>
                    {hsmSelected.buttons.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {hsmSelected.buttons.map((btn, i) => (
                          <div key={i} className="bg-white dark:bg-[#202c33] rounded-xl shadow-sm px-3 py-2 text-center text-sm text-[#00a884] font-medium">
                            {btn.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setHsmDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSendHSM}
              disabled={!hsmSelected || hsmSending}
              className="bg-[#00a884] hover:bg-[#06cf9c] text-white gap-2"
            >
              <Send className="h-4 w-4" />
              {hsmSending ? "Enviando..." : "Enviar Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Catalog Dialog */}
      <Dialog open={catalogOpen} onOpenChange={(o) => { if (!o) { setCatalogOpen(false); setSelectedProducts(new Set()); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-orange-600" />
              Enviar produto do catálogo
            </DialogTitle>
          </DialogHeader>

          <div className="relative mb-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              value={catalogSearch}
              onChange={(e) => setCatalogSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {catalogProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <ShoppingBag className="h-10 w-10 opacity-20" />
                <p className="text-sm">Nenhum produto ativo encontrado</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {catalogProducts
                  .filter((p) =>
                    !catalogSearch ||
                    p.name.toLowerCase().includes(catalogSearch.toLowerCase())
                  )
                  .map((product) => {
                    const isSelected = selectedProducts.has(product.id);
                    const priceFormatted = new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    }).format(product.price ?? 0);
                    return (
                      <div
                        key={product.id}
                        onClick={() => toggleProductSelection(product.id)}
                        className={cn(
                          "relative flex gap-3 p-3 border rounded-xl cursor-pointer transition-all",
                          isSelected
                            ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20"
                            : "border-border hover:border-orange-300 hover:bg-muted/50"
                        )}
                      >
                        {/* Checkbox */}
                        <div className={cn(
                          "absolute top-2 right-2 h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                          isSelected ? "bg-orange-500 border-orange-500" : "border-muted-foreground"
                        )}>
                          {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>

                        {/* Image */}
                        <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <ShoppingBag className="h-8 w-8 text-muted-foreground opacity-30" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 pr-4">
                          <p className="font-semibold text-sm text-foreground line-clamp-2 leading-tight">{product.name}</p>
                          <p className="text-base font-bold text-orange-600 mt-1">{priceFormatted}</p>
                          {product.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{product.description}</p>
                          )}
                          <span className="inline-flex items-center mt-1.5 text-[10px] font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                            Ativo
                          </span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 border-t border-border mt-2">
            <Button variant="outline" onClick={() => { setCatalogOpen(false); setSelectedProducts(new Set()); }}>
              Cancelar
            </Button>
            <Button
              onClick={handleSendCatalog}
              disabled={selectedProducts.size === 0 || sendingCatalog}
              className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
            >
              {sendingCatalog && <RefreshCw className="h-4 w-4 animate-spin" />}
              {sendingCatalog
                ? "Enviando..."
                : `Enviar ${selectedProducts.size} produto${selectedProducts.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Follow-up Reminder Dialog */}
      {selectedConvo && (
        <FollowupDialog
          open={showFollowupDialog}
          onOpenChange={setShowFollowupDialog}
          conversationId={selectedConvo.id}
          contactId={selectedConvo.contact_id}
          contactName={selectedConvo.contacts?.name || selectedConvo.contacts?.phone || null}
          createReminder={createReminder}
        />
      )}

      {/* Merge Conversations Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-primary" />
              Mesclar com outra conversa
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2 pb-2">
            Todas as mensagens da conversa atual serão movidas para a conversa selecionada.
          </p>
          <div className="flex flex-col gap-3 flex-1 overflow-hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conversa..."
                value={mergeSearch}
                onChange={(e) => setMergeSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 scrollbar-thin">
              {mergeTargetConvos.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">
                  Nenhuma outra conversa encontrada para este contato.
                </p>
              )}
              {mergeTargetConvos
                .filter((c) => {
                  if (!mergeSearch) return true;
                  const name = (c.contacts?.name || "").toLowerCase();
                  const phone = (c.contacts?.phone || "").toLowerCase();
                  const date = c.created_at ? new Date(c.created_at).toLocaleDateString("pt-BR") : "";
                  return name.includes(mergeSearch.toLowerCase()) || phone.includes(mergeSearch.toLowerCase()) || date.includes(mergeSearch);
                })
                .map((c) => (
                  <div
                    key={c.id}
                    className="border border-border rounded-lg p-3 hover:bg-accent transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {c.status === "closed" ? (
                            <Badge className="bg-muted text-muted-foreground text-[10px] px-1.5 py-0 font-normal">Encerrada</Badge>
                          ) : c.status === "open" ? (
                            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] px-1.5 py-0 font-normal">Aguardando</Badge>
                          ) : (
                            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px] px-1.5 py-0 font-normal">Em atendimento</Badge>
                          )}
                          {c.created_at && (
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(c.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                            </span>
                          )}
                        </div>
                        {c.last_message_body && (
                          <p className="text-xs text-muted-foreground truncate">{c.last_message_body}</p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        className="gap-1.5 h-7 px-3 text-xs shrink-0"
                        onClick={() => handleMergeConversations(c.id)}
                        disabled={merging}
                      >
                        {merging ? <RotateCw className="h-3 w-3 animate-spin" /> : <GitMerge className="h-3 w-3" />}
                        Mesclar
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flow Templates Apply Dialog */}
      <Dialog open={flowTemplateDialogOpen} onOpenChange={setFlowTemplateDialogOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5 text-primary" />
              Aplicar Template de Atendimento
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin">
            {flowTemplatesLoading ? (
              <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
                <RotateCw className="h-5 w-5 animate-spin" />
                <span className="text-sm">Carregando templates...</span>
              </div>
            ) : flowTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <LayoutTemplate className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">Nenhum template cadastrado</p>
                <p className="text-xs mt-1">Crie templates em <strong>Templates de Atendimento</strong></p>
              </div>
            ) : (
              flowTemplates.map((tpl) => (
                <div key={tpl.id} className="border border-border rounded-lg p-4 hover:bg-accent/30 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground">{tpl.name}</p>
                      {tpl.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="gap-1.5 h-8 px-3 text-xs shrink-0"
                      onClick={() => handleApplyFlowTemplate(tpl)}
                      disabled={applyingTemplate === tpl.id}
                    >
                      {applyingTemplate === tpl.id ? (
                        <RotateCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="h-3.5 w-3.5" />
                      )}
                      {applyingTemplate === tpl.id ? "Aplicando..." : "Aplicar"}
                    </Button>
                  </div>
                  {/* Steps preview */}
                  <div className="flex flex-wrap gap-1.5">
                    {tpl.steps.slice().sort((a, b) => a.order - b.order).map((step) => {
                      const stepLabels: Record<FlowTemplateStep["type"], string> = {
                        send_message:       "Mensagem",
                        add_tag:            "Tag +",
                        remove_tag:         "Tag -",
                        assign_agent:       "Atribuir",
                        wait:               `Aguardar ${step.config.wait_minutes ?? "?"}min`,
                        close_conversation: "Encerrar",
                        send_note:          "Nota",
                        add_label:          "Etiqueta +",
                      };
                      return (
                        <span
                          key={step.id}
                          className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border"
                        >
                          {stepLabels[step.type]}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Passos de espera são ignorados na aplicação imediata.
                  </p>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="pt-2 border-t border-border">
            <Button variant="outline" onClick={() => setFlowTemplateDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Number Dialog */}
      <Dialog open={blockDialogOpen} onOpenChange={setBlockDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-red-500" /> Bloquear número
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <input
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                placeholder="Ex: 5511999999999"
                value={blockPhone}
                onChange={e => setBlockPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Use o formato internacional</p>
            </div>
            <div className="space-y-1.5">
              <Label>Motivo <span className="text-red-500">*</span></Label>
              <Textarea
                placeholder="Descreva o motivo do bloqueio..."
                value={blockReason}
                onChange={e => setBlockReason(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Expiração</Label>
              <Select value={blockExpiration} onValueChange={v => setBlockExpiration(v as typeof blockExpiration)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nunca">Nunca</SelectItem>
                  <SelectItem value="7">7 dias</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                  <SelectItem value="custom">Data específica</SelectItem>
                </SelectContent>
              </Select>
              {blockExpiration === "custom" && (
                <input
                  type="date"
                  value={blockCustomDate}
                  onChange={e => setBlockCustomDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockDialogOpen(false)}>Cancelar</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleBlockNumber}
              disabled={blocking}
            >
              {blocking ? "Bloqueando..." : "Bloquear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Inbox;
