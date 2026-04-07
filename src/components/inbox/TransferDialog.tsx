import { useState, useEffect } from "react";
import { Search, Users, Building2, ArrowRight, ClipboardList, MessageSquare, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { db } from "@/lib/db";
import api from "@/lib/api";
import { toast } from "sonner";

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Department {
  id: string;
  name: string;
  color: string;
}

interface TransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransfer: (type: "user" | "department", targetId: string, targetName: string, note: string) => void;
  conversationId?: string;
  recentMessages?: { body: string; from_me: boolean; created_at: string }[];
}

interface Team {
  id: string;
  name: string;
}

const MAX_NOTE_CHARS = 300;

const TransferDialog = ({ open, onOpenChange, onTransfer, conversationId, recentMessages = [] }: TransferDialogProps) => {
  const [activeTab, setActiveTab] = useState<"atendente" | "time" | "categoria">("atendente");
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transferNote, setTransferNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [showSummaryPreview, setShowSummaryPreview] = useState(false);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const [{ data: p }, { data: d }] = await Promise.all([
        db.from("profiles").select("id, full_name, avatar_url"),
        db.from("categories").select("id, name, color"),
      ]);
      setProfiles((p as Profile[]) || []);
      setDepartments((d as Department[]) || []);
      // Load teams
      try {
        const teamsData = await api.get<Team[]>('/teams');
        setTeams(Array.isArray(teamsData) ? teamsData : []);
      } catch {
        setTeams([]);
      }
      // Load AI summary if conversationId provided
      if (conversationId) {
        setSummaryLoading(true);
        try {
          const sum = await api.get<{ summary: string; next_steps?: string[] }>(`/conversations/${conversationId}/summary`);
          if (sum?.summary) {
            let text = sum.summary;
            const steps = sum.next_steps;
            if (Array.isArray(steps) && steps.length) {
              text += '\n\nPróximos passos: ' + steps.join(' | ');
            }
            setSummaryText(text);
            setIncludeSummary(true);
          }
        } catch {
          setSummaryText(null);
          setIncludeSummary(false);
        } finally {
          setSummaryLoading(false);
        }
      }
    };
    load();
  }, [open, conversationId]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setSearch("");
      setTransferNote("");
      setActiveTab("atendente" as const);
      setSummaryText(null);
      setIncludeSummary(true);
      setShowSummaryPreview(false);
    }
  }, [open]);

  const filteredProfiles = profiles.filter((p) =>
    (p.full_name || "").toLowerCase().includes(search.toLowerCase())
  );
  const filteredTeams = teams.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );
  const filteredDepts = departments.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedProfile = profiles.find((x) => x.id === selectedId);
  const selectedTeam = teams.find((x) => x.id === selectedId);
  const selectedDept = departments.find((x) => x.id === selectedId);
  const selectedName =
    activeTab === "atendente"
      ? selectedProfile?.full_name || "Atendente"
      : activeTab === "time"
      ? selectedTeam?.name || "Time"
      : selectedDept?.name || "Categoria";

  const noteValid = transferNote.trim().length >= 5;

  const handleTransfer = async () => {
    if (!selectedId) return;
    if (!noteValid) { toast.error("Nota de transferência obrigatória (mínimo 5 caracteres)"); return; }

    // If we have conversationId, use the new backend endpoint
    if (conversationId) {
      setSaving(true);
      try {
        await api.post(`/conversations/${conversationId}/transfer`, {
          agent_id: activeTab === "atendente" ? selectedId : undefined,
          team_id: activeTab === "time" ? selectedId : undefined,
          note: transferNote,
          include_summary: includeSummary && !!summaryText,
        });
        toast.success(`Conversa transferida para ${selectedName} com contexto`);
        onTransfer(
          activeTab === "atendente" ? "user" : "department",
          selectedId,
          selectedName,
          transferNote
        );
        onOpenChange(false);
      } catch (e: any) {
        toast.error(e?.message || "Erro ao transferir conversa");
      } finally {
        setSaving(false);
      }
      return;
    }

    // Fallback to legacy onTransfer callback
    if (activeTab === "atendente") {
      onTransfer("user", selectedId, selectedProfile?.full_name || "Atendente", transferNote);
    } else {
      onTransfer("department", selectedId, selectedDept?.name || "Categoria", transferNote);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir Conversa</DialogTitle>
          <p className="text-sm text-muted-foreground">Selecione para quem transferir</p>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => { setActiveTab("atendente"); setSelectedId(null); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === "atendente"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-4 w-4" />
            Agente
          </button>
          <button
            onClick={() => { setActiveTab("time"); setSelectedId(null); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === "time"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Users className="h-4 w-4" />
            Time
          </button>
          <button
            onClick={() => { setActiveTab("categoria"); setSelectedId(null); }}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === "categoria"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Building2 className="h-4 w-4" />
            Categoria
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={activeTab === "atendente" ? "Buscar atendente..." : "Buscar categoria..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* List */}
        <div className="min-h-[120px] max-h-[200px] overflow-y-auto">
          {activeTab === "atendente" ? (
            filteredProfiles.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum atendente disponível</p>
            ) : (
              filteredProfiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                    selectedId === p.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                    {(p.full_name || "?")[0].toUpperCase()}
                  </div>
                  <span className="text-foreground">{p.full_name || "Sem nome"}</span>
                </button>
              ))
            )
          ) : activeTab === "time" ? (
            filteredTeams.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum time disponível</p>
            ) : (
              filteredTeams.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                    selectedId === t.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                >
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                    <Users className="h-4 w-4" />
                  </div>
                  <span className="text-foreground">{t.name}</span>
                </button>
              ))
            )
          ) : (
            filteredDepts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma categoria disponível</p>
            ) : (
              filteredDepts.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors",
                    selectedId === d.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                >
                  <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ backgroundColor: d.color + "30", color: d.color }}>
                    <Building2 className="h-4 w-4" />
                  </div>
                  <span className="text-foreground">{d.name}</span>
                </button>
              ))
            )
          )}
        </div>

        {/* AI Summary context */}
        {summaryLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" />
            <span>Carregando resumo IA...</span>
          </div>
        ) : summaryText ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium text-foreground">Resumo IA disponível</span>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSummary}
                  onChange={(e) => setIncludeSummary(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                <span className="text-[11px] text-muted-foreground">Incluir no contexto</span>
              </label>
            </div>
            {includeSummary && (
              <div className="rounded-md border border-primary/20 bg-primary/5 overflow-hidden">
                <button
                  onClick={() => setShowSummaryPreview(!showSummaryPreview)}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] text-primary font-medium hover:bg-primary/10 transition-colors"
                >
                  <span>Ver preview do contexto</span>
                  {showSummaryPreview ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {showSummaryPreview && (
                  <div className="px-2.5 pb-2 text-[11px] text-foreground whitespace-pre-wrap max-h-24 overflow-y-auto border-t border-primary/10">
                    {summaryText}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : recentMessages.length > 0 ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Últimas mensagens (contexto)</span>
            </div>
            <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1.5 max-h-28 overflow-y-auto">
              {recentMessages.slice(-3).map((m, i) => (
                <div key={i} className={cn("text-[11px] flex gap-1.5", m.from_me ? "justify-end" : "justify-start")}>
                  <span className={cn("px-2 py-0.5 rounded max-w-[85%] truncate", m.from_me ? "bg-primary/10 text-primary" : "bg-muted text-foreground")}>
                    {m.body?.slice(0, 80) || "..."}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Transfer note — always visible, required */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
            <label className="text-xs font-medium text-foreground">
              Motivo da transferência <span className="text-destructive">*</span>
            </label>
          </div>
          <textarea
            value={transferNote}
            onChange={(e) => setTransferNote(e.target.value.slice(0, MAX_NOTE_CHARS))}
            placeholder="Descreva o motivo da transferência (mínimo 5 caracteres)..."
            rows={3}
            className={cn(
              "w-full text-xs rounded-md border bg-background px-2.5 py-2 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary",
              transferNote.trim().length > 0 && transferNote.trim().length < 5
                ? "border-destructive"
                : "border-border"
            )}
          />
          <div className="flex items-center justify-between">
            {transferNote.trim().length > 0 && transferNote.trim().length < 5 && (
              <p className="text-[10px] text-destructive">Mínimo 5 caracteres</p>
            )}
            <p className="text-[10px] text-muted-foreground ml-auto">
              {transferNote.length}/{MAX_NOTE_CHARS}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="flex-1 gap-2"
            onClick={handleTransfer}
            disabled={!selectedId || !noteValid || saving}
          >
            <ArrowRight className="h-4 w-4" />
            {saving ? "Transferindo..." : "Transferir"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransferDialog;
