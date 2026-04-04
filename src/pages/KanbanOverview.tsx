import { useState, useEffect } from "react";
import {
  LayoutDashboard, TrendingUp, Clock, AlertTriangle, RefreshCw, Columns
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface KanbanBoard {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
}

interface KanbanColumn {
  id: string;
  board_id: string;
  name: string;
  color: string | null;
  position: number;
}

interface KanbanCard {
  id: string;
  column_id: string;
  board_id: string;
  contact_id: string | null;
  title: string;
  value: number | null;
  updated_at: string;
  created_at: string;
}

interface Contact {
  id: string;
  name: string;
}

interface ColumnWithCards extends KanbanColumn {
  cards: KanbanCard[];
}

interface BoardWithData extends KanbanBoard {
  columns: ColumnWithCards[];
}

interface StaleCard {
  card: KanbanCard;
  columnName: string;
  boardName: string;
  boardId: string;
  contactName: string;
  daysStale: number;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

const daysBetween = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

const KanbanOverview = () => {
  const { user } = useAuth();
  const [boards, setBoards] = useState<BoardWithData[]>([]);
  const [contactMap, setContactMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  useEffect(() => {
    loadAll();
  }, [user]);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Load boards
      const { data: boardsData, error: boardsErr } = await supabase
        .from("kanban_boards" as any)
        .select("*")
        .eq("user_id", user.id)
        .order("created_at");
      if (boardsErr) throw boardsErr;

      const rawBoards: KanbanBoard[] = (boardsData || []) as KanbanBoard[];
      if (rawBoards.length === 0) {
        setBoards([]);
        setLoading(false);
        return;
      }

      const boardIds = rawBoards.map(b => b.id);

      // Load columns and cards in parallel
      const [colsRes, cardsRes] = await Promise.all([
        supabase.from("kanban_columns" as any).select("*").in("board_id", boardIds).order("position"),
        supabase.from("kanban_cards" as any).select("*").in("board_id", boardIds),
      ]);

      const rawColumns: KanbanColumn[] = (colsRes.data || []) as KanbanColumn[];
      const rawCards: KanbanCard[] = (cardsRes.data || []) as KanbanCard[];

      // Load contacts for cards that have contact_id
      const contactIds = [...new Set(rawCards.map(c => c.contact_id).filter(Boolean) as string[])];
      const cMap = new Map<string, string>();
      if (contactIds.length > 0) {
        const { data: contactsData } = await supabase
          .from("contacts")
          .select("id, name")
          .in("id", contactIds);
        (contactsData || []).forEach((c: any) => cMap.set(c.id, c.name));
      }
      setContactMap(cMap);

      // Assemble boards
      const enriched: BoardWithData[] = rawBoards.map(board => {
        const boardColumns = rawColumns
          .filter(col => col.board_id === board.id)
          .map(col => ({
            ...col,
            cards: rawCards.filter(card => card.column_id === col.id),
          }));
        return { ...board, columns: boardColumns };
      });

      setBoards(enriched);
      setLastRefresh(new Date());
    } catch (err: any) {
      console.error("Error loading kanban overview:", err);
    } finally {
      setLoading(false);
    }
  };

  // Aggregate stats
  const totalBoards = boards.length;
  const allCards = boards.flatMap(b => b.columns.flatMap(c => c.cards));
  const totalCards = allCards.length;
  const staleThreshold = 7;
  const staleCards: StaleCard[] = [];
  for (const board of boards) {
    for (const col of board.columns) {
      for (const card of col.cards) {
        const days = daysBetween(card.updated_at || card.created_at);
        if (days >= staleThreshold) {
          staleCards.push({
            card,
            columnName: col.name,
            boardName: board.name,
            boardId: board.id,
            contactName: card.contact_id ? (contactMap.get(card.contact_id) || card.title) : card.title,
            daysStale: days,
          });
        }
      }
    }
  }
  staleCards.sort((a, b) => b.daysStale - a.daysStale);

  const totalValue = allCards.reduce((sum, c) => sum + (c.value || 0), 0);

  // Funnel data: aggregate across all boards by column position
  // Build a merged funnel from all columns (grouped by position order)
  const funnelStages: { name: string; count: number; value: number; color: string }[] = [];
  for (const board of boards) {
    for (const col of board.columns) {
      const existing = funnelStages.find(s => s.name === col.name);
      const colValue = col.cards.reduce((sum, c) => sum + (c.value || 0), 0);
      if (existing) {
        existing.count += col.cards.length;
        existing.value += colValue;
      } else {
        funnelStages.push({
          name: col.name,
          count: col.cards.length,
          value: colValue,
          color: col.color || "#3B82F6",
        });
      }
    }
  }

  const maxCount = Math.max(...funnelStages.map(s => s.count), 1);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
          <div>
            <h1 className="text-xl font-bold text-blue-600">Visão Geral — Funil de Vendas</h1>
            {lastRefresh && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Atualizado às {lastRefresh.toLocaleTimeString("pt-BR")}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={loadAll} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="p-6 space-y-8">
            {/* Stats cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <LayoutDashboard className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total de Quadros</p>
                  <p className="text-2xl font-bold">{totalBoards}</p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <Columns className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total de Cards</p>
                  <p className="text-2xl font-bold">{totalCards}</p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sem atividade (7d+)</p>
                  <p className="text-2xl font-bold">{staleCards.length}</p>
                </div>
              </Card>
              <Card className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                  <TrendingUp className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor Total Est.</p>
                  <p className="text-lg font-bold">{formatCurrency(totalValue)}</p>
                </div>
              </Card>
            </div>

            {boards.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <LayoutDashboard className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Nenhum quadro Kanban encontrado</p>
                <p className="text-sm mt-1">Crie quadros Kanban para visualizar o funil aqui.</p>
              </div>
            ) : (
              <>
                {/* Funnel chart */}
                {funnelStages.length > 0 && (
                  <Card className="p-5">
                    <h2 className="font-semibold text-sm text-foreground mb-4 flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-600" />
                      Funil de Atendimento (todas as etapas)
                    </h2>
                    <div className="space-y-2">
                      {funnelStages.map((stage, idx) => {
                        const widthPct = maxCount > 0 ? Math.max(8, (stage.count / maxCount) * 100) : 8;
                        return (
                          <div key={idx} className="flex items-center gap-3">
                            <div className="w-28 text-xs text-muted-foreground text-right shrink-0 truncate" title={stage.name}>
                              {stage.name}
                            </div>
                            <div className="flex-1 h-8 bg-muted rounded-sm overflow-hidden">
                              <div
                                className="h-full flex items-center px-3 rounded-sm transition-all duration-500"
                                style={{
                                  width: `${widthPct}%`,
                                  backgroundColor: stage.color,
                                  minWidth: "2rem",
                                }}
                              >
                                <span className="text-white text-xs font-semibold truncate">
                                  {stage.count}
                                </span>
                              </div>
                            </div>
                            <div className="w-28 text-xs text-muted-foreground shrink-0">
                              {stage.value > 0 ? formatCurrency(stage.value) : "—"}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}

                {/* Per-board sections */}
                <div className="space-y-6">
                  <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4 text-blue-600" />
                    Quadros
                  </h2>
                  {boards.map(board => {
                    const boardCards = board.columns.flatMap(c => c.cards);
                    const boardValue = boardCards.reduce((sum, c) => sum + (c.value || 0), 0);
                    return (
                      <Card key={board.id} className="p-5">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <LayoutDashboard className="h-4 w-4 text-blue-600" />
                            <h3 className="font-semibold text-sm">{board.name}</h3>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{boardCards.length} card{boardCards.length !== 1 ? "s" : ""}</span>
                            {boardValue > 0 && <span>{formatCurrency(boardValue)}</span>}
                          </div>
                        </div>

                        {board.columns.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sem colunas neste quadro.</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {board.columns.map(col => {
                              const colValue = col.cards.reduce((s, c) => s + (c.value || 0), 0);
                              const topContacts = col.cards.slice(0, 3).map(card =>
                                card.contact_id
                                  ? (contactMap.get(card.contact_id) || card.title)
                                  : card.title
                              );
                              return (
                                <div
                                  key={col.id}
                                  className="rounded-lg border border-border p-3 space-y-2 bg-card"
                                >
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="h-2.5 w-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: col.color || "#3B82F6" }}
                                    />
                                    <p className="text-xs font-semibold truncate">{col.name}</p>
                                    <Badge variant="secondary" className="text-[10px] ml-auto shrink-0">
                                      {col.cards.length}
                                    </Badge>
                                  </div>
                                  {colValue > 0 && (
                                    <p className="text-[10px] text-muted-foreground">{formatCurrency(colValue)}</p>
                                  )}
                                  {topContacts.length > 0 ? (
                                    <ul className="space-y-0.5">
                                      {topContacts.map((name, i) => (
                                        <li key={i} className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                          <span className="h-1 w-1 rounded-full bg-muted-foreground shrink-0" />
                                          {name}
                                        </li>
                                      ))}
                                      {col.cards.length > 3 && (
                                        <li className="text-[10px] text-muted-foreground pl-2">
                                          +{col.cards.length - 3} mais
                                        </li>
                                      )}
                                    </ul>
                                  ) : (
                                    <p className="text-xs text-muted-foreground italic">Sem cards</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>

                {/* Stale cards section */}
                {staleCards.length > 0 && (
                  <Card className="p-5">
                    <h2 className="font-semibold text-sm text-foreground flex items-center gap-2 mb-4">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      Cards sem atividade ({staleCards.length})
                    </h2>
                    <div className="space-y-2">
                      {staleCards.map(({ card, columnName, boardName, contactName, daysStale }) => (
                        <div
                          key={card.id}
                          className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border bg-amber-50 dark:bg-amber-950/10"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{contactName}</p>
                              <p className="text-xs text-muted-foreground">
                                {boardName} → {columnName}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                daysStale >= 14
                                  ? "border-red-400 text-red-600"
                                  : "border-amber-400 text-amber-700"
                              )}
                            >
                              <Clock className="h-2.5 w-2.5 mr-1" />
                              {daysStale}d sem atividade
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default KanbanOverview;
