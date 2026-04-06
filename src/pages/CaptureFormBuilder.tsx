import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Plus, Copy, Trash2, X, FormInput } from "lucide-react";

interface FormField {
  label: string;
  type: string;
  required: boolean;
}

interface CaptureForm {
  id: string;
  name: string;
  slug: string;
  fields: FormField[];
  destination_team_id: string | null;
  created_at: string;
}

interface Team {
  id: string;
  name: string;
}

const FIELD_TYPES = [
  { value: "text", label: "Texto" },
  { value: "email", label: "E-mail" },
  { value: "tel", label: "Telefone" },
  { value: "textarea", label: "Texto longo" },
  { value: "select", label: "Seleção" },
  { value: "number", label: "Número" },
];

export default function CaptureFormBuilder() {
  const [forms, setForms] = useState<CaptureForm[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // New form state
  const [formName, setFormName] = useState("");
  const [fields, setFields] = useState<FormField[]>([
    { label: "Nome", type: "text", required: true },
    { label: "Telefone", type: "tel", required: true },
    { label: "E-mail", type: "email", required: false },
  ]);
  const [destinationTeamId, setDestinationTeamId] = useState("");

  useEffect(() => {
    loadForms();
    loadTeams();
  }, []);

  async function loadForms() {
    setLoading(true);
    try {
      const data = await api.get<CaptureForm[]>("/capture-forms");
      setForms(data || []);
    } catch {
      setForms([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadTeams() {
    try {
      const data = await api.get<Team[]>("/teams");
      setTeams(data || []);
    } catch {
      setTeams([]);
    }
  }

  function openModal() {
    setFormName("");
    setFields([
      { label: "Nome", type: "text", required: true },
      { label: "Telefone", type: "tel", required: true },
      { label: "E-mail", type: "email", required: false },
    ]);
    setDestinationTeamId("");
    setModalOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      await api.post("/capture-forms", {
        name: formName.trim(),
        fields,
        destination_team_id: destinationTeamId || null,
      });
      setModalOpen(false);
      await loadForms();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este formulário?")) return;
    await api.delete(`/capture-forms/${id}`);
    setForms((prev) => prev.filter((f) => f.id !== id));
  }

  function copyPublicUrl(slug: string, id: string) {
    const url = `${window.location.origin}/f/${slug}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function addField() {
    setFields((prev) => [...prev, { label: "", type: "text", required: false }]);
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  function updateField(index: number, updates: Partial<FormField>) {
    setFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FormInput className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold text-foreground">Formulários de Captação</h1>
            <p className="text-sm text-muted-foreground">Crie formulários públicos para captar leads</p>
          </div>
        </div>
        <Button onClick={openModal} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Nova Form
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      ) : forms.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FormInput className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum formulário criado ainda.</p>
          <p className="text-xs mt-1">Clique em "Nova Form" para criar o primeiro.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {forms.map((form) => (
            <div
              key={form.id}
              className="bg-card border border-border rounded-lg px-5 py-4 flex items-center justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">{form.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {form.fields?.length || 0} campo(s) · slug: <span className="font-mono">{form.slug}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                  {window.location.origin}/f/{form.slug}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1.5"
                  onClick={() => copyPublicUrl(form.slug, form.id)}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copiedId === form.id ? "Copiado!" : "Copiar URL pública"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(form.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold text-foreground">Criar Formulário</h2>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setModalOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Nome do Formulário</label>
                <input
                  className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Ex: Formulário de Contato"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>

              {/* Destination team */}
              <div>
                <label className="text-xs font-medium text-foreground mb-1 block">Equipe de Destino (opcional)</label>
                <select
                  className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  value={destinationTeamId}
                  onChange={(e) => setDestinationTeamId(e.target.value)}
                >
                  <option value="">Sem equipe específica</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Fields builder */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-foreground">Campos do Formulário</label>
                  <button
                    type="button"
                    onClick={addField}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Adicionar campo
                  </button>
                </div>
                <div className="space-y-2">
                  {fields.map((field, index) => (
                    <div key={index} className="flex items-center gap-2 bg-muted/40 rounded-md p-2">
                      <input
                        className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        placeholder="Label"
                        value={field.label}
                        onChange={(e) => updateField(index, { label: e.target.value })}
                      />
                      <select
                        className="text-xs border border-border rounded px-2 py-1.5 bg-background text-foreground focus:outline-none"
                        value={field.type}
                        onChange={(e) => updateField(index, { type: e.target.value })}
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateField(index, { required: e.target.checked })}
                          className="rounded"
                        />
                        Obrig.
                      </label>
                      <button
                        type="button"
                        onClick={() => removeField(index)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !formName.trim()}>
                {saving ? "Salvando..." : "Criar Formulário"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
