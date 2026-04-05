import { useState, useEffect, useMemo } from "react";
import {
  Plus, Pencil, Trash2, ChevronUp, ChevronDown,
  TrendingUp, DollarSign, Trophy, Percent, BarChart2, CalendarCheck
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FloatingInput, FloatingTextarea, FloatingSelectWrapper } from "@/components/ui/floating-input";
import { db } from "@/lib/db";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Status = "prospecting" | "qualification" | "proposal" | "negotiation" | "won" | "lost";

interface Opportunity {
  id: string;
  user_id: string;
  contact_id: string | null;
  title: string;
  value: number;
  probability: number;
  status: Status;
  close_date: string | null;
  notes: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

interface Contact {
  id: string;
  name: string;
  phone: string;
}

interface Profile {
  id: string;
  full_name: string | null;
}

const STATUS_LABELS: Record<Status, string> = {
  prospecting: "Prospecção",
  qualification: "Qualificação",
  proposal: "Proposta",
  negotiation: "Negociação",
  won: "Ganho",
  lost: "Perdido",
};

const STATUS_COLORS: Record<Status, string> = {
  prospecting: "bg-blue-100 text-blue-700",
  qualification: "bg-purple-100 text-purple-700",
  proposal: "bg-yellow-100 text-yellow-700",
  negotiation: "bg-orange-100 text-orange-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
};

const PROB_COLORS = (prob: number) => {
  if (prob >= 75) return "bg-green-500";
  if (prob >= 50) return "bg-yellow-400";
  if (prob >= 25) return "bg-orange-400";
  return "bg-red-400";
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatDate = (date: string | null) => {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("pt-BR");
};

type SortKey = "title" | "value" | "probability" | "status" | "close_date" | "assigned_to";
type SortDir = "asc" | "desc";

const EMPTY_FORM = {
  title: "",
  contact_id: "",
  value: "",
  probability: "50",
  status: "prospecting" as Status,
  close_date: "",
  notes: "",
  assigned_to: "",
};

const Pipeline = () => {
  const { user } = useAuth();

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [responsibleFilter, setResponsibleFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>("close_date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const [oppRes, contRes, profRes] = await Promise.all([
      db.from("opportunities").select("*").order("created_at", { ascending: false }),
      db.from("contacts").select("id, name, phone").order("name"),
      db.from("profiles").select("id, full_name"),
    ]);
    setOpportunities((oppRes.data as Opportunity[]) || []);
    setContacts((contRes.data as Contact[]) || []);
    setProfiles((profRes.data as Profile[]) || []);
    setLoading(false);
  };

  // Maps
  const contactMap = useMemo(() => {
    const m: Record<string, Contact> = {};
    contacts.forEach(c => { m[c.id] = c; });
    return m;
  }, [contacts]);

  const profileMap = useMemo(() => {
    const m: Record<string, string> = {};
    profiles.forEach(p => { m[p.id] = p.full_name || p.id; });
    return m;
  }, [profiles]);

  // Stats
  const stats = useMemo(() => {
    const active = opportunities.filter(o => o.status !== "lost");
    const won = opportunities.filter(o => o.status === "won");
    const total = opportunities.length;
    const totalValue = active.reduce((s, o) => s + (o.value || 0), 0);
    const wonValue = won.reduce((s, o) => s + (o.value || 0), 0);
    const convRate = total > 0 ? (won.length / total) * 100 : 0;
    const avgTicket = won.length > 0 ? wonValue / won.length : 0;
    const now = new Date();
    const startM = new Date(now.getFullYear(), now.getMonth(), 1);
    const endM = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const closingsThisMonth = opportunities.filter(o => {
      if (!o.close_date) return false;
      const d = new Date(o.close_date);
      return d >= startM && d <= endM;
    }).length;
    return { total, totalValue, wonValue, convRate, avgTicket, closingsThisMonth };
  }, [opportunities]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    let data = [...opportunities];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(o => {
        const title = o.title?.toLowerCase() || "";
        const contact = contactMap[o.contact_id || ""]?.name?.toLowerCase() || "";
        return title.includes(q) || contact.includes(q);
      });
    }
    if (statusFilter && statusFilter !== "all") data = data.filter(o => o.status === statusFilter);
    if (responsibleFilter && responsibleFilter !== "all") data = data.filter(o => o.assigned_to === responsibleFilter);
    if (dateFrom) data = data.filter(o => o.close_date && o.close_date >= dateFrom);
    if (dateTo) data = data.filter(o => o.close_date && o.close_date <= dateTo);

    data.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      if (sortKey === "title") { va = a.title || ""; vb = b.title || ""; }
      else if (sortKey === "value") { va = a.value || 0; vb = b.value || 0; }
      else if (sortKey === "probability") { va = a.probability || 0; vb = b.probability || 0; }
      else if (sortKey === "status") { va = a.status || ""; vb = b.status || ""; }
      else if (sortKey === "close_date") { va = a.close_date || ""; vb = b.close_date || ""; }
      else if (sortKey === "assigned_to") {
        va = profileMap[a.assigned_to || ""] || "";
        vb = profileMap[b.assigned_to || ""] || "";
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return data;
  }, [opportunities, search, statusFilter, responsibleFilter, dateFrom, dateTo, sortKey, sortDir, contactMap, profileMap]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ChevronUp className="h-3 w-3 opacity-30 inline ml-1" />;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 inline ml-1 text-primary" />
      : <ChevronDown className="h-3 w-3 inline ml-1 text-primary" />;
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  };

