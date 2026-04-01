import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Tag, Search, Filter, Users, Settings, RefreshCw, Info, X, MessageSquare, Download, AlertTriangle } from "lucide-react";
import ColorPicker from "@/components/shared/ColorPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FloatingInput, FloatingSelectWrapper } from "@/components/ui/floating-input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";

const TAG_TYPES = ["Atendimento", "Encerramento", "CRM"];

// Map legacy Tailwind color classes to hex
const tailwindColorMap: Record<string, string> = {
  "bg-primary": "#2196f3",
  "bg-red-500": "#ef4444",
  "bg-green-500": "#22c55e",
  "bg-blue-500": "#3b82f6",
  "bg-yellow-500": "#eab308",
  "bg-purple-500": "#a855f7",
  "bg-pink-500": "#ec4899",
  "bg-orange-500": "#f97316",
  "bg-teal-500": "#14b8a6",
  "bg-indigo-500": "#6366f1",
  "bg-cyan-500": "#06b6d4",
  "bg-emerald-500": "#10b981",
};

const resolveColor = (color: string): string => {
  if (!color) return "#2196f3";
  if (color.startsWith("#") || color.startsWith("rgb")) return color;
  return tailwindColorMap[color] || "#2196f3";
};

const Tags = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [open, setOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [tagToDelete, setTagToDelete] = useState<any>(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState<any>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"geral" | "remarketing">("geral");
  const [showColorPicker, setShowColorPicker] = useState(false);

  // Form state
  const [editingTag, setEditingTag] = useState<any>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#2196f3");
  const [tagType, setTagType] = useState("Atendimento");
  const [kanbanEnabled, setKanbanEnabled] = useState(false);
  const [priority, setPriority] = useState(0);

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ["tags", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tags")
        .select("*")
        .eq("user_id", user!.id)
        .order("priority", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: tagContactCounts = {} } = useQuery({
    queryKey: ["tag-contact-counts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contact_tags").select("tag_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((ct) => {
        counts[ct.tag_id] = (counts[ct.tag_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!user?.id,
  });

  const { data: tagContacts = [] } = useQuery({
    queryKey: ["tag-contacts", selectedTag?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_tags")
        .select("contact_id, contacts(id, name, phone, avatar_url)")
        .eq("tag_id", selectedTag!.id);
      if (error) throw error;
      return data.map((ct: any) => ct.contacts).filter(Boolean);
    },
    enabled: !!selectedTag?.id && contactsOpen,
  });

  const { data: totalContacts = 0 } = useQuery({
    queryKey: ["total-contacts"],
    queryFn: async () => {
      const { count, error } = await supabase.from("contacts").select("id", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const resolvedColor = color.startsWith("#") || color.startsWith("rgb") ? color : "#2196f3";
      const payload = {
        name,
        color: resolvedColor,
        tag_type: tagType,
        kanban_enabled: kanbanEnabled,
        priority,
        user_id: user!.id,
      };
      if (editingTag) {
        const { error } = await supabase.from("tags").update(payload).eq("id", editingTag.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tags").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      toast.success(editingTag ? "Tag atualizada com sucesso!" : "Tag criada com sucesso!");
      handleClose();
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao salvar tag"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // First remove contact_tags references
      await supabase.from("contact_tags").delete().eq("tag_id", id);
      const { error } = await supabase.from("tags").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags"] });
      queryClient.invalidateQueries({ queryKey: ["tag-contact-counts"] });
      toast.success("Tag removida com sucesso!");
      setDeleteConfirmOpen(false);
      setTagToDelete(null);
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao remover tag"),
  });

  const handleClose = () => {
    setOpen(false);
    setEditingTag(null);
    setName("");
    setColor("#2196f3");
    setTagType("Atendimento");
    setKanbanEnabled(false);
    setPriority(0);
    setActiveTab("geral");
    setShowColorPicker(false);
  };

  const handleEdit = (tag: any) => {
    setEditingTag(tag);
    setName(tag.name);
    setColor(resolveColor(tag.color));
    setTagType(tag.tag_type || "Atendimento");
    setKanbanEnabled(tag.kanban_enabled || false);
    setPriority(tag.priority || 0);
    setOpen(true);
  };

  const handleDeleteClick = (tag: any) => {
    setTagToDelete(tag);
    setDeleteConfirmOpen(true);
  };

  const handleViewContacts = (tag: any) => {
    setSelectedTag(tag);
    setContactsOpen(true);
    setContactSearch("");
  };

  const filteredTags = tags.filter((tag) => {
    const matchesSearch = tag.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === "all" || tag.tag_type === filterType;
    return matchesSearch && matchesType;
  });

  const filteredContacts = tagContacts.filter((c: any) =>
    !contactSearch || c.name?.toLowerCase().includes(contactSearch.toLowerCase()) || c.phone?.includes(contactSearch)
  );

  const formatPhone = (phone: string) => {
    if (!phone || phone.length < 12) return phone;
    return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
  };

  const getInitials = (name: string | null, phone: string) => {
    if (name) return name.slice(0, 2).toUpperCase();
    return phone?.slice(-2) || "??";
  };

  const getTagNumericId = (id: string) => {
    return parseInt(id.replace(/-/g, '').slice(-6), 16) % 1000;
  };

  return (
    <TooltipProvider>
      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mx-6 py-4 border-b border-border">
          <h1 className="text-xl font-bold text-blue-600">Tags</h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar tags..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 w-52"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-44">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span>{filterType === "all" ? "Todas as Tags" : filterType}</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Tags</SelectItem>
                {TAG_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="action" onClick={() => setOpen(true)} className="gap-2 px-5 uppercase text-xs font-semibold">
              <Plus className="h-4 w-4" /> NOVA TAG
            </Button>
          </div>
        </div>

        {/* Tag list */}
        <div className="p-6 space-y-2">
          {isLoading ? (
            <p className="text-muted-foreground text-center py-16">Carregando...</p>
          ) : filteredTags.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Tag className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>Nenhuma tag encontrada</p>
            </div>
          ) : (
            filteredTags.map((tag) => {
              const tagColor = resolveColor(tag.color);
              return (
                <div key={tag.id} className="flex items-center bg-card rounded-xl border border-border px-5 py-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div
                      className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${tagColor}20` }}
                    >
                      <Tag className="h-5 w-5" style={{ color: tagColor }} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-card-foreground">{tag.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0 px-2 py-0">
                          {tag.tag_type || "Atendimento"}
                        </Badge>
                        {tag.kanban_enabled && (
                          <Badge variant="secondary" className="text-xs border-0 px-2 py-0 gap-1 bg-accent text-accent-foreground">
                            <span>✓</span> Kanban
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-0 mr-6">
                    <div className="text-center px-4 py-1 border border-border rounded-l-lg bg-muted/50">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase">ID</p>
                      <p className="text-sm font-semibold text-card-foreground">#{getTagNumericId(tag.id)}</p>
                    </div>
                    <div className="text-center px-4 py-1 border-y border-border bg-muted/50">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Prioridade</p>
                      <p className="text-sm font-semibold text-card-foreground">{tag.priority || 0}</p>
                    </div>
                    <div className="text-center px-4 py-1 border border-border rounded-r-lg bg-muted/50">
                      <p className="text-[10px] text-muted-foreground font-medium uppercase">Tickets</p>
                      <p className="text-sm font-semibold text-card-foreground">{tagContactCounts[tag.id] || 0}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-primary" onClick={() => handleViewContacts(tag)}>
                          <Users className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Ver Contatos</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => handleEdit(tag)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Editar</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive/70 hover:text-destructive" onClick={() => handleDeleteClick(tag)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Excluir</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Create/Edit Tag Dialog */}
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
          <DialogContent className="sm:max-w-2xl p-0 overflow-hidden [&>button.absolute]:hidden">
            <div className="bg-blue-600 px-6 py-5 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                <Tag className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white">
                  {editingTag ? "Editar Tag" : "Nova Tag"}
                </h2>
                <p className="text-sm text-white/70">Configure tags para organização e automação</p>
              </div>
              <button onClick={handleClose} className="text-primary-foreground/70 hover:text-primary-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex border-b border-border">
              <button
                onClick={() => setActiveTab("geral")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === "geral" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Settings className="h-4 w-4" />
                Geral
              </button>
              <button
                onClick={() => setActiveTab("remarketing")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === "remarketing" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <RefreshCw className="h-4 w-4" />
                Remarketing
              </button>
            </div>

            <div className="px-6 py-5 space-y-6 max-h-[60vh] overflow-y-auto">
              {activeTab === "geral" ? (
                <>
                  <div className="space-y-4 rounded-lg border border-border p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Info className="h-4 w-4 text-primary" />
                      Informações Básicas
                    </div>
                    <div>
                      <FloatingInput label="Nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da tag" />
                    </div>
                    <div>
                      <FloatingSelectWrapper label="Cor" hasValue={!!color}>
                        <div className="flex items-center gap-2 border border-input rounded-md px-3 py-2">
                          <div
                            className="h-6 w-6 rounded cursor-pointer shrink-0 border border-border"
                            style={{ backgroundColor: color }}
                            onClick={() => setShowColorPicker(!showColorPicker)}
                          />
                          <Input
                            value={color}
                            onChange={(e) => setColor(e.target.value)}
                            className="border-0 p-0 h-auto shadow-none focus-visible:ring-0"
                            placeholder="#2196f3"
                          />
                          <Pencil className="h-4 w-4 text-muted-foreground cursor-pointer" onClick={() => setShowColorPicker(!showColorPicker)} />
                        </div>
                      </FloatingSelectWrapper>
                      {showColorPicker && (
                        <ColorPicker color={color} onChange={setColor} />
                      )}
                    </div>
                  </div>

                  <div className="space-y-4 rounded-lg border border-border p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      Configurações Avançadas
                    </div>
                    <div>
                      <FloatingSelectWrapper label="Tipo de Tag" hasValue={!!tagType}>
                        <Select value={tagType} onValueChange={setTagType}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {TAG_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>{t}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FloatingSelectWrapper>
                    </div>
                    <div>
                      <FloatingSelectWrapper label="Kanban" hasValue={true}>
                        <Select value={kanbanEnabled ? "true" : "false"} onValueChange={(v) => setKanbanEnabled(v === "true")}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Habilitado</SelectItem>
                            <SelectItem value="false">Desabilitado</SelectItem>
                          </SelectContent>
                        </Select>
                      </FloatingSelectWrapper>
                    </div>
                    <div>
                      <FloatingInput label="Ordenação" type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
                      <p className="text-xs text-muted-foreground mt-1">Defina a prioridade (0 = maior)</p>
                    </div>
                    <div className="flex items-start gap-2 rounded-lg bg-primary/5 p-3">
                      <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <p className="text-xs text-muted-foreground">
                        Tags com prioridade menor (0) aparecem primeiro. Use Kanban para visualização em quadros.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <RefreshCw className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Configurações de remarketing em breve</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={handleClose}>Cancelar</Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!name.trim() || saveMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {saveMutation.isPending ? "Salvando..." : editingTag ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-xl p-0 gap-0">
            <div className="bg-blue-600 text-white px-6 py-4 rounded-t-lg">
              <h3 className="text-lg font-bold">Excluir {tagToDelete?.name || "esta tag"}?</h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-foreground leading-relaxed">
                Esta ação não pode ser desfeita e removerá a tag de todos os contatos associados.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-6 pb-4">
              <Button variant="outline" className="uppercase font-semibold text-xs" onClick={() => setDeleteConfirmOpen(false)}>
                CANCELAR
              </Button>
              <Button
                className="bg-blue-600 text-white hover:bg-blue-700 uppercase font-semibold text-xs px-6"
                disabled={deleteMutation.isPending}
                onClick={() => tagToDelete && deleteMutation.mutate(tagToDelete.id)}
              >
                {deleteMutation.isPending ? "Excluindo..." : "OK"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Contacts Dialog */}
        <Dialog open={contactsOpen} onOpenChange={setContactsOpen}>
          <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
            <div className="bg-blue-600 px-6 py-5 flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white">Contatos da Tag</h2>
                {selectedTag && (
                  <Badge className="mt-1 text-xs text-primary-foreground" style={{ backgroundColor: resolveColor(selectedTag.color) }}>
                    {selectedTag.name}
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 gap-1">
                <Download className="h-4 w-4" /> Exportar
              </Button>
              <button onClick={() => setContactsOpen(false)} className="text-primary-foreground/70 hover:text-primary-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 border-b border-border">
              <div className="text-center py-4 border-r border-border">
                <p className="text-2xl font-bold text-primary">{totalContacts}</p>
                <p className="text-xs text-muted-foreground uppercase">Contatos Total</p>
              </div>
              <div className="text-center py-4">
                <p className="text-2xl font-bold text-primary">{tagContactCounts[selectedTag?.id] || 0}</p>
                <p className="text-xs text-muted-foreground uppercase">Total na Tag</p>
              </div>
            </div>

            <div className="px-6 pt-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome ou telefone..."
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="px-6 py-4 space-y-2 max-h-80 overflow-y-auto">
              {filteredContacts.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">Nenhum contato encontrado</p>
              ) : (
                filteredContacts.map((contact: any) => (
                  <div key={contact.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={contact.avatar_url} />
                        <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                          {getInitials(contact.name, contact.phone)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-card-foreground text-sm">{contact.name || contact.phone}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          📞 {formatPhone(contact.phone)}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" className="gap-1.5 bg-primary hover:bg-primary/90">
                      <MessageSquare className="h-3.5 w-3.5" /> CONVERSAR
                    </Button>
                  </div>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
};

export default Tags;
