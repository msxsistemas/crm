import { useState, useEffect, useMemo } from "react";
import {
  Plus, Pencil, Trash2, Users, Search, X, Check,
  ChevronRight, UserMinus, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ContactGroup {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  contact_count: number;
  created_at: string;
}

interface GroupMember {
  contact_id: string;
  contacts: {
    id: string;
    name: string | null;
    phone: string;
    avatar_url: string | null;
  };
}

interface Contact {
  id: string;
  name: string | null;
  phone: string;
  avatar_url: string | null;
}

const PRESET_COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#8b5cf6", // purple
  "#f59e0b", // amber
  "#ef4444", // red
  "#06b6d4", // cyan
];

const AVATAR_COLORS = [
  "bg-pink-400", "bg-green-500", "bg-blue-500", "bg-purple-500",
  "bg-red-500", "bg-cyan-500", "bg-orange-500", "bg-teal-500",
];

const getAvatarColor = (id: string) => AVATAR_COLORS[id.charCodeAt(0) % AVATAR_COLORS.length];
const getInitials = (name: string | null) =>
  name && name.trim() ? name.trim().charAt(0).toUpperCase() : "C";

export default function ContactGroups() {
  const [groups, setGroups] = useState<ContactGroup[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ContactGroup | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formColor, setFormColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<ContactGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  // View members panel
  const [activeGroup, setActiveGroup] = useState<ContactGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");

  // Add contacts dialog
  const [addContactsOpen, setAddContactsOpen] = useState(false);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [contactPickerSearch, setContactPickerSearch] = useState("");
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [addingContacts, setAddingContacts] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contact_groups")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setGroups(data as ContactGroup[]);
    setLoading(false);
  };

  const fetchMembers = async (group: ContactGroup) => {
    setActiveGroup(group);
    setMembersLoading(true);
    setMemberSearch("");
    const { data, error } = await supabase
      .from("contact_group_members")
      .select("contact_id, contacts(id, name, phone, avatar_url)")
      .eq("group_id", group.id);
    if (!error && data) setMembers(data as unknown as GroupMember[]);
    setMembersLoading(false);
  };

  const openNew = () => {
    setEditingGroup(null);
    setFormName("");
    setFormDescription("");
    setFormColor(PRESET_COLORS[0]);
    setDialogOpen(true);
  };

  const openEdit = (group: ContactGroup) => {
    setEditingGroup(group);
    setFormName(group.name);
    setFormDescription(group.description || "");
    setFormColor(group.color || PRESET_COLORS[0]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error("Nome do grupo é obrigatório"); return; }
    setSaving(true);
    const payload = {
      name: formName.trim(),
      description: formDescription.trim() || null,
      color: formColor,
      icon: "users",
    };
    if (editingGroup) {
      const { error } = await supabase
        .from("contact_groups")
        .update(payload)
        .eq("id", editingGroup.id);
      if (error) { toast.error("Erro ao atualizar grupo"); setSaving(false); return; }
      toast.success("Grupo atualizado!");
    } else {
      const { error } = await supabase.from("contact_groups").insert({ ...payload, contact_count: 0 });
      if (error) { toast.error("Erro ao criar grupo"); setSaving(false); return; }
      toast.success("Grupo criado!");
    }
    setSaving(false);
    setDialogOpen(false);
    fetchGroups();
  };

  const confirmDelete = (group: ContactGroup) => {
    setGroupToDelete(group);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!groupToDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("contact_groups").delete().eq("id", groupToDelete.id);
    setDeleting(false);
    if (error) { toast.error("Erro ao excluir grupo"); return; }
    toast.success("Grupo excluído");
    setDeleteOpen(false);
    if (activeGroup?.id === groupToDelete.id) setActiveGroup(null);
    fetchGroups();
  };

  const handleRemoveMember = async (contactId: string) => {
    if (!activeGroup) return;
    const { error } = await supabase
      .from("contact_group_members")
      .delete()
      .eq("group_id", activeGroup.id)
      .eq("contact_id", contactId);
    if (error) { toast.error("Erro ao remover contato"); return; }
    toast.success("Contato removido do grupo");
    // Update local state
    setMembers((prev) => prev.filter((m) => m.contact_id !== contactId));
    // Update count on group
    setGroups((prev) =>
      prev.map((g) =>
        g.id === activeGroup.id ? { ...g, contact_count: Math.max(0, g.contact_count - 1) } : g
      )
    );
    setActiveGroup((prev) =>
      prev ? { ...prev, contact_count: Math.max(0, prev.contact_count - 1) } : prev
    );
    // Sync count in DB
    await supabase
      .from("contact_groups")
      .update({ contact_count: Math.max(0, activeGroup.contact_count - 1) })
      .eq("id", activeGroup.id);
  };

  const openAddContacts = async () => {
    setSelectedToAdd(new Set());
    setContactPickerSearch("");
    setAddContactsOpen(true);
    setLoadingContacts(true);
    const { data } = await supabase
      .from("contacts")
      .select("id, name, phone, avatar_url")
      .order("name", { ascending: true });
    setAllContacts((data || []) as Contact[]);
    setLoadingContacts(false);
  };

  const currentMemberIds = useMemo(() => new Set(members.map((m) => m.contact_id)), [members]);

  const filteredContactsForPicker = useMemo(() => {
    const q = contactPickerSearch.toLowerCase();
    return allContacts.filter(
      (c) =>
        !currentMemberIds.has(c.id) &&
        ((c.name || "").toLowerCase().includes(q) || c.phone.includes(q))
    );
  }, [allContacts, contactPickerSearch, currentMemberIds]);

  const toggleContactToAdd = (id: string) => {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddContacts = async () => {
    if (!activeGroup || selectedToAdd.size === 0) return;
    setAddingContacts(true);
    const rows = Array.from(selectedToAdd).map((contact_id) => ({
      group_id: activeGroup.id,
      contact_id,
    }));
    const { error } = await supabase
      .from("contact_group_members")
      .upsert(rows, { onConflict: "group_id,contact_id", ignoreDuplicates: true });
    setAddingContacts(false);
    if (error) { toast.error("Erro ao adicionar contatos"); return; }
    toast.success(`${selectedToAdd.size} contato(s) adicionado(s) ao grupo`);
    setAddContactsOpen(false);
    // Update count
    const newCount = activeGroup.contact_count + selectedToAdd.size;
    await supabase
      .from("contact_groups")
      .update({ contact_count: newCount })
      .eq("id", activeGroup.id);
    setGroups((prev) =>
      prev.map((g) => (g.id === activeGroup.id ? { ...g, contact_count: newCount } : g))
    );
    setActiveGroup((prev) => (prev ? { ...prev, contact_count: newCount } : prev));
    fetchMembers(activeGroup);
  };

  const filteredMembers = useMemo(() => {
    const q = memberSearch.toLowerCase();
    return members.filter(
      (m) =>
        (m.contacts?.name || "").toLowerCase().includes(q) ||
        (m.contacts?.phone || "").includes(q)
    );
  }, [members, memberSearch]);

  const formatDate = (d: string) => {
    try {
      return format(new Date(d), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return d;
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="mx-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-blue-600">Grupos de Contatos</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Organize seus contatos em grupos temáticos</p>
          </div>
          <Button onClick={openNew} className="bg-blue-600 hover:bg-blue-700 text-white gap-2 text-xs font-semibold uppercase">
            <Plus className="h-4 w-4" />
            Novo Grupo
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        {/* Groups Grid */}
        <div className={`overflow-y-auto p-6 ${activeGroup ? "w-1/2 border-r border-border" : "w-full"}`}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : groups.length === 0 ? (
            <Card className="p-16 flex flex-col items-center justify-center text-center">
              <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold text-foreground">Nenhum grupo criado</h3>
              <p className="text-sm text-muted-foreground mt-1">Crie grupos para organizar seus contatos</p>
              <Button className="mt-4 gap-2" onClick={openNew}>
                <Plus className="h-4 w-4" />
                Novo Grupo
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {groups.map((group) => (
                <Card
                  key={group.id}
                  className={`p-4 hover:shadow-md transition-shadow cursor-pointer ${activeGroup?.id === group.id ? "ring-2 ring-blue-500" : ""}`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    {/* Color icon */}
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: group.color + "22", border: `2px solid ${group.color}` }}
                    >
                      <Users className="h-5 w-5" style={{ color: group.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-foreground truncate">{group.name}</h3>
                        <Badge
                          className="text-xs shrink-0"
                          style={{
                            backgroundColor: group.color + "22",
                            color: group.color,
                            borderColor: group.color + "55",
                          }}
                        >
                          {group.contact_count} contatos
                        </Badge>
                      </div>
                      {group.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{group.description}</p>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mb-3">
                    Criado em {formatDate(group.created_at)}
                  </p>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs flex-1"
                      onClick={() => fetchMembers(group)}
                    >
                      <ChevronRight className="h-3 w-3" />
                      Ver contatos
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      title="Editar"
                      onClick={(e) => { e.stopPropagation(); openEdit(group); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                      title="Excluir"
                      onClick={(e) => { e.stopPropagation(); confirmDelete(group); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Members Panel */}
        {activeGroup && (
          <div className="w-1/2 flex flex-col overflow-hidden">
            {/* Panel header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: activeGroup.color + "22", border: `2px solid ${activeGroup.color}` }}
                >
                  <Users className="h-4 w-4" style={{ color: activeGroup.color }} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{activeGroup.name}</p>
                  <p className="text-xs text-muted-foreground">{activeGroup.contact_count} contato(s)</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs"
                  onClick={openAddContacts}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Adicionar contatos
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setActiveGroup(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar no grupo..."
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
            </div>

            {/* Members list */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {membersLoading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                  <Users className="h-10 w-10 text-muted-foreground/30" />
                  <p className="text-sm">
                    {members.length === 0
                      ? "Nenhum contato neste grupo"
                      : "Nenhum contato encontrado"}
                  </p>
                  {members.length === 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 gap-1.5 text-xs"
                      onClick={openAddContacts}
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Adicionar contatos
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredMembers.map((m) => {
                    const c = m.contacts;
                    return (
                      <div
                        key={m.contact_id}
                        className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={c?.avatar_url || undefined} />
                          <AvatarFallback className={`${getAvatarColor(m.contact_id)} text-white text-xs font-semibold`}>
                            {getInitials(c?.name || null)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{c?.name || "Sem nome"}</p>
                          <p className="text-xs text-muted-foreground">{c?.phone}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 shrink-0"
                          title="Remover do grupo"
                          onClick={() => handleRemoveMember(m.contact_id)}
                        >
                          <UserMinus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Group Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Editar Grupo" : "Novo Grupo de Contatos"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Nome *</label>
              <Input
                placeholder="Ex: Clientes VIP"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Descrição</label>
              <Input
                placeholder="Descrição opcional"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Cor</label>
              <div className="flex items-center gap-2 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="h-8 w-8 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110"
                    style={{
                      backgroundColor: color,
                      borderColor: formColor === color ? "#1e293b" : "transparent",
                    }}
                    onClick={() => setFormColor(color)}
                  >
                    {formColor === color && <Check className="h-4 w-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? "Salvando..." : editingGroup ? "Salvar" : "Criar Grupo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir Grupo</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Tem certeza que deseja excluir o grupo{" "}
            <strong className="text-foreground">{groupToDelete?.name}</strong>? Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contacts Dialog */}
      <Dialog open={addContactsOpen} onOpenChange={setAddContactsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar Contatos ao Grupo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar contatos..."
                value={contactPickerSearch}
                onChange={(e) => setContactPickerSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {selectedToAdd.size > 0 && (
              <p className="text-xs text-blue-600 font-medium">
                {selectedToAdd.size} contato(s) selecionado(s)
              </p>
            )}

            <div className="max-h-72 overflow-y-auto space-y-1 border rounded-lg p-2">
              {loadingContacts ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin h-6 w-6 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              ) : filteredContactsForPicker.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {allContacts.length === 0 ? "Nenhum contato encontrado" : "Todos os contatos já estão no grupo"}
                </p>
              ) : (
                filteredContactsForPicker.map((c) => {
                  const selected = selectedToAdd.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className={`flex items-center gap-3 w-full p-2 rounded-lg text-left transition-colors ${
                        selected ? "bg-blue-50 border border-blue-200" : "hover:bg-muted/50 border border-transparent"
                      }`}
                      onClick={() => toggleContactToAdd(c.id)}
                    >
                      <div
                        className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 ${
                          selected ? "bg-blue-600 border-blue-600" : "border-muted-foreground/40"
                        }`}
                      >
                        {selected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={c.avatar_url || undefined} />
                        <AvatarFallback className={`${getAvatarColor(c.id)} text-white text-xs font-semibold`}>
                          {getInitials(c.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.name || "Sem nome"}</p>
                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddContactsOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleAddContacts}
              disabled={addingContacts || selectedToAdd.size === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {addingContacts ? "Adicionando..." : `Adicionar ${selectedToAdd.size > 0 ? `(${selectedToAdd.size})` : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
