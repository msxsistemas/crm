import { useState, useEffect, useMemo } from "react";
import { formatPhoneBR, unformatPhone } from "@/lib/phone-mask";
import {
  Search, Plus, Download, Upload, Pencil, Trash2, X,
  Phone, CheckCircle, Users, MessageSquare, BarChart3,
  Calendar as CalendarIcon, CalendarDays, CalendarRange, ChevronDown,
  User, Mail, MapPin, Info, Settings, Cake
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { FloatingInput } from "@/components/ui/floating-input";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, isToday, isThisWeek, isThisMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  avatar_url: string | null;
  email: string | null;
  cpf_cnpj: string | null;
  gender: string | null;
  birthday: string | null;
  state: string | null;
  city: string | null;
  address: string | null;
  reference: string | null;
  disable_chatbot: boolean;
  extra_fields: { name: string; value: string }[] | null;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
}

const AVATAR_COLORS = [
  "bg-pink-400", "bg-green-500", "bg-blue-500", "bg-purple-500",
  "bg-red-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500"
];

const Contacts = () => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // New/Edit contact dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formCpfCnpj, setFormCpfCnpj] = useState("");
  const [formGender, setFormGender] = useState("");
  const [formBirthday, setFormBirthday] = useState("");
  const [formState, setFormState] = useState("");
  const [formCity, setFormCity] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formReference, setFormReference] = useState("");
  const [formDisableChatbot, setFormDisableChatbot] = useState(false);
  const [extraFields, setExtraFields] = useState<{ name: string; value: string }[]>([]);

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);

  const fetchContacts = async () => {
    setLoading(true);
    const [{ data, error }, { data: convos }] = await Promise.all([
      supabase.from("contacts").select("*").order("created_at", { ascending: false }),
      supabase.from("conversations").select("contact_id, last_message_at").order("last_message_at", { ascending: false }),
    ]);

    if (!error && data) {
      // Build a map of contact_id -> latest last_message_at in a single pass
      const lastMsgMap = new Map<string, string>();
      for (const c of convos || []) {
        if (c.last_message_at && !lastMsgMap.has(c.contact_id)) {
          lastMsgMap.set(c.contact_id, c.last_message_at);
        }
      }
      const enriched: Contact[] = data.map((c) => ({
        ...c,
        last_message_at: lastMsgMap.get(c.id) || null,
      }));
      setContacts(enriched);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const s = search.toLowerCase();
    return contacts.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(s) ||
        c.phone.toLowerCase().includes(s)
    );
  }, [contacts, search]);

  const stats = useMemo(() => {
    const today = contacts.filter((c) => isToday(new Date(c.created_at))).length;
    const week = contacts.filter((c) => isThisWeek(new Date(c.created_at))).length;
    const month = contacts.filter((c) => isThisMonth(new Date(c.created_at))).length;
    const total = contacts.length;
    return { today, week, month, total };
  }, [contacts]);

  const getInitials = (name: string | null, phone: string) => {
    if (name && name.trim()) return name.charAt(0).toUpperCase();
    return "C";
  };

  const getAvatarColor = (id: string) => {
    const index = id.charCodeAt(0) % AVATAR_COLORS.length;
    return AVATAR_COLORS[index];
  };

  const resetForm = () => {
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    setFormCpfCnpj("");
    setFormGender("");
    setFormBirthday("");
    setFormState("");
    setFormCity("");
    setFormAddress("");
    setFormReference("");
    setFormDisableChatbot(false);
    setExtraFields([]);
    setEditingContact(null);
  };

  const openNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (c: Contact) => {
    resetForm();
    setEditingContact(c);
    setFormName(c.name || "");
    setFormPhone(c.phone);
    setFormEmail(c.email || "");
    setFormCpfCnpj(c.cpf_cnpj || "");
    setFormGender(c.gender || "");
    setFormBirthday(c.birthday || "");
    setFormState(c.state || "");
    setFormCity(c.city || "");
    setFormAddress(c.address || "");
    setFormReference(c.reference || "");
    setFormDisableChatbot(c.disable_chatbot || false);
    setExtraFields(c.extra_fields || []);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formPhone.trim()) {
      toast.error("Número é obrigatório");
      return;
    }
    const rawPhone = unformatPhone(formPhone);

    const contactData = {
      name: formName || null,
      phone: rawPhone,
      email: formEmail || null,
      cpf_cnpj: formCpfCnpj || null,
      gender: formGender || null,
      birthday: formBirthday || null,
      state: formState || null,
      city: formCity || null,
      address: formAddress || null,
      reference: formReference || null,
      disable_chatbot: formDisableChatbot,
      extra_fields: extraFields.length > 0 ? extraFields : null,
      updated_at: new Date().toISOString(),
    };

    if (editingContact) {
      const { error } = await supabase
        .from("contacts")
        .update(contactData)
        .eq("id", editingContact.id);
      if (error) {
        toast.error("Erro ao atualizar contato");
      } else {
        toast.success("Contato atualizado!");
        setDialogOpen(false);
        fetchContacts();
      }
    } else {
      const { error } = await supabase.from("contacts").insert(contactData);
      if (error) {
        toast.error("Erro ao criar contato");
      } else {
        toast.success("Contato adicionado!");
        setDialogOpen(false);
        fetchContacts();
      }
    }
  };

  const confirmDelete = (c: Contact) => {
    setContactToDelete(c);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!contactToDelete) return;
    const { error } = await supabase.from("contacts").delete().eq("id", contactToDelete.id);
    if (error) {
      toast.error("Erro ao excluir contato");
    } else {
      toast.success("Contato excluído");
      setDeleteOpen(false);
      setContactToDelete(null);
      fetchContacts();
    }
  };

  const formatDateTime = (d: string | null | undefined) => {
    if (!d) return "";
    try {
      return format(new Date(d), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return "";
    }
  };

  const statCards = [
    { label: "Hoje", value: stats.today, sub: "Novos contatos", icon: CalendarIcon, iconBg: "bg-blue-500", iconColor: "text-white" },
    { label: "Esta Semana", value: stats.week, sub: "Últimos 7 dias", icon: CalendarDays, iconBg: "bg-red-500", iconColor: "text-white" },
    { label: "Este Mês", value: stats.month, sub: "Mês atual", icon: CalendarRange, iconBg: "bg-green-500", iconColor: "text-white" },
    { label: "Total", value: stats.total, sub: "Todos os contatos", icon: Users, iconBg: "bg-blue-600", iconColor: "text-white" },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
        <h1 className="text-xl font-bold text-blue-600">Contatos</h1>
        <div className="flex items-center gap-3">
          <div className="relative w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 rounded-md"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700 text-white uppercase text-xs font-semibold gap-1.5">
                IMPORTAR / EXPORTAR
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="gap-2">
                <Upload className="h-4 w-4" /> Importar CSV
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2">
                <Download className="h-4 w-4" /> Exportar CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white uppercase text-xs font-semibold">
            ADICIONAR CONTATO
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4">
        {statCards.map((card, i) => (
          <div
            key={i}
            className={`border rounded-lg p-4 ${i === 3 ? "border-blue-500 border-2" : "border-border"}`}
          >
            <div className={`h-10 w-10 rounded-lg ${card.iconBg} flex items-center justify-center mb-2`}>
              <card.icon className={`h-5 w-5 ${card.iconColor}`} />
            </div>
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="text-3xl font-bold text-foreground">{card.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">↗ {card.sub}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 pb-4">
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8"></TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Nome</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Número WhatsApp</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">E-mail</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Última Interação</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider">Status</TableHead>
                <TableHead className="text-xs font-bold uppercase tracking-wider text-center">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-16 text-center text-muted-foreground">
                    Nenhum contato encontrado
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((contact) => (
                  <TableRow key={contact.id} className="hover:bg-muted/30">
                    <TableCell>
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={contact.avatar_url || undefined} />
                        <AvatarFallback className={`${getAvatarColor(contact.id)} text-white text-xs font-semibold`}>
                          {getInitials(contact.name, contact.phone)}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-green-500 opacity-60" />
                        <span className="text-sm font-medium text-foreground">
                          {contact.name || ""}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-foreground">
                      {contact.phone}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground"></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(contact.last_message_at)}
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 gap-1">
                        <CheckCircle className="h-3 w-3" /> Ativo
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-0.5">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" title="Estatísticas">
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => navigate("/inbox")} title="WhatsApp">
                          <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => openEdit(contact)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => confirmDelete(contact)} title="Excluir">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Add/Edit Contact Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl p-0 overflow-hidden gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 px-6 py-4 flex items-center gap-3">
            <Plus className="h-5 w-5 text-white" />
            <h2 className="text-lg font-bold text-white">
              {editingContact ? "Editar contato" : "Adicionar contato"}
            </h2>
            <button onClick={() => setDialogOpen(false)} className="ml-auto text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
            {/* Dica */}
            {!editingContact && (
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <Info className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-800">
                  <strong>Dica:</strong> Ao adicionar um contato, selecione o código do país (DDI) correto e digite o número sem espaços ou caracteres especiais.
                </p>
              </div>
            )}

            {/* Dados do contato */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <User className="h-4 w-4" /> Dados do contato
              </h3>
              <div className="space-y-4">
                <FloatingInput
                  label="Nome"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
                <div>
                  <FloatingInput
                    label="Número"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="5511987654321"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Digite o número completo com DDI (ex: 5511987654321)
                  </p>
                </div>
              </div>
            </div>

            {/* Informações de Contato */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <Mail className="h-4 w-4" /> Informações de Contato
              </h3>
              <FloatingInput
                label="E-Mail"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="exemplo@email.com"
              />
            </div>

            {/* Dados Pessoais */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <User className="h-4 w-4" /> Dados Pessoais
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <FloatingInput
                  label="CPF / CNPJ"
                  value={formCpfCnpj}
                  onChange={(e) => setFormCpfCnpj(e.target.value)}
                />
                <FloatingInput
                  label="Gênero"
                  value={formGender}
                  onChange={(e) => setFormGender(e.target.value)}
                />
              </div>
              <FloatingInput
                label="Aniversário"
                type="date"
                value={formBirthday}
                onChange={(e) => setFormBirthday(e.target.value)}
              />
            </div>

            {/* Localização */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <MapPin className="h-4 w-4" /> Localização
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <FloatingInput
                  label="Estado"
                  value={formState}
                  onChange={(e) => setFormState(e.target.value)}
                />
                <FloatingInput
                  label="Cidade"
                  value={formCity}
                  onChange={(e) => setFormCity(e.target.value)}
                />
              </div>
              <div className="space-y-4">
                <FloatingInput
                  label="Endereço"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                />
                <FloatingInput
                  label="Referência / Indicação"
                  value={formReference}
                  onChange={(e) => setFormReference(e.target.value)}
                />
              </div>
            </div>

            {/* Configurações Especiais */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <Settings className="h-4 w-4" /> Configurações Especiais
              </h3>
              <div className="flex items-center gap-3">
                <Switch
                  checked={formDisableChatbot}
                  onCheckedChange={setFormDisableChatbot}
                />
                <span className="text-sm text-foreground">Desabilitar chatbot para este contato</span>
              </div>
            </div>

            {/* Informações adicionais */}
            <div>
              <h3 className="text-sm font-semibold text-blue-600 flex items-center gap-2 mb-4">
                <Info className="h-4 w-4" /> Informações adicionais
              </h3>
              {extraFields.map((field, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 mb-2">
                  <FloatingInput
                    label="Nome do Campo"
                    value={field.name}
                    onChange={(e) => {
                      const updated = [...extraFields];
                      updated[i].name = e.target.value;
                      setExtraFields(updated);
                    }}
                  />
                  <FloatingInput
                    label="Valor"
                    value={field.value}
                    onChange={(e) => {
                      const updated = [...extraFields];
                      updated[i].value = e.target.value;
                      setExtraFields(updated);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-muted-foreground"
                    onClick={() => setExtraFields(extraFields.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                className="w-full border-blue-300 text-blue-600 hover:bg-blue-50 uppercase text-xs font-semibold"
                onClick={() => setExtraFields([...extraFields, { name: "", value: "" }])}
              >
                + ADICIONAR INFORMAÇÃO
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
            <Button
              variant="outline"
              className="uppercase font-semibold text-xs"
              onClick={() => setDialogOpen(false)}
            >
              CANCELAR
            </Button>
            <Button
              onClick={handleSave}
              className="bg-blue-600 hover:bg-blue-700 text-white uppercase font-semibold text-xs px-6"
            >
              {editingContact ? "SALVAR" : "ADICIONAR"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-xl p-0 gap-0 [&>button.absolute]:hidden">
          <div className="bg-blue-600 text-white px-6 py-4 rounded-t-lg flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">Excluir contato</h3>
              <p className="text-xs text-white/80">Esta ação não pode ser desfeita</p>
            </div>
            <button onClick={() => setDeleteOpen(false)} className="text-white/70 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-foreground">
              O contato <strong>{contactToDelete?.name || contactToDelete?.phone}</strong> será excluído permanentemente junto com todas as suas conversas.
            </p>
          </div>
          <div className="flex justify-end gap-2 px-6 pb-4">
            <Button variant="outline" className="uppercase font-semibold text-xs" onClick={() => setDeleteOpen(false)}>CANCELAR</Button>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white uppercase font-semibold text-xs px-6" onClick={handleDelete}>EXCLUIR</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Contacts;
