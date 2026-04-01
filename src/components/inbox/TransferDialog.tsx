import { useState, useEffect } from "react";
import { Search, Users, Building2, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

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
  onTransfer: (type: "user" | "department", targetId: string, targetName: string) => void;
}

const TransferDialog = ({ open, onOpenChange, onTransfer }: TransferDialogProps) => {
  const [activeTab, setActiveTab] = useState<"atendente" | "categoria">("atendente");
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const filteredProfiles = profiles.filter((p) =>
    (p.full_name || "").toLowerCase().includes(search.toLowerCase())
  );
  const filteredDepts = departments.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleTransfer = () => {
    if (!selectedId) return;
    if (activeTab === "atendente") {
      const p = profiles.find((x) => x.id === selectedId);
      onTransfer("user", selectedId, p?.full_name || "Atendente");
    } else {
      const d = departments.find((x) => x.id === selectedId);
      onTransfer("department", selectedId, d?.name || "Categoria");
    }
    onOpenChange(false);
    setSelectedId(null);
    setSearch("");
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
