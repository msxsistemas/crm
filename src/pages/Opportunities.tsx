import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp, DollarSign, Target, CheckCircle, XCircle,
  Plus, Search, RefreshCw, Pencil, Trash2, User, Calendar, Percent
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { db } from "@/lib/db";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type OpportunityStatus = "prospecting" | "qualification" | "proposal" | "negotiation" | "won" | "lost";

interface Opportunity {
  id: string;
  user_id: string;
  contact_id: string | null;
  title: string;
  value: number;
  probability: number;
  status: OpportunityStatus;
  close_date: string | null;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  contact_name?: string | null;
}

interface Contact {
  id: string;
  name: string;
}

const STATUS_CONFIG: Record<OpportunityStatus, { label: string; color: string }> = {
  prospecting:   { label: "Prospecção",   color: "bg-gray-100 text-gray-700" },
  qualification: { label: "Qualificação", color: "bg-blue-100 text-blue-700" },
  proposal:      { label: "Proposta",     color: "bg-yellow-100 text-yellow-700" },
  negotiation:   { label: "Negociação",   color: "bg-orange-100 text-orange-700" },
  won:           { label: "Ganho",        color: "bg-green-100 text-green-700" },
  lost:          { label: "Perdido",      color: "bg-red-100 text-red-700" },
};

