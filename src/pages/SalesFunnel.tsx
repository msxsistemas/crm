import { useState, useCallback, useEffect, forwardRef, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { sendMessage } from "@/lib/evolution-api";
import MediaMessage from "@/components/chat/MediaMessage";
import { useMediaUpload } from "@/components/chat/useMediaUpload";
import { EmojiPicker, StickerPicker } from "@/components/chat/EmojiStickerPicker";
import { SignatureButton, QuickMessagesButton } from "@/components/chat/ChatActionButtons";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Plus, Search, Filter, BarChart3, RotateCw, MoreVertical, ChevronDown,
  User, Phone, Clock, MessageCircle, X, ExternalLink, Send, Settings,
  ArrowLeft, Paperclip, Mic,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { cn } from "@/lib/utils";
import KanbanDashboard from "@/components/kanban/KanbanDashboard";
import TagSelector from "@/components/shared/TagSelector";

// --- Types ---
interface KanbanContact {
  id: string;
  contact_id?: string | null;
  name: string;
  phone: string;
  avatar_url?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  status: "aguardando" | "encerrada" | "atendendo";
  assignee?: string;
  created_at?: string;
}

interface KanbanColumn {
  id: string;
  name: string;
  color: string;
  isDefault?: boolean;
  isFinalized?: boolean;
  contacts: KanbanContact[];
}

interface Board {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  isDefault?: boolean;
  columns: KanbanColumn[];
}

// --- Board icon options ---
const BOARD_ICONS = [
  { id: "vendas", label: "Vendas", icon: "📈" },
  { id: "suporte", label: "Suporte", icon: "🏠" },
  { id: "clientes", label: "Clientes", icon: "👥" },
  { id: "ecommerce", label: "E-commerce", icon: "🛒" },
  { id: "metas", label: "Metas", icon: "🎯" },
  { id: "geral", label: "Geral", icon: "⊞" },
] as const;

// --- Color palette for columns ---
const COLUMN_COLORS = [
  "#7C3AED", "#A855F7", "#EC4899", "#EF4444", "#F97316",
  "#F59E0B", "#EAB308", "#84CC16", "#22C55E", "#14B8A6",
  "#06B6D4", "#3B82F6",
];
const getRelativeTime = (dateStr: string) => {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "agora";
  if (diffMins < 60) return `há ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `há cerca de ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `há ${diffDays}d`;
};

const SalesFunnel = () => {
  const { user } = useAuth();
  const [boards, setBoards] = useState<Board[]>([]);
  const [activeBoardId, setActiveBoardId] = useState<string>("");
  const [showDashboard, setShowDashboard] = useState(false);
  const [search, setSearch] = useState("");
  const [unassigned, setUnassigned] = useState<KanbanContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState(""); // for assignee display

  // New column dialog
  const [showNewColumn, setShowNewColumn] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColColor, setNewColColor] = useState(COLUMN_COLORS[0]);
  const [newColDefault, setNewColDefault] = useState(false);
  const [newColFinalized, setNewColFinalized] = useState(false);

  // Filters
  const [sortBy, setSortBy] = useState<"recente" | "antigo" | "nome" | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Chat modal
  const [chatContact, setChatContact] = useState<KanbanContact | null>(null);

  // Board dialog state
  const [showBoardDialog, setShowBoardDialog] = useState(false);
  const [editingBoard, setEditingBoard] = useState<Board | null>(null);
  const [boardName, setBoardName] = useState("");
  const [boardDescription, setBoardDescription] = useState("");
  const [boardIcon, setBoardIcon] = useState("vendas");
  const [boardColor, setBoardColor] = useState(COLUMN_COLORS[0]);
  const [boardIsDefault, setBoardIsDefault] = useState(false);

  // Edit column dialog
  const [editCol, setEditCol] = useState<KanbanColumn | null>(null);
  const [editColName, setEditColName] = useState("");
  const [editColColor, setEditColColor] = useState("");
  const [editColDefault, setEditColDefault] = useState(false);
  const [editColFinalized, setEditColFinalized] = useState(false);
  const isPersistingDragRef = useRef(false);
  const fetchRunRef = useRef(0);

  // Fetch boards, columns, cards from Supabase
  const fetchData = useCallback(async (silent = false) => {
    if (!user) return;
    if (silent && isPersistingDragRef.current) return;

    const fetchRunId = ++fetchRunRef.current;
    const isLatestFetch = () => fetchRunId === fetchRunRef.current;

    if (!silent) setLoading(true);

    const { data: boardsData } = await supabase
      .from("kanban_boards")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (!boardsData || boardsData.length === 0) {
      // Create default board
      const { data: newBoard } = await supabase
        .from("kanban_boards")
        .insert({ user_id: user.id, name: "Vendas", is_default: true })
        .select()
        .single();

      if (newBoard) {
        const defaultCols = [
          { board_id: newBoard.id, name: "Novo Lead", color: "#3B82F6", position: 0, is_default: true, is_finalized: false },
          { board_id: newBoard.id, name: "Em Qualificação", color: "#F59E0B", position: 1, is_default: false, is_finalized: false },
          { board_id: newBoard.id, name: "Proposta Enviada", color: "#A855F7", position: 2, is_default: false, is_finalized: false },
          { board_id: newBoard.id, name: "Negociação", color: "#EC4899", position: 3, is_default: false, is_finalized: false },
          { board_id: newBoard.id, name: "Fechado", color: "#22C55E", position: 4, is_default: false, is_finalized: true },
          { board_id: newBoard.id, name: "Perdido", color: "#EF4444", position: 5, is_default: false, is_finalized: true },
        ];
        await supabase.from("kanban_columns").insert(defaultCols);
        // Re-fetch after creating defaults
        return fetchData();
      }
      if (!silent && isLatestFetch()) setLoading(false);
      return;
    }

    // Fetch all columns for user's boards
    const boardIds = boardsData.map((b) => b.id);
    const { data: columnsData } = await supabase
      .from("kanban_columns")
      .select("*")
      .in("board_id", boardIds)
      .order("position", { ascending: true });

    // Fetch all cards
    const columnIds = (columnsData || []).map((c) => c.id);
    const { data: cardsData } = columnIds.length > 0
      ? await supabase
          .from("kanban_cards")
          .select("*")
          .in("column_id", columnIds)
          .order("position", { ascending: true })
      : { data: [] };

    // Fetch conversation data for contacts linked to cards
    const contactIds = (cardsData || []).filter((c) => c.contact_id).map((c) => c.contact_id!);
    let convoMap = new Map<string, { status: string; unreadCount: number; lastMsg: string; lastMsgTime: string; fromMe: boolean }>();

    if (contactIds.length > 0) {
      const { data: convos } = await supabase
        .from("conversations")
        .select("id, contact_id, status, last_message_at, unread_count")
        .in("contact_id", contactIds)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      const convoByContact = new Map<string, {
        id: string;
        contact_id: string;
        status: string;
        last_message_at: string | null;
        unread_count: number;
      }>();

      (convos || []).forEach((convo) => {
        const existing = convoByContact.get(convo.contact_id);
        if (!existing) {
          convoByContact.set(convo.contact_id, convo);
          return;
        }

        const convoTs = convo.last_message_at ? new Date(convo.last_message_at).getTime() : 0;
        const existingTs = existing.last_message_at ? new Date(existing.last_message_at).getTime() : 0;
        const convoPriority = convo.status !== "closed" ? 2 : 1;
        const existingPriority = existing.status !== "closed" ? 2 : 1;

        if (convoPriority > existingPriority || (convoPriority === existingPriority && convoTs > existingTs)) {
          convoByContact.set(convo.contact_id, convo);
        }
      });

      const selectedConvos = Array.from(convoByContact.values());

      // Fetch contact avatars
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, name, avatar_url")
        .in("id", contactIds);

      const avatarMap = new Map<string, string>();
      const contactNameMap = new Map<string, string>();
      (contacts || []).forEach((c) => {
        if (c.avatar_url) avatarMap.set(c.id, c.avatar_url);
        if (c.name) contactNameMap.set(c.id, c.name);
      });

      if (selectedConvos.length > 0) {
        const cIds = selectedConvos.map((c) => c.id);
        const { data: msgs } = await supabase
          .from("messages")
          .select("conversation_id, body, from_me, created_at")
          .in("conversation_id", cIds)
          .order("created_at", { ascending: false });

        const lastMsgByConvo = new Map<string, { body: string; from_me: boolean; created_at: string }>();
        (msgs || []).forEach((m) => {
          if (!lastMsgByConvo.has(m.conversation_id)) {
            lastMsgByConvo.set(m.conversation_id, { body: m.body, from_me: m.from_me, created_at: m.created_at });
          }
        });

        selectedConvos.forEach((convo) => {
          const lastMsg = lastMsgByConvo.get(convo.id);
          convoMap.set(convo.contact_id, {
            status: convo.status === "closed" ? "encerrada" : (convo.unread_count > 0 ? "aguardando" : "atendendo"),
            unreadCount: convo.unread_count || 0,
            lastMsg: lastMsg ? (lastMsg.from_me ? `Você: ${lastMsg.body}` : lastMsg.body) : "Sem mensagens",
            lastMsgTime: convo.last_message_at ? getRelativeTime(convo.last_message_at) : "",
            fromMe: lastMsg?.from_me || false,
          });
        });
      }

      // Store avatar and name maps for later use
      (cardsData || []).forEach((card) => {
        if (card.contact_id) {
          if (avatarMap.has(card.contact_id)) (card as any)._avatar = avatarMap.get(card.contact_id);
          if (contactNameMap.has(card.contact_id)) (card as any)._contactName = contactNameMap.get(card.contact_id);
        }
      });
    }

    // Auto-create kanban cards for contacts with conversations but no kanban card
    const allCardContactIds = (cardsData || []).filter(c => c.contact_id).map(c => c.contact_id!);
    const { data: allConvosForUnassigned } = await supabase
      .from("conversations")
      .select("id, contact_id, status, last_message_at, unread_count")
      .order("last_message_at", { ascending: false, nullsFirst: false });

    const seenContactIds = new Set(allCardContactIds);
    const unassignedConvoContactIds: string[] = [];

    (allConvosForUnassigned || []).forEach((convo) => {
      if (!seenContactIds.has(convo.contact_id)) {
        seenContactIds.add(convo.contact_id);
        unassignedConvoContactIds.push(convo.contact_id);
      }
    });

    // Auto-assign unassigned contacts to default column
    if (unassignedConvoContactIds.length > 0) {
      // Find default column for active board
      const defaultCol = (columnsData || []).find(c => c.is_default) || (columnsData || [])[0];
      if (defaultCol) {
        const { data: unassignedContactsData } = await supabase
          .from("contacts")
          .select("id, name, phone")
          .in("id", unassignedConvoContactIds);

        if (unassignedContactsData && unassignedContactsData.length > 0) {
          const cardsToInsert = unassignedContactsData.map((c, idx) => ({
            column_id: defaultCol.id,
            contact_id: c.id,
            name: c.name || c.phone,
            phone: c.phone,
            position: (cardsData || []).filter(card => card.column_id === defaultCol.id).length + idx,
          }));

          await supabase.from("kanban_cards").insert(cardsToInsert);
          console.log(`Auto-created ${cardsToInsert.length} kanban cards in default column`);
          
          // Re-fetch to get the newly created cards
          if (!silent) return fetchData();
        }
      }
    }

    if (!isLatestFetch()) return;
    setUnassigned([]);

    // Build board structure
    const builtBoards: Board[] = boardsData.map((b) => ({
      id: b.id,
      name: b.name,
      description: (b as any).description || "",
      icon: (b as any).icon || "vendas",
      color: (b as any).color || "#7C3AED",
      isDefault: b.is_default,
      columns: (columnsData || [])
        .filter((c) => c.board_id === b.id)
        .map((c) => ({
          id: c.id,
          name: c.name,
          color: c.color,
          isDefault: c.is_default,
          isFinalized: c.is_finalized,
          contacts: (cardsData || [])
            .filter((card) => card.column_id === c.id)
            .map((card) => {
              const convoInfo = card.contact_id ? convoMap.get(card.contact_id) : undefined;
                return {
                  id: card.id,
                  contact_id: card.contact_id ?? null,
                  name: (card as any)._contactName || card.name,
                  phone: card.phone || "",
                  avatar_url: (card as any)._avatar || undefined,
                  lastMessage: convoInfo?.lastMsg,
                  lastMessageTime: convoInfo?.lastMsgTime,
                  unreadCount: convoInfo?.unreadCount || 0,
                  status: (convoInfo?.status || "atendendo") as "aguardando" | "encerrada" | "atendendo",
                  assignee: userName || undefined,
                  created_at: card.created_at,
                };
            }),
        })),
    }));

    if (!isLatestFetch()) return;
    setBoards(builtBoards);
    if (!activeBoardId || !builtBoards.find((b) => b.id === activeBoardId)) {
      setActiveBoardId(builtBoards[0]?.id || "");
    }
    if (!silent && isLatestFetch()) setLoading(false);
  }, [user, activeBoardId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch user profile name for assignee display
  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("full_name").eq("id", user.id).single().then(({ data }) => {
      if (data?.full_name) setUserName(data.full_name);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;

    let isActive = true;
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (isPersistingDragRef.current) return;
      if (refreshTimeout) clearTimeout(refreshTimeout);
      refreshTimeout = setTimeout(() => {
        if (isActive && !isPersistingDragRef.current) fetchData(true);
      }, 1000);
    };

    const messagesChannel = supabase
      .channel(`kanban-messages-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, scheduleRefresh)
      .subscribe();

    const conversationsChannel = supabase
      .channel(`kanban-conversations-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, scheduleRefresh)
      .subscribe();

    const cardsChannel = supabase
      .channel(`kanban-cards-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "kanban_cards" }, scheduleRefresh)
      .subscribe();

    const pollInterval = setInterval(() => {
      if (isActive && !isPersistingDragRef.current) fetchData(true);
    }, 15000);

    return () => {
      isActive = false;
      if (refreshTimeout) clearTimeout(refreshTimeout);
      clearInterval(pollInterval);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(conversationsChannel);
      supabase.removeChannel(cardsChannel);
    };
  }, [user, fetchData]);

  const board = boards.find((b) => b.id === activeBoardId) || { id: "", name: "Carregando", columns: [] } as Board;

  // Apply search, sort and date filters to contacts in each column
  const filteredBoard = useMemo(() => {
    const lowerSearch = search.toLowerCase().trim();

    const filterAndSort = (contacts: KanbanContact[]) => {
      let filtered = contacts;

      // Search filter
      if (lowerSearch) {
        filtered = filtered.filter(
          (c) =>
            c.name.toLowerCase().includes(lowerSearch) ||
            c.phone.toLowerCase().includes(lowerSearch)
        );
      }

      // Date filter
      if (dateFrom) {
        const from = new Date(dateFrom);
        filtered = filtered.filter((c) => {
          const d = c.created_at ? new Date(c.created_at) : null;
          return d && d >= from;
        });
      }
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        filtered = filtered.filter((c) => {
          const d = c.created_at ? new Date(c.created_at) : null;
          return d && d <= to;
        });
      }

      // Sort
      if (sortBy === "nome") {
        filtered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
      } else if (sortBy === "antigo") {
        filtered = [...filtered].sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
      } else if (sortBy === "recente") {
        filtered = [...filtered].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      }

      return filtered;
    };

    return {
      ...board,
      columns: board.columns.map((col) => ({
        ...col,
        contacts: filterAndSort(col.contacts),
      })),
    };
  }, [board, search, sortBy, dateFrom, dateTo]);

  const totalContacts = board.columns.reduce((s, c) => s + c.contacts.length, 0) + unassigned.length;

  // Drag and drop
  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    if (isPersistingDragRef.current) return;

    const isFromUnassigned = source.droppableId === "unassigned";
    const isToUnassigned = destination.droppableId === "unassigned";

    // Can't drag to unassigned
    if (isToUnassigned) return;

    const previousBoards = boards;
    const previousUnassigned = unassigned;

    try {
      isPersistingDragRef.current = true;

      if (isFromUnassigned) {
        // Find contact by draggableId instead of index (safe with filters)
        const contactIdx = unassigned.findIndex((c) => c.id === draggableId);
        const contact = contactIdx >= 0 ? unassigned[contactIdx] : null;
        if (!contact) return;

        const newUnassigned = [...unassigned];
        newUnassigned.splice(contactIdx, 1);
        setUnassigned(newUnassigned);

        const { error: insertError } = await supabase.from("kanban_cards").insert({
          column_id: destination.droppableId,
          contact_id: contact.contact_id || null,
          name: contact.name,
          phone: contact.phone,
          position: destination.index,
        });

        if (insertError) throw insertError;

        // Normalize destination column positions
        const { data: destinationCards, error: destinationCardsError } = await supabase
          .from("kanban_cards")
          .select("id")
          .eq("column_id", destination.droppableId)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true });

        if (destinationCardsError) throw destinationCardsError;

        if (destinationCards?.length) {
          const normalizeUpdates = destinationCards.map((card, index) =>
            supabase.from("kanban_cards").update({ position: index }).eq("id", card.id)
          );
          const normalizeResults = await Promise.all(normalizeUpdates);
          const normalizeError = normalizeResults.find((r) => r.error);
          if (normalizeError?.error) throw normalizeError.error;
        }

        return;
      }

      // Use draggableId to find the card in the ORIGINAL (unfiltered) board
      const newBoards = boards.map((boardItem) => ({
        ...boardItem,
        columns: boardItem.columns.map((column) => ({
          ...column,
          contacts: [...column.contacts],
        })),
      }));

      const activeBoard = newBoards.find((x) => x.id === activeBoardId);
      if (!activeBoard) return;

      const srcCol = activeBoard.columns.find((c) => c.id === source.droppableId);
      const destCol = activeBoard.columns.find((c) => c.id === destination.droppableId);
      if (!srcCol || !destCol) return;

      // Find the moved card by ID (not by filtered index)
      const srcIdx = srcCol.contacts.findIndex((c) => c.id === draggableId);
      if (srcIdx === -1) return;

      const [movedContact] = srcCol.contacts.splice(srcIdx, 1);
      if (!movedContact) return;

      // For destination, map the filtered index to the unfiltered array position
      // Get the filtered view of the destination column to find the correct insertion point
      const filteredDestCol = filteredBoard.columns.find((c) => c.id === destination.droppableId);
      const destFilteredContacts = filteredDestCol?.contacts || [];

      if (source.droppableId === destination.droppableId) {
        // Same column: insert relative to filtered neighbors
        if (destination.index >= destFilteredContacts.length) {
          // Dropped at the end of filtered list
          destCol.contacts.push(movedContact);
        } else {
          const neighborId = destFilteredContacts[destination.index]?.id;
          const realIdx = neighborId ? destCol.contacts.findIndex((c) => c.id === neighborId) : destCol.contacts.length;
          destCol.contacts.splice(realIdx >= 0 ? realIdx : destCol.contacts.length, 0, movedContact);
        }
      } else {
        // Different column: insert at mapped position
        if (destination.index >= destFilteredContacts.length) {
          destCol.contacts.push(movedContact);
        } else {
          const neighborId = destFilteredContacts[destination.index]?.id;
          const realIdx = neighborId ? destCol.contacts.findIndex((c) => c.id === neighborId) : destCol.contacts.length;
          destCol.contacts.splice(realIdx >= 0 ? realIdx : destCol.contacts.length, 0, movedContact);
        }
      }

      setBoards(newBoards);

      // Persist canonical order for all cards in active board
      const updates = activeBoard.columns.flatMap((column) =>
        column.contacts
          .filter((c) => c?.id)
          .map((c, index) =>
            supabase
              .from("kanban_cards")
              .update({ column_id: column.id, position: index })
              .eq("id", c.id)
          )
      );

      const results = await Promise.all(updates);
      const failedUpdate = results.find((r) => r.error);
      if (failedUpdate?.error) throw failedUpdate.error;
    } catch (error) {
      setBoards(previousBoards);
      setUnassigned(previousUnassigned);
      toast.error("Não foi possível mover o card. Tente novamente.");
      fetchData(true);
    } finally {
      isPersistingDragRef.current = false;
    }
  };

  // Add column
  const handleAddColumn = async () => {
    if (!newColName.trim() || !board.id) return;
    const position = board.columns.length;
    const { data, error } = await supabase.from("kanban_columns").insert({
      board_id: board.id,
      name: newColName.trim(),
      color: newColColor,
      position,
      is_default: newColDefault,
      is_finalized: newColFinalized,
    }).select().single();
    if (error) {
      toast.error("Erro ao criar coluna");
      return;
    }
    toast.success("Coluna criada!");
    setNewColName("");
    setNewColColor(COLUMN_COLORS[0]);
    setNewColDefault(false);
    setNewColFinalized(false);
    setShowNewColumn(false);
    fetchData();
  };

  // Edit column
  const openEditColumn = (col: KanbanColumn) => {
    setEditCol(col);
    setEditColName(col.name);
    setEditColColor(col.color);
    setEditColDefault(col.isDefault || false);
    setEditColFinalized(col.isFinalized || false);
  };

  const handleEditColumn = async () => {
    if (!editCol || !editColName.trim()) return;
    const { error } = await supabase.from("kanban_columns").update({
      name: editColName.trim(),
      color: editColColor,
      is_default: editColDefault,
      is_finalized: editColFinalized,
    }).eq("id", editCol.id);
    if (error) {
      toast.error("Erro ao editar coluna");
      return;
    }
    toast.success("Coluna atualizada!");
    setEditCol(null);
    fetchData();
  };

  // Delete column
  const handleDeleteColumn = async (colId: string, contactCount: number) => {
    if (contactCount > 0) {
      toast.error("Remova os contatos desta coluna antes de excluí-la.");
      return;
    }
    const confirmed = confirm("Tem certeza que deseja remover esta coluna?");
    if (!confirmed) return;
    const { error } = await supabase.from("kanban_columns").delete().eq("id", colId);
    if (error) {
      toast.error("Erro ao remover coluna");
      return;
    }
    toast.success("Coluna removida!");
    fetchData();
  };

  // Open board dialog for creating
  const openNewBoardDialog = () => {
    setEditingBoard(null);
    setBoardName("");
    setBoardDescription("");
    setBoardIcon("vendas");
    setBoardColor(COLUMN_COLORS[0]);
    setBoardIsDefault(false);
    setShowBoardDialog(true);
  };

  // Open board dialog for editing
  const openEditBoardDialog = (b: Board, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingBoard(b);
    setBoardName(b.name);
    setBoardDescription(b.description || "");
    setBoardIcon(b.icon || "vendas");
    setBoardColor(b.color || COLUMN_COLORS[0]);
    setBoardIsDefault(b.isDefault || false);
    setShowBoardDialog(true);
  };

  // Save board (create or update)
  const handleSaveBoard = async () => {
    if (!boardName.trim() || !user) return;
    if (editingBoard) {
      // Update
      const { error } = await supabase.from("kanban_boards").update({
        name: boardName.trim(),
        description: boardDescription.trim() || null,
        icon: boardIcon,
        color: boardColor,
        is_default: boardIsDefault,
      } as any).eq("id", editingBoard.id);
      if (error) { toast.error("Erro ao editar board"); return; }
      toast.success("Board atualizado!");
    } else {
      // Create
      const { data, error } = await supabase.from("kanban_boards").insert({
        user_id: user.id,
        name: boardName.trim(),
        description: boardDescription.trim() || null,
        icon: boardIcon,
        color: boardColor,
        is_default: boardIsDefault,
      } as any).select().single();
      if (error) { toast.error("Erro ao criar board"); return; }
      // Add a default column
      await supabase.from("kanban_columns").insert({
        board_id: data.id,
        name: "Novo Lead",
        color: "#3B82F6",
        position: 0,
        is_default: true,
        is_finalized: false,
      });
      toast.success("Board criado!");
    }
    setShowBoardDialog(false);
    fetchData();
  };

  // Delete board
  const handleDeleteBoard = async () => {
    if (!editingBoard) return;
    if (editingBoard.columns.some(c => c.contacts.length > 0)) {
      toast.error("Remova todos os contatos das colunas antes de excluir o board.");
      return;
    }
    const confirmed = confirm("Tem certeza que deseja excluir este board?");
    if (!confirmed) return;
    // Delete columns first
    await supabase.from("kanban_columns").delete().eq("board_id", editingBoard.id);
    const { error } = await supabase.from("kanban_boards").delete().eq("id", editingBoard.id);
    if (error) { toast.error("Erro ao excluir board"); return; }
    toast.success("Board excluído!");
    setShowBoardDialog(false);
    setActiveBoardId("");
    fetchData();
  };

  const getInitials = (name: string) => {
    return name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (showDashboard) {
    return (
      <KanbanDashboard
        board={board}
        unassigned={unassigned}
        onBack={() => setShowDashboard(false)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-card shrink-0">
        <div className="flex items-center gap-4">
          {/* Board selector */}
          <DropdownMenu>
             <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-3 py-2 h-auto hover:bg-muted/50">
                <BarChart3 className="h-4 w-4 text-primary" />
                <span className="font-semibold">{board.name}</span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64 p-2">
              <p className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Boards</p>
              {boards.map((b) => (
                <DropdownMenuItem
                  key={b.id}
                  onClick={() => setActiveBoardId(b.id)}
                  className="flex items-center justify-between rounded-md px-2 py-2.5 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{b.name}</span>
                        {b.isDefault && (
                          <Badge className="text-[9px] px-1.5 py-0 bg-muted text-muted-foreground border-0 rounded-sm">Padrão</Badge>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {b.columns?.length || 0} colunas • {b.columns?.reduce((s: number, c: any) => s + (c.contacts?.length || 0), 0) || 0} contatos
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => openEditBoardDialog(b, e)}
                    className="p-1 rounded-md hover:bg-muted transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5 text-muted-foreground opacity-60 hover:opacity-100" />
                  </button>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={openNewBoardDialog} className="text-foreground/70 rounded-md px-2 py-2 cursor-pointer mt-1">
                <Plus className="h-4 w-4 mr-2" />
                Criar novo board
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="text-sm text-muted-foreground">{totalContacts} contatos</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-48 bg-muted/50"
            />
          </div>

          {/* Filters */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Filter className="h-4 w-4" />
                Filtros
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-4">
              <div className="space-y-5">
                <div>
                  <p className="text-sm font-medium text-foreground mb-2.5">Ordenar por</p>
                  <div className="flex gap-1.5">
                    {([
                      { key: "recente", icon: "↕", label: "Recente" },
                      { key: "antigo", icon: "↕", label: "Antigo" },
                      { key: "nome", icon: "↕", label: "Nome" },
                    ] as const).map((s) => (
                      <Button
                        key={s.key}
                        size="sm"
                        variant={sortBy === s.key ? "default" : "ghost"}
                        onClick={() => setSortBy(sortBy === s.key ? "" : s.key)}
                        className={cn(
                          "text-xs gap-1.5 rounded-lg px-3",
                          sortBy === s.key
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        )}
                      >
                        {s.icon} {s.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-1.5 flex items-center gap-1.5">
                    <span>🏷</span> Tags
                  </p>
                  <p className="text-xs text-muted-foreground ml-0.5">Nenhuma tag</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
                    <span>📅</span> Período
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      placeholder="dd/mm/aaaa"
                      className="text-xs"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                    />
                    <Input
                      type="date"
                      placeholder="dd/mm/aaaa"
                      className="text-xs"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Dashboard button */}
          <Button variant="outline" className="gap-2" onClick={() => setShowDashboard(true)}>
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </Button>

          <Button size="icon" variant="ghost" className="text-muted-foreground" onClick={() => fetchData()} title="Atualizar">
            <RotateCw className="h-4 w-4" />
          </Button>

          {/* New column */}
          <Button className="gap-2" onClick={() => setShowNewColumn(true)}>
            <Plus className="h-4 w-4" />
            Nova Coluna
          </Button>
        </div>
      </div>

      {/* Status summary bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-card/50 text-xs text-muted-foreground overflow-x-auto shrink-0 scrollbar-none">
        {filteredBoard.columns.map((col) => (
          <span key={col.id} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color }} />
            {col.name}: <span className="text-foreground font-bold">{col.contacts.length}</span>
          </span>
        ))}
        
      </div>

      {/* Kanban board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 flex overflow-x-auto overflow-y-hidden gap-3 p-3 scrollbar-thin">
          

          {filteredBoard.columns.map((col) => (
            <div key={col.id} className="min-w-[300px] max-w-[340px] flex-1 flex flex-col bg-card rounded-lg border border-border">
              {/* Column header with colored top accent */}
              <div className="relative px-3 py-3 flex items-center justify-between rounded-t-lg">
                <div className="absolute top-0 left-0 right-0 h-[3px] rounded-t-lg" style={{ backgroundColor: col.color }} />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: col.color }} />
                    <span className="text-sm font-semibold text-foreground">{col.name}</span>
                    <Badge className="text-[10px] px-1.5 h-5 font-semibold bg-muted text-foreground border-border rounded-md shadow-sm">{col.contacts.length}</Badge>
                  </div>
                  {(col.isDefault || col.isFinalized) && (
                    <div className="flex items-center gap-1.5 ml-4">
                      {col.isDefault && (
                        <Badge className="text-[10px] px-1.5 py-0.5 rounded-sm bg-green-600 text-white border-0">Padrão</Badge>
                      )}
                      {col.isFinalized && (
                        <Badge className="text-[10px] px-1.5 py-0.5 rounded-sm bg-secondary text-muted-foreground border-0">Finalizado</Badge>
                      )}
                    </div>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => openEditColumn(col)}>Editar coluna</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteColumn(col.id, col.contacts.length)}>Remover coluna</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Droppable droppableId={col.id}>
                {(provided, snap) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex-1 p-2 space-y-2 overflow-visible min-h-[120px] transition-[background-color,box-shadow,border-color] duration-200 ease-out",
                      snap.isDraggingOver
                        ? "bg-primary/5 ring-2 ring-inset ring-primary/20 rounded-b-lg"
                        : "bg-transparent"
                    )}
                  >
                    {col.contacts.length === 0 && !snap.isDraggingOver && (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/40">
                        <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                          <User className="h-6 w-6" />
                        </div>
                        <p className="text-xs font-medium">Nenhum contato</p>
                        <p className="text-[11px] mt-0.5">Arraste um card para cá</p>
                      </div>
                    )}
                    {snap.isDraggingOver && col.contacts.length === 0 && (
                      <div className="border-2 border-dashed border-primary/30 rounded-xl h-20 flex items-center justify-center">
                        <p className="text-xs text-primary/60 font-medium">Solte aqui</p>
                      </div>
                    )}
                    {col.contacts.map((contact, index) => (
                      <Draggable key={contact.id} draggableId={contact.id} index={index}>
                        {(prov, snap2) => (
                          <ContactCard
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                            contact={contact}
                            isDragging={snap2.isDragging}
                            isSelected={chatContact?.id === contact.id}
                            onChat={() => setChatContact(contact)}
                            getInitials={getInitials}
                            columnColor={col.color}
                            userName={userName}
                          />
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>

      {/* New Column Dialog */}
      <Dialog open={showNewColumn} onOpenChange={setShowNewColumn}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Coluna</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Nome</label>
              <Input
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="Ex: Em Negociação"
                className="border-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Cor</label>
              <div className="flex flex-wrap gap-2">
                {COLUMN_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColColor(c)}
                    className={cn(
                      "h-8 w-8 rounded-full transition-all",
                      newColColor === c && "ring-2 ring-offset-2 ring-offset-background ring-primary"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <Checkbox checked={newColDefault} onCheckedChange={(v) => setNewColDefault(!!v)} />
                Coluna padrão para novos leads
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <Checkbox checked={newColFinalized} onCheckedChange={(v) => setNewColFinalized(!!v)} />
                Marca como finalizado
              </label>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowNewColumn(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleAddColumn}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Column Dialog */}
      <Dialog open={!!editCol} onOpenChange={(open) => { if (!open) setEditCol(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Coluna</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Nome</label>
              <Input
                value={editColName}
                onChange={(e) => setEditColName(e.target.value)}
                placeholder="Nome da coluna"
                className="border-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Cor</label>
              <div className="flex flex-wrap gap-2">
                {COLUMN_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditColColor(c)}
                    className={cn(
                      "h-8 w-8 rounded-full transition-all",
                      editColColor === c && "ring-2 ring-offset-2 ring-offset-background ring-primary"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <Checkbox checked={editColDefault} onCheckedChange={(v) => setEditColDefault(!!v)} />
                Coluna padrão para novos leads
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <Checkbox checked={editColFinalized} onCheckedChange={(v) => setEditColFinalized(!!v)} />
                Marca como finalizado
              </label>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setEditCol(null)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={handleEditColumn}>
                Salvar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Board Edit/Create Dialog */}
      <Dialog open={showBoardDialog} onOpenChange={setShowBoardDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingBoard ? "Editar Board" : "Novo Board"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Nome</label>
              <Input
                value={boardName}
                onChange={(e) => setBoardName(e.target.value)}
                placeholder="Ex: Pipeline de Vendas"
                className="border-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Descrição (opcional)</label>
              <textarea
                value={boardDescription}
                onChange={(e) => setBoardDescription(e.target.value)}
                placeholder="Descreva o propósito deste board..."
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Ícone</label>
              <div className="flex flex-wrap gap-2">
                {BOARD_ICONS.map((ic) => (
                  <button
                    key={ic.id}
                    onClick={() => setBoardIcon(ic.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm transition-all",
                      boardIcon === ic.id
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    <span>{ic.icon}</span>
                    <span>{ic.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Cor</label>
              <div className="flex flex-wrap gap-2">
                {COLUMN_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setBoardColor(c)}
                    className={cn(
                      "h-8 w-8 rounded-full transition-all",
                      boardColor === c && "ring-2 ring-offset-2 ring-offset-background ring-primary"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <Checkbox checked={boardIsDefault} onCheckedChange={(v) => setBoardIsDefault(!!v)} />
              Board padrão
            </label>
            <div className="flex items-center gap-3">
              {editingBoard && (
                <button
                  onClick={handleDeleteBoard}
                  className="text-sm text-destructive hover:text-destructive/80 font-medium mr-auto"
                >
                  Excluir
                </button>
              )}
              <div className="flex gap-3 ml-auto">
                <Button variant="outline" onClick={() => setShowBoardDialog(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveBoard}>
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {chatContact && (
        <ChatModal
          contact={chatContact}
          onClose={() => setChatContact(null)}
          getInitials={getInitials}
        />
      )}
    </div>
  );
};

// --- Contact Card Component ---

interface ContactCardProps {
  contact: KanbanContact;
  isDragging: boolean;
  isSelected?: boolean;
  onChat: () => void;
  getInitials: (name: string) => string;
  columnColor?: string;
  userName?: string;
  [key: string]: any;
}

const ContactCard = forwardRef<HTMLDivElement, ContactCardProps>(
  ({ contact, isDragging, isSelected, onChat, getInitials, columnColor, userName, ...props }, ref) => {
    const statusConfig = {
      aguardando: { dot: "bg-warning", label: "Aguardando", showAssignee: false },
      atendendo: { dot: "bg-success", label: "Em atendimento", showAssignee: true },
      encerrada: { dot: "bg-muted-foreground", label: "Encerrada", showAssignee: true },
    };
    const st = statusConfig[contact.status] || statusConfig.aguardando;

    return (
      <div
        ref={ref}
        {...props}
        onClick={onChat}
        className={cn(
          "rounded-xl bg-background border border-border p-3 cursor-grab active:cursor-grabbing transition-[box-shadow,border-color,background-color,opacity] duration-150 ease-out",
          !isSelected && !isDragging && "hover:border-blue-500/60 hover:shadow-md",
          isSelected && "border-primary ring-2 ring-primary/20 shadow-md",
          isDragging && "shadow-2xl ring-2 ring-primary/30 z-50 border-primary/50 bg-background/95 !cursor-grabbing opacity-95"
        )}
        style={{
          ...props.style,
          ...(isDragging && columnColor ? { borderLeftColor: columnColor, borderLeftWidth: 3 } : {}),
        }}
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0 ring-1 ring-border/50">
            {contact.avatar_url ? (
              <img src={contact.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
            ) : (
              getInitials(contact.name)
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{contact.name}</p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {contact.phone}
            </p>
          </div>
          {contact.unreadCount && contact.unreadCount > 0 ? (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-success px-1.5 text-[10px] font-semibold text-success-foreground">
              {contact.unreadCount > 99 ? "99+" : contact.unreadCount}
            </span>
          ) : null}
        </div>
        {contact.lastMessage && (
          <div className="mt-2 rounded-lg bg-muted/40 px-2.5 py-1.5 border border-border/30">
            <p className="text-xs text-muted-foreground truncate">{contact.lastMessage}</p>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          {contact.lastMessageTime && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {contact.lastMessageTime}
            </span>
          )}
          <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 ml-auto">
            <span className={cn("h-2 w-2 rounded-full shrink-0", st.dot)} />
            {st.label}
            {st.showAssignee && userName && (
              <span>• {userName.split(" ")[0]}</span>
            )}
          </span>
        </div>
        {contact.contact_id && (
          <div className="mt-2 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
            <TagSelector contactId={contact.contact_id} compact />
          </div>
        )}
      </div>
    );
  }
);
ContactCard.displayName = "ContactCard";

// --- Chat Modal Component ---
interface ChatModalProps {
  contact: KanbanContact;
  onClose: () => void;
  getInitials: (name: string) => string;
}

interface ChatMessage {
  id: string;
  body: string;
  from_me: boolean;
  status: string;
  created_at: string;
  media_url?: string | null;
  media_type?: string | null;
}

const ChatModal = ({ contact, onClose, getInitials }: ChatModalProps) => {
  const { user } = useAuth();
  const [msg, setMsg] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState("");
  const [instanceConnected, setInstanceConnected] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { uploading, fileInputRef, openFilePicker, uploadAndSend } = useMediaUpload();
  const [profileName, setProfileName] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

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

  const resolveContactId = useCallback(async (createIfMissing = false) => {
    if (contact.contact_id) return contact.contact_id;
    if (!contact.phone) return null;

    const { data: existingContacts, error: findContactError } = await supabase
      .from("contacts")
      .select("id")
      .eq("phone", contact.phone)
      .limit(1);

    if (findContactError) throw findContactError;

    const existingId = existingContacts?.[0]?.id;
    if (existingId) return existingId;
    if (!createIfMissing) return null;

    const { data: newContact, error: createContactError } = await supabase
      .from("contacts")
      .insert({ phone: contact.phone, name: contact.name || null })
      .select("id")
      .single();

    if (createContactError) throw createContactError;
    return newContact?.id || null;
  }, [contact.contact_id, contact.phone, contact.name]);

  // Load instance, conversation, and messages
  useEffect(() => {
    if (!user) return;

    let isMounted = true;

    const init = async () => {
      try {
        setMessages([]);
        setConversationId(null);

        const [{ data: inst, error: instanceError }, foundContactId] = await Promise.all([
          supabase
            .from("evolution_connections")
            .select("instance_name, status")
            .eq("user_id", user.id)
            .limit(1),
          resolveContactId(false),
        ]);

        if (instanceError) throw instanceError;
        if (!isMounted) return;

        const iName = inst?.[0]?.instance_name || "";
        const iStatus = inst?.[0]?.status || "";
        setInstanceName(iName);
        setInstanceConnected(iStatus === "open" || iStatus === "connected");

        if (!foundContactId) return;

        const { data: convos, error: convoError } = await supabase
          .from("conversations")
          .select("id, instance_name")
          .eq("contact_id", foundContactId)
          .order("last_message_at", { ascending: false })
          .limit(1);

        if (convoError) throw convoError;
        if (!isMounted || !convos?.length) return;

        const cId = convos[0].id;
        setConversationId(cId);

        if (!iName && convos[0].instance_name) {
          setInstanceName(convos[0].instance_name);
        }

        const { data: msgs, error: messagesError } = await supabase
          .from("messages")
          .select("id, body, from_me, status, created_at, media_url, media_type")
          .eq("conversation_id", cId)
          .order("created_at", { ascending: true });

        if (messagesError) throw messagesError;
        if (!isMounted) return;

        setMessages((msgs as ChatMessage[]) || []);
      } catch (error) {
        console.error("Chat modal init error:", error);
        toast.error("Erro ao carregar conversa");
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, [user, resolveContactId]);

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`kanban-chat-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;

            const withoutMatchedOptimistic = prev.filter(
              (m) => !(m.id.startsWith("temp-") && m.body === newMsg.body && m.from_me === newMsg.from_me)
            );

            return [...withoutMatchedOptimistic, newMsg];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const signaturePrefix = signing && profileName ? `${profileName}:\n` : "";
    const text = signaturePrefix + msg.trim();
    if (!msg.trim() || sending) return;

    if (!instanceName) {
      toast.error("Conecte uma instância do WhatsApp antes de enviar.");
      return;
    }

    setSending(true);
    setMsg("");

    // Optimistic
    const optimistic: ChatMessage = {
      id: `temp-${Date.now()}`,
      body: text,
      from_me: true,
      status: "sending",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      // If no conversation yet, create one
      let cId = conversationId;
      if (!cId) {
        const targetContactId = await resolveContactId(true);
        if (!targetContactId) {
          throw new Error("Contato não encontrado para iniciar conversa");
        }

        const { data: newConvo, error: createConversationError } = await supabase
          .from("conversations")
          .insert({ contact_id: targetContactId, instance_name: instanceName, status: "open" })
          .select("id")
          .single();

        if (createConversationError) throw createConversationError;
        if (!newConvo?.id) throw new Error("Falha ao criar conversa");

        cId = newConvo.id;
        setConversationId(cId);
      }

      await sendMessage(instanceName, contact.phone, text);

      const { error: insertMessageError } = await supabase.from("messages").insert({
        conversation_id: cId,
        body: text,
        from_me: true,
        status: "sent",
      });

      if (insertMessageError) throw insertMessageError;

      const { error: updateConversationError } = await supabase
        .from("conversations")
        .update({ last_message_at: new Date().toISOString(), status: "open" })
        .eq("id", cId);

      if (updateConversationError) throw updateConversationError;
    } catch (err) {
      console.error("Send error:", err);
      toast.error("Erro ao enviar mensagem");
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setMsg(text);
    } finally {
      setSending(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!instanceName) {
      toast.error("Conecte uma instância do WhatsApp antes de enviar.");
      return;
    }

    // Ensure conversation exists
    let cId = conversationId;
    if (!cId) {
      const targetContactId = await resolveContactId(true);
      if (!targetContactId) {
        toast.error("Contato não encontrado");
        return;
      }
      const { data: newConvo } = await supabase
        .from("conversations")
        .insert({ contact_id: targetContactId, instance_name: instanceName, status: "open" })
        .select("id")
        .single();
      if (!newConvo?.id) {
        toast.error("Erro ao criar conversa");
        return;
      }
      cId = newConvo.id;
      setConversationId(cId);
    }

    await uploadAndSend({
      file,
      instanceName,
      phone: contact.phone,
      conversationId: cId,
      onOptimistic: (opt) => {
        setMessages((prev) => [...prev, {
          id: opt.id,
          body: opt.body,
          from_me: true,
          status: "sending",
          created_at: new Date().toISOString(),
          media_url: opt.mediaUrl,
          media_type: opt.mediaType,
        }]);
      },
      onError: () => {
        setMessages((prev) => prev.filter((m) => !m.id.startsWith("temp-media-")));
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md h-[500px] bg-card rounded-xl border border-border flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary overflow-hidden">
                {contact.avatar_url ? (
                  <img src={contact.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  getInitials(contact.name)
                )}
              </div>
              {/* Connection status dot */}
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card",
                  instanceConnected === true && "bg-green-500",
                  instanceConnected === false && "bg-destructive",
                  instanceConnected === null && "bg-muted-foreground animate-pulse"
                )}
                title={
                  instanceConnected === true ? "WhatsApp conectado" :
                  instanceConnected === false ? "WhatsApp desconectado" :
                  "Verificando conexão..."
                }
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{contact.name}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                {contact.phone}
                <span className={cn(
                  "text-[10px]",
                  instanceConnected === true ? "text-green-500" : instanceConnected === false ? "text-destructive" : "text-muted-foreground"
                )}>
                  • {instanceConnected === true ? "Conectado" : instanceConnected === false ? "Desconectado" : "Verificando..."}
                </span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground"
              title="Abrir na página de conversas"
              onClick={() => navigate(`/inbox?phone=${encodeURIComponent(contact.phone)}`)}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 p-4 overflow-y-auto bg-muted/10 space-y-2">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.from_me ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[80%] rounded-xl px-3 py-2",
                  m.from_me
                    ? "rounded-tr-sm bg-primary text-primary-foreground"
                    : "rounded-tl-sm bg-muted/50 border border-border"
                )}
              >
                {m.from_me && signing && profileName && (
                  <p className="text-[10px] font-semibold opacity-80 mb-0.5">{profileName}</p>
                )}
                {m.media_url && m.media_type ? (
                  <MediaMessage
                    mediaUrl={m.media_url}
                    mediaType={m.media_type}
                    body={m.body}
                    fromMe={m.from_me}
                  />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                )}
                <p className={cn("text-[10px] mt-1", m.from_me ? "opacity-60" : "text-muted-foreground")}>
                  {getRelativeTime(m.created_at)}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <form onSubmit={handleSend} className="border-t border-border p-3">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
            onChange={handleFileUpload}
          />
          {instanceConnected === false && (
            <p className="text-[11px] text-destructive mb-2 text-center">⚠ WhatsApp desconectado. Conecte uma instância para enviar.</p>
          )}
          <div className="flex gap-1 items-center">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="shrink-0 text-muted-foreground hover:text-foreground h-8 w-8"
              onClick={openFilePicker}
              disabled={instanceConnected === false || uploading}
              title="Enviar arquivo"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Input
              placeholder={uploading ? "Enviando arquivo..." : signing ? `Assinando como ${profileName || "Atendente"}...` : "Digite uma mensagem..."}
              className="flex-1 bg-muted/50"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              disabled={instanceConnected === false || uploading}
            />
            <EmojiPicker
              onSelect={(emoji) => setMsg((prev) => prev + emoji)}
              disabled={instanceConnected === false || uploading}
            />
            <SignatureButton
              userName={profileName}
              signing={signing}
              onToggle={async () => { const next = !signing; setSigning(next); if (user) { const { error } = await supabase.from("profiles").update({ signing_enabled: next }).eq("id", user.id); if (error) setSigning(!next); } }}
              disabled={instanceConnected === false || uploading}
            />
            <QuickMessagesButton
              onSelect={(text) => setMsg(text)}
              disabled={instanceConnected === false || uploading}
            />
            <StickerPicker
              onSelect={(sticker) => setMsg(sticker)}
              disabled={instanceConnected === false || uploading}
            />
            {msg.trim() ? (
              <Button type="submit" size="icon" className="shrink-0 h-8 w-8" disabled={sending || uploading || instanceConnected === false}>
                <Send className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" size="icon" variant="ghost" className="shrink-0 h-8 w-8 text-primary hover:text-primary" disabled={instanceConnected === false || uploading} title="Gravar áudio">
                <Mic className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default SalesFunnel;
