import { useState, useEffect } from "react";
import {
  Plus, Pencil, Trash2, Copy, QrCode, ToggleLeft, ToggleRight, Link2, Users, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FloatingInput } from "@/components/ui/floating-input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ContactForm {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  fields: string[];
  welcome_message: string | null;
  success_message: string | null;
  assign_tag: string | null;
  assign_to: string | null;
  redirect_whatsapp: boolean;
  whatsapp_message: string | null;
  is_active: boolean;
  submission_count: number;
  created_at: string;
}

interface AgentOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

const AVAILABLE_FIELDS = [
  { key: "name", label: "Nome" },
  { key: "phone", label: "Telefone" },
  { key: "email", label: "E-mail" },
  { key: "company", label: "Empresa" },
  { key: "message", label: "Mensagem" },
];

const DEFAULT_FORM: Omit<ContactForm, "id" | "slug" | "created_at" | "submission_count"> = {
  name: "",
  description: "",
  fields: ["name", "phone", "email"],
  welcome_message: "Olá! Preencha seus dados para entrarmos em contato.",
  success_message: "Obrigado! Seus dados foram recebidos.",
  assign_tag: "",
  assign_to: null,
  redirect_whatsapp: false,
  whatsapp_message: "",
  is_active: true,
};

const ContactForms = () => {
  const [forms, setForms] = useState<ContactForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingForm, setEditingForm] = useState<ContactForm | null>(null);
  const [formData, setFormData] = useState({ ...DEFAULT_FORM });
  const [saving, setSaving] = useState(false);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [qrModal, setQrModal] = useState<{ url: string; name: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ContactForm | null>(null);

  useEffect(() => {
    fetchForms();
    fetchAgents();
  }, []);

  const fetchForms = async () => {
    setLoading(true);
    const { data } = await (supabase as any).from("contact_forms").select("*").order("created_at", { ascending: false });
    setForms((data || []) as ContactForm[]);
    setLoading(false);
  };

  const fetchAgents = async () => {
    const { data } = await supabase.from("profiles").select("id, full_name, email");
    setAgents((data || []) as AgentOption[]);
  };

  const openCreate = () => {
    setEditingForm(null);
    setFormData({ ...DEFAULT_FORM });
    setDialogOpen(true);
  };

  const openEdit = (form: ContactForm) => {
    setEditingForm(form);
    setFormData({
      name: form.name,
      description: form.description || "",
      fields: form.fields,
      welcome_message: form.welcome_message || "",
      success_message: form.success_message || "",
      assign_tag: form.assign_tag || "",
      assign_to: form.assign_to || null,
      redirect_whatsapp: form.redirect_whatsapp,
      whatsapp_message: form.whatsapp_message || "",
      is_active: form.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    const payload = {
      name: formData.name.trim(),
      description: formData.description || null,
      fields: formData.fields,
      welcome_message: formData.welcome_message || null,
      success_message: formData.success_message || null,
      assign_tag: formData.assign_tag || null,
      assign_to: formData.assign_to || null,
      redirect_whatsapp: formData.redirect_whatsapp,
      whatsapp_message: formData.whatsapp_message || null,
      is_active: formData.is_active,
    };

    if (editingForm) {
      const { error } = await (supabase as any).from("contact_forms").update(payload).eq("id", editingForm.id);
      if (error) { toast.error("Erro ao salvar formulário"); setSaving(false); return; }
      toast.success("Formulário atualizado!");
    } else {
      const { error } = await (supabase as any).from("contact_forms").insert(payload);
      if (error) { toast.error("Erro ao criar formulário"); setSaving(false); return; }
      toast.success("Formulário criado!");
    }
    setSaving(false);
    setDialogOpen(false);
    fetchForms();
  };

  const handleToggleActive = async (form: ContactForm) => {
    await (supabase as any).from("contact_forms").update({ is_active: !form.is_active }).eq("id", form.id);
    setForms((prev) => prev.map((f) => f.id === form.id ? { ...f, is_active: !f.is_active } : f));
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await (supabase as any).from("contact_forms").delete().eq("id", deleteConfirm.id);
    toast.success("Formulário excluído!");
    setDeleteConfirm(null);
    fetchForms();
  };

  const handleCopyLink = (slug: string) => {
    const url = `${window.location.origin}/form/${slug}`;
    navigator.clipboard.writeText(url).then(() => toast.success("Link copiado!"));
  };

  const handleShowQR = (slug: string, name: string) => {
    const url = `${window.location.origin}/form/${slug}`;
    setQrModal({ url, name });
  };

  const toggleField = (key: string) => {
    setFormData((prev) => ({
      ...prev,
      fields: prev.fields.includes(key)
        ? prev.fields.filter((f) => f !== key)
        : [...prev.fields, key],
    }));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white dark:bg-gray-900 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
            <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Formulários de Captação
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Links e QR Codes para auto-cadastro de contatos
            </p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Formulário
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center h-48 text-gray-400">
            Carregando formulários...
          </div>
        )}

        {!loading && forms.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 text-center">
            <FileText className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-lg font-medium">Nenhum formulário criado</p>
            <p className="text-sm mt-1">Crie seu primeiro formulário de captação</p>
          </div>
        )}

        {forms.map((form) => (
          <Card key={form.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-gray-900 dark:text-white truncate">
                  {form.name}
                </span>
                <Badge variant={form.is_active ? "default" : "secondary"} className="text-xs">
                  {form.is_active ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              {form.description && (
                <p className="text-sm text-gray-500 truncate mt-0.5">{form.description}</p>
              )}
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                <span className="font-mono">/form/{form.slug.slice(0, 12)}…</span>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {form.submission_count} envios
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <Switch
                checked={form.is_active}
                onCheckedChange={() => handleToggleActive(form)}
                title={form.is_active ? "Desativar" : "Ativar"}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => handleCopyLink(form.slug)}
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar link
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => handleShowQR(form.slug, form.name)}
              >
                <QrCode className="h-3.5 w-3.5" />
                QR Code
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEdit(form)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-500 hover:text-red-700"
                onClick={() => setDeleteConfirm(form)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingForm ? "Editar Formulário" : "Novo Formulário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FloatingInput
              label="Nome *"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
            />
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                Descrição
              </label>
              <Input
                placeholder="Descrição opcional"
                value={formData.description || ""}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Mensagem de boas-vindas
              </label>
              <Textarea
                value={formData.welcome_message || ""}
                onChange={(e) => setFormData((p) => ({ ...p, welcome_message: e.target.value }))}
                rows={2}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Mensagem de sucesso
              </label>
              <Textarea
                value={formData.success_message || ""}
                onChange={(e) => setFormData((p) => ({ ...p, success_message: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Fields */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                Campos a exibir
              </label>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center gap-1.5 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={formData.fields.includes(f.key)}
                      onChange={() => toggleField(f.key)}
                      className="rounded"
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                Tag automática ao enviar
              </label>
              <Input
                placeholder="Ex: lead-site"
                value={formData.assign_tag || ""}
                onChange={(e) => setFormData((p) => ({ ...p, assign_tag: e.target.value }))}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                Atribuir automaticamente ao agente
              </label>
              <Select
                value={formData.assign_to || "none"}
                onValueChange={(v) => setFormData((p) => ({ ...p, assign_to: v === "none" ? null : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Nenhum (não atribuir)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.full_name || a.email || a.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Redirecionar para WhatsApp após envio</div>
                <div className="text-xs text-gray-400">Abre o WhatsApp com mensagem pré-definida</div>
              </div>
              <Switch
                checked={formData.redirect_whatsapp}
                onCheckedChange={(v) => setFormData((p) => ({ ...p, redirect_whatsapp: v }))}
              />
            </div>

            {formData.redirect_whatsapp && (
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  Mensagem WhatsApp
                </label>
                <Textarea
                  placeholder="Olá! Acabei de me cadastrar..."
                  value={formData.whatsapp_message || ""}
                  onChange={(e) => setFormData((p) => ({ ...p, whatsapp_message: e.target.value }))}
                  rows={2}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Salvando..." : editingForm ? "Salvar alterações" : "Criar formulário"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code Modal */}
      {qrModal && (
        <Dialog open={!!qrModal} onOpenChange={() => setQrModal(null)}>
          <DialogContent className="max-w-sm text-center">
            <DialogHeader>
              <DialogTitle>QR Code — {qrModal.name}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-4">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrModal.url)}`}
                alt="QR Code"
                className="border rounded-lg"
                width={200}
                height={200}
              />
              <div className="flex items-center gap-1 text-xs text-gray-500 font-mono break-all">
                <Link2 className="h-3 w-3 shrink-0" />
                {qrModal.url}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(qrModal.url).then(() => toast.success("Link copiado!"))}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copiar link
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Excluir formulário</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 py-2">
              Tem certeza que deseja excluir <b>{deleteConfirm.name}</b>? Esta ação não pode ser desfeita.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default ContactForms;