const PROBABILITY_COLOR = (p: number) => {
  if (p >= 75) return "bg-green-500";
  if (p >= 50) return "bg-blue-500";
  if (p >= 25) return "bg-yellow-500";
  return "bg-red-500";
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const emptyForm = {
  title: "",
  contact_id: "",
  value: "",
  probability: "50",
  status: "prospecting" as OpportunityStatus,
  close_date: "",
  notes: "",
  assigned_to: "",
};

const Opportunities = () => {
  const { user } = useAuth();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });

  const fetchContacts = useCallback(async () => {
    if (!user) return;
    const { data } = await db
      .from("contacts")
      .select("id, name")
      .eq("user_id", user.id)
      .order("name");
    if (data) setContacts(data as Contact[]);
  }, [user]);

  const fetchOpportunities = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await db
        .from("opportunities")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as Opportunity[];

      // Enrich with contact names
      const contactIds = [...new Set(rows.map(r => r.contact_id).filter(Boolean))] as string[];
      let contactMap: Record<string, string> = {};
      if (contactIds.length > 0) {
        const { data: cData } = await db
          .from("contacts")
          .select("id, name")
          .in("id", contactIds);
        if (cData) {
          (cData as Contact[]).forEach(c => { contactMap[c.id] = c.name; });
        }
      }

      setOpportunities(rows.map(r => ({
        ...r,
        contact_name: r.contact_id ? (contactMap[r.contact_id] ?? null) : null,
      })));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar oportunidades";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchContacts();
    fetchOpportunities();
  }, [fetchContacts, fetchOpportunities]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (opp: Opportunity) => {
    setEditingId(opp.id);
    setForm({
      title: opp.title,
      contact_id: opp.contact_id ?? "",
      value: String(opp.value ?? ""),
      probability: String(opp.probability ?? 50),
      status: opp.status,
      close_date: opp.close_date ?? "",
      notes: opp.notes ?? "",
      assigned_to: opp.assigned_to ?? "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.title.trim()) { toast.error("Título é obrigatório"); return; }

    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        title: form.title.trim(),
        contact_id: form.contact_id || null,
        value: parseFloat(form.value) || 0,
        probability: parseInt(form.probability) || 50,
        status: form.status,
        close_date: form.close_date || null,
        notes: form.notes || null,
        assigned_to: form.assigned_to || null,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await db
          .from("opportunities")
          .update(payload)
          .eq("id", editingId)
          .eq("user_id", user.id);
        if (error) throw error;
        toast.success("Oportunidade atualizada!");
      } else {
        const { error } = await db
          .from("opportunities")
          .insert(payload);
        if (error) throw error;
        toast.success("Oportunidade criada!");
      }

      setDialogOpen(false);
      fetchOpportunities();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (!confirm("Deseja excluir esta oportunidade?")) return;
    try {
      const { error } = await db
        .from("opportunities")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Oportunidade excluída!");
      fetchOpportunities();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro ao excluir";
      toast.error(msg);
    }
  };

  const filtered = opportunities.filter(o => {
    const matchSearch = o.title.toLowerCase().includes(search.toLowerCase()) ||
      (o.contact_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Stats
  const totalValue = opportunities.filter(o => o.status === "won").reduce((s, o) => s + (o.value ?? 0), 0);
  const countByStatus = (s: OpportunityStatus) => opportunities.filter(o => o.status === s).length;

  const statsCards = [
    { label: "Total", value: opportunities.length, icon: TrendingUp, color: "text-blue-600" },
    { label: "Em prospecção", value: countByStatus("prospecting"), icon: Target, color: "text-gray-600" },
    { label: "Propostas", value: countByStatus("proposal"), icon: DollarSign, color: "text-yellow-600" },
    { label: "Ganhas", value: countByStatus("won"), icon: CheckCircle, color: "text-green-600" },
    { label: "Perdidas", value: countByStatus("lost"), icon: XCircle, color: "text-red-600" },
    { label: "Valor Total (Ganhas)", value: formatCurrency(totalValue), icon: DollarSign, color: "text-emerald-600", wide: true },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-blue-600">Oportunidades</h1>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Nova Oportunidade
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statsCards.map((s) => (
          <Card key={s.label} className="shadow-sm">
            <CardContent className="p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <span className="text-xl font-bold">{s.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por título ou contato..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchOpportunities} title="Atualizar">
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Nenhuma oportunidade encontrada</p>
          <p className="text-sm mt-1">Clique em &quot;Nova Oportunidade&quot; para começar</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filtered.map(opp => {
            const cfg = STATUS_CONFIG[opp.status];
            return (
              <Card key={opp.id} className="shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base truncate">{opp.title}</h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                          {cfg.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                        {opp.contact_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            {opp.contact_name}
                          </span>
                        )}
                        {opp.close_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            {format(new Date(opp.close_date + "T00:00:00"), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                        )}
                        <span className="flex items-center gap-1 font-medium text-foreground">
                          <DollarSign className="w-3.5 h-3.5" />
                          {formatCurrency(opp.value ?? 0)}
                        </span>
                      </div>

                      {/* Probability bar */}
                      <div className="flex items-center gap-2">
                        <Percent className="w-3.5 h-3.5 text-muted-foreground" />
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${PROBABILITY_COLOR(opp.probability ?? 0)}`}
                            style={{ width: `${opp.probability ?? 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">{opp.probability}%</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(opp)} title="Editar">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(opp.id)} title="Excluir"
                        className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Oportunidade" : "Nova Oportunidade"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Título */}
            <div>
              <label className="text-sm font-medium mb-1 block">Título *</label>
              <Input
                placeholder="Nome da oportunidade"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </div>

            {/* Contato */}
            <div>
              <label className="text-sm font-medium mb-1 block">Contato</label>
              <Select
                value={form.contact_id || "none"}
                onValueChange={v => setForm(f => ({ ...f, contact_id: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar contato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Valor */}
            <div>
              <label className="text-sm font-medium mb-1 block">Valor (R$)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={form.value}
                onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              />
            </div>

            {/* Probabilidade */}
            <div>
              <label className="text-sm font-medium mb-1 flex items-center gap-2">
                <Percent className="w-3.5 h-3.5" />
                Probabilidade: {form.probability}%
              </label>
              <Input
                type="range"
                min="0"
                max="100"
                step="5"
                value={form.probability}
                onChange={e => setForm(f => ({ ...f, probability: e.target.value }))}
                className="cursor-pointer h-2 p-0"
              />
            </div>

            {/* Status */}
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select
                value={form.status}
                onValueChange={v => setForm(f => ({ ...f, status: v as OpportunityStatus }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data de fechamento */}
            <div>
              <label className="text-sm font-medium mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                Data de fechamento
              </label>
              <Input
                type="date"
                value={form.close_date}
                onChange={e => setForm(f => ({ ...f, close_date: e.target.value }))}
              />
            </div>

            {/* Notas */}
            <div>
              <label className="text-sm font-medium mb-1 block">Notas</label>
              <Textarea
                placeholder="Observações sobre a oportunidade..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3}
              />
            </div>

            {/* Responsável */}
            <div>
              <label className="text-sm font-medium mb-1 flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                Responsável (ID do usuário)
              </label>
              <Input
                placeholder="UUID do responsável"
                value={form.assigned_to}
                onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Criar oportunidade"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Opportunities;
