import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText, Plus, Search, Pencil, Trash2, Eye, Printer,
  X, RefreshCw, DollarSign, Package
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ── Types ──────────────────────────────────────────────────────────────────

interface ProposalItem {
  product_id?: string;
  name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  total: number;
}

type ProposalStatus = "draft" | "sent" | "accepted" | "rejected" | "expired";

interface Proposal {
  id: string;
  contact_id: string | null;
  title: string;
  description: string | null;
  status: ProposalStatus;
  items: ProposalItem[];
  subtotal: number;
  discount_percent: number;
  total: number;
  valid_until: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  contact_name?: string | null;
}

interface Contact {
  id: string;
  name: string;
  phone?: string | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  description?: string | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ProposalStatus, { label: string; className: string }> = {
  draft:    { label: "Rascunho",  className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  sent:     { label: "Enviada",   className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  accepted: { label: "Aceita",    className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  rejected: { label: "Rejeitada", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  expired:  { label: "Expirada",  className: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
};

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const formatDate = (d: string | null) => {
  if (!d) return "—";
  try { return format(new Date(d), "dd/MM/yyyy", { locale: ptBR }); } catch { return d; }
};

const EMPTY_ITEM: ProposalItem = { name: "", description: "", quantity: 1, unit_price: 0, total: 0 };

// ── Component ──────────────────────────────────────────────────────────────

const Proposals = () => {
  const { user } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewProposal, setViewProposal] = useState<Proposal | null>(null);
  const [editingProposal, setEditingProposal] = useState<Proposal | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Form state
  const [formContactId, setFormContactId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStatus, setFormStatus] = useState<ProposalStatus>("draft");
  const [formItems, setFormItems] = useState<ProposalItem[]>([{ ...EMPTY_ITEM }]);
  const [formDiscount, setFormDiscount] = useState("0");
  const [formValidUntil, setFormValidUntil] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [propRes, contRes, prodRes] = await Promise.all([
        supabase.from("proposals").select("*").order("created_at", { ascending: false }),
        supabase.from("contacts").select("id, name, phone"),
        supabase.from("products").select("id, name, price, description").eq("active", true),
      ]);

      const rawProposals = (propRes.data || []) as Proposal[];
      const fetchedContacts: Contact[] = contRes.data || [];
      setContacts(fetchedContacts);
      setProducts(prodRes.data || []);

      // Attach contact names
      const contactMap = Object.fromEntries(fetchedContacts.map(c => [c.id, c.name]));
      setProposals(rawProposals.map(p => ({
        ...p,
        contact_name: p.contact_id ? (contactMap[p.contact_id] ?? null) : null,
      })));
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar propostas");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Computed totals ───────────────────────────────────────────────────────

  const calcSubtotal = (items: ProposalItem[]) =>
    items.reduce((s, i) => s + (i.total || 0), 0);

  const calcTotal = (items: ProposalItem[], discount: string) => {
    const sub = calcSubtotal(items);
    const d = parseFloat(discount) || 0;
    return sub * (1 - d / 100);
  };

  const updateItemField = (
    idx: number,
    field: keyof ProposalItem,
    value: string | number
  ) => {
    setFormItems(prev => {
      const updated = [...prev];
      const item = { ...updated[idx] };
      if (field === "quantity") {
        item.quantity = Number(value);
        item.total = item.quantity * item.unit_price;
      } else if (field === "unit_price") {
        item.unit_price = Number(value);
        item.total = item.quantity * item.unit_price;
      } else if (field === "name") {
        item.name = String(value);
      } else if (field === "description") {
        item.description = String(value);
      } else if (field === "total") {
        item.total = Number(value);
      }
      updated[idx] = item;
      return updated;
    });
  };

  const pickProduct = (idx: number, productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    setFormItems(prev => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        product_id: prod.id,
        name: prod.name,
        description: prod.description || "",
        unit_price: prod.price,
        total: updated[idx].quantity * prod.price,
      };
      return updated;
    });
  };

  const addItem = () => setFormItems(prev => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx: number) => setFormItems(prev => prev.filter((_, i) => i !== idx));

  // ── Dialog open/reset ─────────────────────────────────────────────────────

  const openNew = () => {
    setEditingProposal(null);
    setFormContactId("");
    setFormTitle("");
    setFormDescription("");
    setFormStatus("draft");
    setFormItems([{ ...EMPTY_ITEM }]);
    setFormDiscount("0");
    setFormValidUntil("");
    setFormNotes("");
    setDialogOpen(true);
  };

  const openEdit = (p: Proposal) => {
    setEditingProposal(p);
    setFormContactId(p.contact_id || "");
    setFormTitle(p.title);
    setFormDescription(p.description || "");
    setFormStatus(p.status);
    setFormItems(Array.isArray(p.items) && p.items.length > 0 ? p.items : [{ ...EMPTY_ITEM }]);
    setFormDiscount(String(p.discount_percent));
    setFormValidUntil(p.valid_until ? p.valid_until.substring(0, 10) : "");
    setFormNotes(p.notes || "");
    setDialogOpen(true);
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!formTitle.trim()) { toast.error("Informe o título da proposta"); return; }
    setSaving(true);
    try {
      const subtotal = calcSubtotal(formItems);
      const total = calcTotal(formItems, formDiscount);
      const payload = {
        contact_id: formContactId || null,
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        status: formStatus,
        items: formItems as unknown as any,
        subtotal,
        discount_percent: parseFloat(formDiscount) || 0,
        total,
        valid_until: formValidUntil || null,
        notes: formNotes.trim() || null,
        created_by: user?.id || null,
        updated_at: new Date().toISOString(),
      };

      if (editingProposal) {
        const { error } = await supabase.from("proposals").update(payload).eq("id", editingProposal.id);
        if (error) throw error;
        toast.success("Proposta atualizada!");
      } else {
        const { error } = await supabase.from("proposals").insert(payload);
        if (error) throw error;
        toast.success("Proposta criada!");
      }
      setDialogOpen(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar proposta");
    }
    setSaving(false);
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta proposta?")) return;
    const { error } = await supabase.from("proposals").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Proposta excluída");
    setProposals(prev => prev.filter(p => p.id !== id));
  };

  // ── PDF print ─────────────────────────────────────────────────────────────

  const handlePrint = (p: Proposal) => {
    const contact = contacts.find(c => c.id === p.contact_id);
    const itemsRows = (Array.isArray(p.items) ? p.items : []).map((item: ProposalItem) =>
      `<tr>
        <td>${item.name}</td>
        <td>${item.description || ""}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">${formatCurrency(item.unit_price)}</td>
        <td style="text-align:right">${formatCurrency(item.total)}</td>
      </tr>`
    ).join("");

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Proposta — ${p.title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #222; padding: 32px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 2px solid #7C3AED; padding-bottom: 16px; }
  .brand { font-size: 22px; font-weight: bold; color: #7C3AED; }
  .brand-sub { font-size: 11px; color: #888; margin-top: 2px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px; }
  .info-box h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #999; margin-bottom: 6px; }
  .info-box p { font-size: 13px; font-weight: 600; color: #222; }
  .info-box .sub { font-size: 11px; color: #666; font-weight: 400; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  thead tr { background: #7C3AED; color: #fff; }
  th { padding: 10px 8px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  th:last-child, td:last-child { text-align: right; }
  td { padding: 9px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
  tr:nth-child(even) td { background: #fafafa; }
  .totals { margin-top: 16px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .totals-row { display: flex; gap: 24px; justify-content: flex-end; font-size: 13px; }
  .totals-row span:first-child { color: #666; }
  .totals-row span:last-child { font-weight: 600; min-width: 120px; text-align: right; }
  .total-final { font-size: 16px; font-weight: bold; color: #7C3AED; }
  .notes-section { margin-top: 28px; padding: 14px; border: 1px solid #eee; border-radius: 8px; background: #fafafa; }
  .notes-section h3 { font-size: 11px; text-transform: uppercase; color: #999; letter-spacing: 0.08em; margin-bottom: 6px; }
  .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #bbb; border-top: 1px solid #eee; padding-top: 12px; }
  .print-btn { margin-bottom: 24px; display: inline-flex; align-items: center; gap: 6px; padding: 8px 20px; background: #7C3AED; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .status-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; background: #e9e9e9; color: #555; }
  @media print {
    .print-btn { display: none; }
    body { padding: 0; }
  }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">&#128438; Imprimir / Salvar PDF</button>
<div class="header">
  <div>
    <div class="brand">MSX CRM</div>
    <div class="brand-sub">Proposta Comercial</div>
  </div>
  <div style="text-align:right">
    <div class="status-badge">${STATUS_CONFIG[p.status]?.label || p.status}</div>
    <div style="margin-top:6px;font-size:11px;color:#888">Criada em: ${formatDate(p.created_at)}</div>
    ${p.valid_until ? `<div style="font-size:11px;color:#888">Válida até: ${formatDate(p.valid_until)}</div>` : ""}
  </div>
</div>

<div class="info-grid">
  <div class="info-box">
    <h3>Proposta</h3>
    <p>${p.title}</p>
    ${p.description ? `<p class="sub" style="margin-top:4px">${p.description}</p>` : ""}
  </div>
  <div class="info-box">
    <h3>Cliente</h3>
    <p>${contact?.name || "—"}</p>
    ${contact?.phone ? `<p class="sub">${contact.phone}</p>` : ""}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Produto / Serviço</th>
      <th>Descrição</th>
      <th style="text-align:center">Qtd</th>
      <th style="text-align:right">Preço Unit.</th>
      <th style="text-align:right">Total</th>
    </tr>
  </thead>
  <tbody>
    ${itemsRows || '<tr><td colspan="5" style="text-align:center;color:#bbb">Sem itens</td></tr>'}
  </tbody>
</table>

<div class="totals">
  <div class="totals-row">
    <span>Subtotal</span><span>${formatCurrency(p.subtotal)}</span>
  </div>
  ${p.discount_percent > 0 ? `<div class="totals-row"><span>Desconto (${p.discount_percent}%)</span><span>- ${formatCurrency(p.subtotal * p.discount_percent / 100)}</span></div>` : ""}
  <div class="totals-row total-final">
    <span>Total</span><span>${formatCurrency(p.total)}</span>
  </div>
</div>

${p.notes ? `
<div class="notes-section">
  <h3>Observações</h3>
  <p style="font-size:12px;color:#444;line-height:1.6;white-space:pre-wrap">${p.notes}</p>
</div>` : ""}

<div class="footer">Gerado pelo MSX CRM &bull; ${new Date().toLocaleString("pt-BR")}</div>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) { toast.error("Popup bloqueado. Permita popups e tente novamente."); return; }
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  // ── Filtered list ─────────────────────────────────────────────────────────

  const filtered = proposals.filter(p => {
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q
      || p.title.toLowerCase().includes(q)
      || (p.contact_name || "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const subtotal = calcSubtotal(formItems);
  const total = calcTotal(formItems, formDiscount);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="mx-6 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-primary flex items-center gap-2">
            <FileText className="h-5 w-5" /> Propostas Comerciais
          </h1>
          <p className="text-sm text-muted-foreground">Crie e gerencie propostas para seus clientes</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={openNew} className="gap-1.5">
            <Plus className="h-4 w-4" /> Nova Proposta
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por contato ou título..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {(Object.keys(STATUS_CONFIG) as ProposalStatus[]).map(s => (
                <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} {filtered.length === 1 ? "proposta" : "propostas"}
          </span>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">
                Carregando propostas...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="p-4 rounded-full bg-muted mb-4">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-base font-medium text-foreground">Nenhuma proposta encontrada</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {search || statusFilter !== "all"
                    ? "Tente ajustar os filtros"
                    : 'Clique em "Nova Proposta" para criar a primeira'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider w-8">#</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider">Contato</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider">Título</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider">Total</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider">Status</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider">Válida até</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider">Criada em</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p, i) => (
                      <TableRow key={p.id} className="hover:bg-muted/30">
                        <TableCell className="text-xs font-bold text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-sm text-foreground font-medium">
                          {p.contact_name || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm text-foreground max-w-[200px] truncate">{p.title}</TableCell>
                        <TableCell className="text-sm font-semibold text-foreground">
                          {formatCurrency(p.total)}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] font-semibold rounded-full px-2.5 ${STATUS_CONFIG[p.status]?.className}`}>
                            {STATUS_CONFIG[p.status]?.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(p.valid_until)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(p.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8"
                              onClick={() => setViewProposal(p)}
                              title="Visualizar"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8"
                              onClick={() => handlePrint(p)}
                              title="Gerar PDF"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8"
                              onClick={() => openEdit(p)}
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(p.id)}
                              title="Excluir"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {editingProposal ? "Editar Proposta" : "Nova Proposta"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            {/* Basic info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Contato</label>
                <Select value={formContactId} onValueChange={setFormContactId}>
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue placeholder="Selecionar contato (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Nenhum</SelectItem>
                    {contacts.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Status</label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as ProposalStatus)}>
                  <SelectTrigger className="h-10 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(STATUS_CONFIG) as ProposalStatus[]).map(s => (
                      <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Título *</label>
              <Input
                placeholder="Ex: Proposta de serviços de marketing digital"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                className="h-10 text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Descrição</label>
              <Textarea
                placeholder="Descrição geral da proposta..."
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                rows={2}
                className="text-sm resize-none"
              />
            </div>

            {/* Items table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground font-medium">Itens da Proposta</label>
                <Button variant="outline" size="sm" onClick={addItem} className="gap-1.5 h-8 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Adicionar item
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted/40">
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider w-[28%]">Produto/Serviço</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider w-[20%]">Produto catálogo</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider">Descrição</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider w-16">Qtd</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider w-28">Preço Unit.</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider w-28 text-right">Total</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formItems.map((item, idx) => (
                      <TableRow key={idx} className="hover:bg-muted/20">
                        <TableCell className="py-2">
                          <Input
                            placeholder="Nome"
                            value={item.name}
                            onChange={e => updateItemField(idx, "name", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-2">
                          <Select
                            value={item.product_id || ""}
                            onValueChange={v => pickProduct(idx, v)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Catálogo" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">Nenhum</SelectItem>
                              {products.map(p => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-2">
                          <Input
                            placeholder="Descrição"
                            value={item.description || ""}
                            onChange={e => updateItemField(idx, "description", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-2">
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={e => updateItemField(idx, "quantity", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-2">
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            value={item.unit_price}
                            onChange={e => updateItemField(idx, "unit_price", e.target.value)}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-2 text-right text-xs font-semibold text-foreground pr-3">
                          {formatCurrency(item.total)}
                        </TableCell>
                        <TableCell className="py-2 pr-2">
                          <Button
                            variant="ghost" size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => removeItem(idx)}
                            disabled={formItems.length === 1}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="space-y-2 w-72">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold text-foreground">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm gap-3">
                  <span className="text-muted-foreground whitespace-nowrap">Desconto (%)</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={formDiscount}
                    onChange={e => setFormDiscount(e.target.value)}
                    className="h-8 text-xs w-24 text-right"
                  />
                </div>
                <div className="flex items-center justify-between text-base font-bold border-t pt-2">
                  <span className="text-foreground">Total</span>
                  <span className="text-primary">{formatCurrency(total)}</span>
                </div>
              </div>
            </div>

            {/* Validity + notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Validade</label>
                <Input
                  type="date"
                  value={formValidUntil}
                  onChange={e => setFormValidUntil(e.target.value)}
                  className="h-10 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Observações</label>
                <Textarea
                  placeholder="Termos, condições e observações..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1.5">
                <DollarSign className="h-4 w-4" />
                {saving ? "Salvando..." : editingProposal ? "Salvar alterações" : "Criar Proposta"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      {viewProposal && (
        <Dialog open={!!viewProposal} onOpenChange={() => setViewProposal(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> {viewProposal.title}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="flex items-center justify-between">
                <Badge className={`${STATUS_CONFIG[viewProposal.status]?.className} rounded-full px-3`}>
                  {STATUS_CONFIG[viewProposal.status]?.label}
                </Badge>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setViewProposal(null); openEdit(viewProposal); }} className="gap-1.5">
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button size="sm" onClick={() => handlePrint(viewProposal)} className="gap-1.5">
                    <Printer className="h-3.5 w-3.5" /> Gerar PDF
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Contato</p>
                  <p className="font-medium">{viewProposal.contact_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Válida até</p>
                  <p className="font-medium">{formatDate(viewProposal.valid_until)}</p>
                </div>
                {viewProposal.description && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-0.5">Descrição</p>
                    <p>{viewProposal.description}</p>
                  </div>
                )}
              </div>

              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent bg-muted/40">
                      <TableHead className="text-[10px] font-bold uppercase">Produto</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">Descrição</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase w-12 text-center">Qtd</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase w-28 text-right">Preço Unit.</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase w-28 text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Array.isArray(viewProposal.items) ? viewProposal.items : []).map((item: ProposalItem, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-sm font-medium">{item.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.description || "—"}</TableCell>
                        <TableCell className="text-sm text-center">{item.quantity}</TableCell>
                        <TableCell className="text-sm text-right">{formatCurrency(item.unit_price)}</TableCell>
                        <TableCell className="text-sm font-semibold text-right">{formatCurrency(item.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex justify-end">
                <div className="space-y-1.5 w-60">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{formatCurrency(viewProposal.subtotal)}</span>
                  </div>
                  {viewProposal.discount_percent > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Desconto ({viewProposal.discount_percent}%)</span>
                      <span className="text-red-600">- {formatCurrency(viewProposal.subtotal * viewProposal.discount_percent / 100)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold border-t pt-1.5">
                    <span>Total</span>
                    <span className="text-primary">{formatCurrency(viewProposal.total)}</span>
                  </div>
                </div>
              </div>

              {viewProposal.notes && (
                <div className="rounded-lg bg-muted/40 p-4">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Observações</p>
                  <p className="text-sm whitespace-pre-wrap">{viewProposal.notes}</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Hidden print ref (not used, print handled via window.open) */}
      <div ref={printRef} style={{ display: "none" }} />
    </div>
  );
};

export default Proposals;
