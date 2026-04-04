import { useState, useEffect } from "react";
import { Search, Users, Building2, ArrowRight, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/db";

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
}

const MAX_NOTE_CHARS = 300;

const TransferDialog = ({ open, onOpenChange, onTransfer }: TransferDialogProps) => {
  const [activeTab, setActiveTab] = useState<"atendente" | "categoria">("atendente");
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transferNote, setTransferNote] = useState("");

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      const [{ data: p }, { data: d }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, avatar_url"),
        supabase.from("categories").select("id, name, color"),
      ]);
      setProfiles((p as Profile[]) || []);
      setDepartments((d as Department[]) || []);
    };
    load();
  }, [open]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setSearch("");
      setTransferNote("");
      setActiveTab("atendente");
    }
  }, [open]);

  const filteredProfiles = profiles.filter((p) =>
    (p.full_name || "").toLowerCase().includes(search.toLowerCase())
  );
  const filteredDepts = departments.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedProfile = profiles.find((x) => x.id === selectedId);
  const selectedDept = departments.find((x) => x.id === selectedId);
  const selectedName =
    activeTab === "atendente"
      ? selectedProfile?.full_name || "Atendente"
      : selectedDept?.name || "Categoria";

  const handleTransfer = () => {
    if (!selectedId) return;
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
            Atendente
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

        {/* Context note — shown once an agent is selected */}
        {selectedId && activeTab === "atendente" && (
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />
              <label className="text-xs font-medium text-foreground">
                Observação para {selectedName} (opcional)
              </label>
            </div>
            <textarea
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value.slice(0, MAX_NOTE_CHARS))}
              placeholder={`Deixe uma observação para ${selectedName}...`}
              rows={3}
              className="w-full text-xs rounded-md border border-border bg-background px-2.5 py-2 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[10px] text-muted-foreground text-right">
              {transferNote.length}/{MAX_NOTE_CHARS}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="flex-1 gap-2" onClick={handleTransfer} disabled={!selectedId}>
            <ArrowRight className="h-4 w-4" />
            Transferir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TransferDialog;