  const openEdit = (opp: Opportunity) => {
    setEditingId(opp.id);
    setForm({
      title: opp.title,
      contact_id: opp.contact_id || "",
      value: String(opp.value || ""),
      probability: String(opp.probability ?? 50),
      status: opp.status,
      close_date: opp.close_date ? opp.close_date.split("T")[0] : "",
      notes: opp.notes || "",
      assigned_to: opp.assigned_to || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Título é obrigatório"); return; }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      contact_id: form.contact_id || null,
      value: parseFloat(form.value) || 0,
      probability: parseInt(form.probability) || 0,
      status: form.status,
      close_date: form.close_date || null,
      notes: form.notes || null,
      assigned_to: form.assigned_to || null,
      user_id: user?.id,
    };
    if (editingId) {
      const { error } = await db.from("opportunities").update(payload).eq("id", editingId);
      if (error) { toast.error("Erro ao atualizar"); setSaving(false); return; }
      toast.success("Oportunidade atualizada");
    } else {
      const { error } = await db.from("opportunities").insert(payload);
      if (error) { toast.error("Erro ao criar"); setSaving(false); return; }
      toast.success("Oportunidade criada");
    }
    setSaving(false);
    setDialogOpen(false);
    loadAll();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await db.from("opportunities").delete().eq("id", deleteId);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Oportunidade excluída");
    setDeleteOpen(false);
    setDeleteId(null);
    loadAll();
  };

  const setF = (key: keyof typeof EMPTY_FORM, val: string) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="mx-6 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-xl font-bold text-primary">Pipeline de Vendas</h1>
        <Button variant="action" size="sm" className="gap-2" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Nova Oportunidade
        </Button>
      </div>

      <div className="p-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { icon: <TrendingUp className="h-5 w-5 text-blue-500" />, label: "Total", value: String(stats.total) },
            { icon: <DollarSign className="h-5 w-5 text-indigo-500" />, label: "Valor Total", value: formatCurrency(stats.totalValue) },
            { icon: <Trophy className="h-5 w-5 text-green-500" />, label: "Valor Ganho", value: formatCurrency(stats.wonValue) },
            { icon: <Percent className="h-5 w-5 text-orange-500" />, label: "Conversão", value: `${stats.convRate.toFixed(1)}%` },
            { icon: <BarChart2 className="h-5 w-5 text-purple-500" />, label: "Ticket Médio", value: formatCurrency(stats.avgTicket) },
            { icon: <CalendarCheck className="h-5 w-5 text-teal-500" />, label: "Fechamentos/Mês", value: String(stats.closingsThisMonth) },
          ].map((s, i) => (
            <Card key={i} className="p-3 flex flex-col gap-1">
              <div className="flex items-center gap-2">{s.icon}<span className="text-xs text-muted-foreground">{s.label}</span></div>
              <p className="text-sm font-bold text-foreground truncate">{s.value}</p>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <Input
            placeholder="Buscar por título ou contato..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-9 text-sm"
          />
          <FloatingSelectWrapper label="Status" hasValue={statusFilter !== "all" && !!statusFilter}>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(Object.keys(STATUS_LABELS) as Status[]).map(s => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FloatingSelectWrapper>
          <FloatingSelectWrapper label="Responsável" hasValue={responsibleFilter !== "all" && !!responsibleFilter}>
            <Select value={responsibleFilter} onValueChange={setResponsibleFilter}>
              <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {profiles.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.full_name || p.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FloatingSelectWrapper>
          <FloatingInput type="date" label="Fechamento de" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <FloatingInput type="date" label="Fechamento até" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>

        {/* Table */}
        <Card className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs text-primary font-semibold cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("title")}>
                  Título <SortIcon col="title" />
                </TableHead>
                <TableHead className="text-xs text-primary font-semibold whitespace-nowrap">Contato</TableHead>
                <TableHead className="text-xs text-primary font-semibold cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("value")}>
                  Valor <SortIcon col="value" />
                </TableHead>
                <TableHead className="text-xs text-primary font-semibold cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("probability")}>
                  Probabilidade <SortIcon col="probability" />
                </TableHead>
                <TableHead className="text-xs text-primary font-semibold cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("status")}>
                  Status <SortIcon col="status" />
                </TableHead>
                <TableHead className="text-xs text-primary font-semibold cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("close_date")}>
                  Fechamento <SortIcon col="close_date" />
                </TableHead>
                <TableHead className="text-xs text-primary font-semibold cursor-pointer select-none whitespace-nowrap" onClick={() => handleSort("assigned_to")}>
                  Responsável <SortIcon col="assigned_to" />
                </TableHead>
                <TableHead className="text-xs text-primary font-semibold whitespace-nowrap">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8 text-sm">Carregando...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8 text-sm">Nenhuma oportunidade encontrada</TableCell>
                </TableRow>
              ) : (
                filtered.map(opp => {
                  const contact = contactMap[opp.contact_id || ""];
                  const responsible = profileMap[opp.assigned_to || ""] || "-";
                  return (
                    <TableRow key={opp.id}>
                      <TableCell className="text-xs font-medium max-w-[160px] truncate">{opp.title}</TableCell>
                      <TableCell className="text-xs">{contact?.name || contact?.phone || "-"}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatCurrency(opp.value || 0)}</TableCell>
                      <TableCell className="text-xs min-w-[100px]">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full rounded-full ${PROB_COLORS(opp.probability || 0)}`}
                              style={{ width: `${Math.min(opp.probability || 0, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-8 text-right">{opp.probability || 0}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[opp.status] || ""}`}>
                          {STATUS_LABELS[opp.status] || opp.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{formatDate(opp.close_date)}</TableCell>
                      <TableCell className="text-xs">{responsible}</TableCell>
                      <TableCell className="text-xs">
                        <div className="flex gap-1">
                          <button
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                            title="Editar"
                            onClick={() => openEdit(opp)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600"
                            title="Excluir"
                            onClick={() => { setDeleteId(opp.id); setDeleteOpen(true); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Oportunidade" : "Nova Oportunidade"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FloatingInput label="Título *" value={form.title} onChange={e => setF("title", e.target.value)} />
            <FloatingSelectWrapper label="Contato" hasValue={!!form.contact_id}>
              <Select value={form.contact_id} onValueChange={v => setF("contact_id", v)}>
                <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum</SelectItem>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name || c.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
            <div className="grid grid-cols-2 gap-3">
              <FloatingInput label="Valor (R$)" type="number" value={form.value} onChange={e => setF("value", e.target.value)} />
              <FloatingInput label="Probabilidade (%)" type="number" value={form.probability} onChange={e => setF("probability", e.target.value)} />
            </div>
            <FloatingSelectWrapper label="Status" hasValue={!!form.status}>
              <Select value={form.status} onValueChange={v => setF("status", v as Status)}>
                <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABELS) as Status[]).map(s => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FloatingSelectWrapper>
            <div className="grid grid-cols-2 gap-3">
              <FloatingInput label="Data de Fechamento" type="date" value={form.close_date} onChange={e => setF("close_date", e.target.value)} />
              <FloatingSelectWrapper label="Responsável" hasValue={!!form.assigned_to}>
                <Select value={form.assigned_to} onValueChange={v => setF("assigned_to", v)}>
                  <SelectTrigger className="h-10 pt-3 pb-1"><SelectValue placeholder=" " /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    {profiles.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name || p.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FloatingSelectWrapper>
            </div>
            <FloatingTextarea label="Notas" value={form.notes} onChange={e => setF("notes", e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button variant="action" onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editingId ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Oportunidade</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir esta oportunidade? Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Pipeline;
