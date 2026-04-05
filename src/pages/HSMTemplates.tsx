import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Search, X, Copy, Trash2, Eye, Pencil, ChevronUp, ChevronDown,
  AlertCircle, CheckCircle, Clock, XCircle, MinusCircle, LayoutGrid, List,
  Info, Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
  text: string;
  url?: string;
  phone?: string;
}

interface HSMTemplate {
  id: string;
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  language: string;
  status: "pending" | "approved" | "rejected" | "disabled";
  header_type: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT" | null;
  header_content: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[];
  variables: string[];
  rejection_reason: string | null;
  whatsapp_template_id: string | null;
  created_at: string;
  updated_at: string;
}

type CategoryType = "UTILITY" | "MARKETING" | "AUTHENTICATION";
type StatusType = "pending" | "approved" | "rejected" | "disabled";

const CATEGORY_LABELS: Record<CategoryType, string> = {
  UTILITY: "Utilitário",
  MARKETING: "Marketing",
  AUTHENTICATION: "Autenticação",
};

const CATEGORY_DESCRIPTIONS: Record<CategoryType, string> = {
  UTILITY: "Confirmações, atualizações de pedido, alertas",
  MARKETING: "Promoções, ofertas, novidades",
  AUTHENTICATION: "Códigos OTP, verificação",
};

const LANGUAGE_LABELS: Record<string, string> = {
  pt_BR: "Português (Brasil)",
  en_US: "English (US)",
  es_ES: "Español (España)",
};

const STATUS_CONFIG: Record<StatusType, { label: string; color: string; icon: React.ReactNode }> = {
  pending: {
    label: "Aguardando aprovação",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800",
    icon: <Clock className="h-3 w-3" />,
  },
  approved: {
    label: "Aprovado",
    color: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    icon: <CheckCircle className="h-3 w-3" />,
  },
  rejected: {
    label: "Rejeitado",
    color: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    icon: <XCircle className="h-3 w-3" />,
  },
  disabled: {
    label: "Desativado",
    color: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
    icon: <MinusCircle className="h-3 w-3" />,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\d+)\}\}/g) || [];
  const nums = Array.from(new Set(matches.map((m) => m.replace(/\{\{|\}\}/g, "")))).sort(
    (a, b) => Number(a) - Number(b)
  );
  return nums.map((n) => `{{${n}}}`);
}

function substituteVariables(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[n] || `{{${n}}}`);
}

// ─── WhatsApp Preview ─────────────────────────────────────────────────────────

function WhatsAppPreview({
  header_type,
  header_content,
  body,
  footer,
  buttons,
  varValues,
}: {
  header_type: string | null;
  header_content: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[];
  varValues: Record<string, string>;
}) {
  const renderedBody = substituteVariables(body, varValues);
  const renderedHeader =
    header_type === "TEXT" && header_content
      ? substituteVariables(header_content, varValues)
      : null;

  return (
    <div className="bg-[#e5ddd5] dark:bg-[#0b141a] rounded-xl p-4 flex flex-col items-start min-h-[200px]">
      <div className="max-w-[280px] w-full">
        <div className="bg-white dark:bg-[#202c33] rounded-xl shadow-md overflow-hidden">
          {/* Header */}
          {header_type && (
            <div className="bg-muted/40 px-3 pt-3 pb-1">
              {header_type === "TEXT" && renderedHeader && (
                <p className="font-semibold text-sm text-foreground">{renderedHeader}</p>
              )}
              {header_type === "IMAGE" && (
                <div className="h-24 bg-muted rounded flex items-center justify-center text-muted-foreground text-xs">
                  📷 Imagem
                </div>
              )}
              {header_type === "VIDEO" && (
                <div className="h-24 bg-muted rounded flex items-center justify-center text-muted-foreground text-xs">
                  🎬 Vídeo
                </div>
              )}
              {header_type === "DOCUMENT" && (
                <div className="h-12 bg-muted rounded flex items-center justify-center text-muted-foreground text-xs gap-2">
                  📄 Documento
                </div>
              )}
            </div>
          )}

          {/* Body */}
          <div className="px-3 py-2">
            <p className="text-sm text-foreground whitespace-pre-wrap leading-snug">{renderedBody || "Corpo da mensagem..."}</p>
          </div>

          {/* Footer */}
          {footer && (
            <div className="px-3 pb-2">
              <p className="text-xs text-muted-foreground">{footer}</p>
            </div>
          )}

          {/* Timestamp */}
          <div className="px-3 pb-2 flex justify-end">
            <span className="text-[10px] text-muted-foreground">agora</span>
          </div>
        </div>

        {/* Buttons */}
        {buttons.length > 0 && (
          <div className="mt-1 space-y-1">
            {buttons.map((btn, i) => (
              <div
                key={i}
                className="bg-white dark:bg-[#202c33] rounded-xl shadow-sm px-3 py-2 text-center text-sm text-[#00a884] font-medium border border-white/10"
              >
                {btn.type === "URL" ? "🔗 " : btn.type === "PHONE_NUMBER" ? "📞 " : ""}
                {btn.text || `Botão ${i + 1}`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Button Editor ────────────────────────────────────────────────────────────

function ButtonEditor({
  buttons,
  onChange,
}: {
  buttons: TemplateButton[];
  onChange: (btns: TemplateButton[]) => void;
}) {
  const addButton = () => {
    if (buttons.length >= 3) return;
    onChange([...buttons, { type: "QUICK_REPLY", text: "" }]);
  };

  const updateButton = (idx: number, updated: Partial<TemplateButton>) => {
    onChange(buttons.map((b, i) => (i === idx ? { ...b, ...updated } : b)));
  };

  const removeButton = (idx: number) => {
    onChange(buttons.filter((_, i) => i !== idx));
  };

  const moveButton = (idx: number, dir: -1 | 1) => {
    const arr = [...buttons];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    onChange(arr);
  };

  return (
    <div className="space-y-2">
      {buttons.map((btn, idx) => (
        <div key={idx} className="border border-border rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Select
              value={btn.type}
              onValueChange={(v) =>
                updateButton(idx, { type: v as TemplateButton["type"], url: undefined, phone: undefined })
              }
            >
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="QUICK_REPLY">Resposta Rápida</SelectItem>
                <SelectItem value="URL">URL</SelectItem>
                <SelectItem value="PHONE_NUMBER">Telefone</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => moveButton(idx, -1)}
                disabled={idx === 0}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => moveButton(idx, 1)}
                disabled={idx === buttons.length - 1}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => removeButton(idx)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <Input
            placeholder="Texto do botão"
            value={btn.text}
            onChange={(e) => updateButton(idx, { text: e.target.value })}
            className="h-8 text-xs"
          />

          {btn.type === "URL" && (
            <Input
              placeholder="https://exemplo.com/{{1}}"
              value={btn.url || ""}
              onChange={(e) => updateButton(idx, { url: e.target.value })}
              className="h-8 text-xs"
            />
          )}

          {btn.type === "PHONE_NUMBER" && (
            <Input
              placeholder="+5511999999999"
              value={btn.phone || ""}
              onChange={(e) => updateButton(idx, { phone: e.target.value })}
              className="h-8 text-xs"
            />
          )}
        </div>
      ))}

      {buttons.length < 3 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addButton}
          className="w-full text-xs h-8"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar botão
        </Button>
      )}
    </div>
  );
}

// ─── Template Dialog ──────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  category: "UTILITY" as CategoryType,
  language: "pt_BR",
  header_type: "" as "" | "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT",
  header_content: "",
  body: "",
  footer: "",
  buttons: [] as TemplateButton[],
};

type FormState = typeof EMPTY_FORM;

function TemplateDialog({
  open,
  onClose,
  onSaved,
  template,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  template: HSMTemplate | null;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [varValues, setVarValues] = useState<Record<string, string>>({});
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    if (template) {
      setForm({
        name: template.name,
        category: template.category,
        language: template.language,
        header_type: (template.header_type as FormState["header_type"]) || "",
        header_content: template.header_content || "",
        body: template.body,
        footer: template.footer || "",
        buttons: template.buttons || [],
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setVarValues({});
  }, [open, template]);

  const detectedVars = extractVariables(form.body);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const insertVariable = () => {
    const nums = detectedVars.map((v) => Number(v.replace(/\{\{|\}\}/g, "")));
    const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
    const tag = `{{${next}}}`;
    const ta = bodyRef.current;
    if (ta) {
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newBody = form.body.slice(0, start) + tag + form.body.slice(end);
      setField("body", newBody);
      setTimeout(() => {
        ta.focus();
        ta.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else {
      setField("body", form.body + tag);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Informe o nome do template"); return; }
    if (!form.body.trim()) { toast.error("O corpo da mensagem é obrigatório"); return; }

    setSaving(true);
    const payload = {
      name: form.name.trim(),
      category: form.category,
      language: form.language,
      header_type: form.header_type || null,
      header_content: form.header_type === "TEXT" ? (form.header_content.trim() || null) : null,
      body: form.body.trim(),
      footer: form.footer.trim() || null,
      buttons: form.buttons,
      variables: extractVariables(form.body),
    };

    let error;
    if (template) {
      ({ error } = await db.from("hsm_templates").update(payload).eq("id", template.id));
    } else {
      ({ error } = await db.from("hsm_templates").insert({ ...payload, status: "pending" }));
    }

    setSaving(false);
    if (error) { toast.error("Erro ao salvar: " + error.message); return; }
    toast.success(template ? "Template atualizado!" : "Template criado!");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle>{template ? "Editar Template HSM" : "Novo Template HSM"}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex">
          {/* Form */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Nome <span className="text-destructive">*</span></Label>
              <Input
                id="tpl-name"
                placeholder="ex: boas_vindas_cliente"
                value={form.name}
                onChange={(e) => setField("name", e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""))}
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">Use snake_case. Ex: boas_vindas_cliente</p>
            </div>

            {/* Categoria + Idioma */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Categoria <span className="text-destructive">*</span></Label>
                <Select value={form.category} onValueChange={(v) => setField("category", v as CategoryType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["UTILITY", "MARKETING", "AUTHENTICATION"] as CategoryType[]).map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        <div>
                          <p className="font-medium">{CATEGORY_LABELS[cat]}</p>
                          <p className="text-xs text-muted-foreground">{CATEGORY_DESCRIPTIONS[cat]}</p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Idioma</Label>
                <Select value={form.language} onValueChange={(v) => setField("language", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                      <SelectItem key={code} value={code}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Cabeçalho */}
            <div className="space-y-1.5">
              <Label>Cabeçalho <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Select
                value={form.header_type || "none"}
                onValueChange={(v) => setField("header_type", v === "none" ? "" : v as FormState["header_type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  <SelectItem value="TEXT">Texto</SelectItem>
                  <SelectItem value="IMAGE">Imagem</SelectItem>
                  <SelectItem value="VIDEO">Vídeo</SelectItem>
                  <SelectItem value="DOCUMENT">Documento</SelectItem>
                </SelectContent>
              </Select>
              {form.header_type === "TEXT" && (
                <Input
                  placeholder="Texto do cabeçalho"
                  value={form.header_content}
                  onChange={(e) => setField("header_content", e.target.value)}
                  maxLength={60}
                />
              )}
              {(form.header_type === "IMAGE" || form.header_type === "VIDEO" || form.header_type === "DOCUMENT") && (
                <p className="text-xs text-muted-foreground">
                  A mídia será enviada dinamicamente ao usar o template.
                </p>
              )}
            </div>

            {/* Corpo */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="tpl-body">Corpo <span className="text-destructive">*</span></Label>
                <div className="flex items-center gap-2">
                  <span className={cn("text-xs", form.body.length > 1024 ? "text-destructive" : "text-muted-foreground")}>
                    {form.body.length}/1024
                  </span>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={insertVariable}>
                    <Plus className="h-3 w-3 mr-1" /> Inserir variável
                  </Button>
                </div>
              </div>
              <Textarea
                id="tpl-body"
                ref={bodyRef}
                placeholder="Olá {{1}}, sua mensagem aqui..."
                value={form.body}
                onChange={(e) => setField("body", e.target.value)}
                rows={5}
                maxLength={1024}
                className="resize-none font-mono text-sm"
              />

              {/* Variable preview fields */}
              {detectedVars.length > 0 && (
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Valores de preview das variáveis</p>
                  <div className="grid grid-cols-2 gap-2">
                    {detectedVars.map((v) => {
                      const n = v.replace(/\{\{|\}\}/g, "");
                      return (
                        <div key={v} className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground shrink-0 w-8">{v}</span>
                          <Input
                            className="h-7 text-xs"
                            placeholder={`Valor ${n}`}
                            value={varValues[n] || ""}
                            onChange={(e) => setVarValues((prev) => ({ ...prev, [n]: e.target.value }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé */}
            <div className="space-y-1.5">
              <Label>Rodapé <span className="text-muted-foreground text-xs">(opcional, máx. 60 chars)</span></Label>
              <Input
                placeholder="Ex: Não responda a esta mensagem"
                value={form.footer}
                onChange={(e) => setField("footer", e.target.value)}
                maxLength={60}
              />
            </div>

            {/* Botões */}
            <div className="space-y-1.5">
              <Label>Botões <span className="text-muted-foreground text-xs">(opcional, máx. 3)</span></Label>
              <ButtonEditor buttons={form.buttons} onChange={(btns) => setField("buttons", btns)} />
            </div>
          </div>

          {/* Preview Panel */}
          <div className="w-72 shrink-0 border-l border-border flex flex-col">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold">Preview WhatsApp</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <WhatsAppPreview
                header_type={form.header_type || null}
                header_content={form.header_content || null}
                body={form.body}
                footer={form.footer || null}
                buttons={form.buttons}
                varValues={varValues}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border shrink-0">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : template ? "Salvar alterações" : "Criar template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── View Dialog ──────────────────────────────────────────────────────────────

function ViewTemplateDialog({
  open,
  onClose,
  template,
}: {
  open: boolean;
  onClose: () => void;
  template: HSMTemplate | null;
}) {
  if (!template) return null;
  const vars = extractVariables(template.body);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{template.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{CATEGORY_LABELS[template.category]}</Badge>
            <Badge variant="outline">{LANGUAGE_LABELS[template.language] || template.language}</Badge>
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
                STATUS_CONFIG[template.status].color
              )}
            >
              {STATUS_CONFIG[template.status].icon}
              {STATUS_CONFIG[template.status].label}
            </span>
          </div>

          {template.status === "rejected" && template.rejection_reason && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Motivo da rejeição:</p>
                <p>{template.rejection_reason}</p>
              </div>
            </div>
          )}

          <WhatsAppPreview
            header_type={template.header_type}
            header_content={template.header_content}
            body={template.body}
            footer={template.footer}
            buttons={template.buttons || []}
            varValues={{}}
          />

          {vars.length > 0 && (
            <div className="text-xs text-muted-foreground">
              Variáveis: {vars.join(", ")}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, rejectionReason }: { status: StatusType; rejectionReason: string | null }) {
  const cfg = STATUS_CONFIG[status];
  const badge = (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border cursor-default",
        cfg.color
      )}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );

  if (status === "rejected" && rejectionReason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent className="max-w-[240px] text-xs">{rejectionReason}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}

// ─── Category Badge ───────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<CategoryType, string> = {
  UTILITY: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800",
  MARKETING: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800",
  AUTHENTICATION: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800",
};

function CategoryBadge({ category }: { category: CategoryType }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border", CATEGORY_COLORS[category])}>
      {CATEGORY_LABELS[category]}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const HSMTemplates = () => {
  const [templates, setTemplates] = useState<HSMTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<CategoryType | "ALL">("ALL");
  const [filterStatus, setFilterStatus] = useState<StatusType | "ALL">("ALL");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [infoBannerDismissed, setInfoBannerDismissed] = useState(() =>
    localStorage.getItem("hsm_info_dismissed") === "true"
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<HSMTemplate | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<HSMTemplate | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const { data, error } = await db
      .from("hsm_templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar templates");
    } else {
      setTemplates(
        (data || []).map((t: any) => ({
          ...t,
          buttons: Array.isArray(t.buttons) ? t.buttons : [],
          variables: Array.isArray(t.variables) ? t.variables : [],
        }))
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const dismissBanner = () => {
    setInfoBannerDismissed(true);
    localStorage.setItem("hsm_info_dismissed", "true");
  };

  const handleEdit = (tpl: HSMTemplate) => {
    setEditingTemplate(tpl);
    setDialogOpen(true);
  };

  const handleNew = () => {
    setEditingTemplate(null);
    setDialogOpen(true);
  };

  const handleView = (tpl: HSMTemplate) => {
    setViewingTemplate(tpl);
    setViewDialogOpen(true);
  };

  const handleDuplicate = async (tpl: HSMTemplate) => {
    const { error } = await db.from("hsm_templates").insert({
      name: tpl.name + "_copia",
      category: tpl.category,
      language: tpl.language,
      header_type: tpl.header_type,
      header_content: tpl.header_content,
      body: tpl.body,
      footer: tpl.footer,
      buttons: tpl.buttons,
      variables: tpl.variables,
      status: "pending",
    });
    if (error) { toast.error("Erro ao duplicar template"); return; }
    toast.success("Template duplicado!");
    fetchTemplates();
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const { error } = await db.from("hsm_templates").delete().eq("id", id);
    setDeletingId(null);
    if (error) { toast.error("Erro ao excluir template"); return; }
    toast.success("Template excluído!");
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const filtered = templates.filter((t) => {
    if (filterCategory !== "ALL" && t.category !== filterCategory) return false;
    if (filterStatus !== "ALL" && t.status !== filterStatus) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.body.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Templates HSM (WhatsApp Business)</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Gerencie templates pré-aprovados para mensagens fora da janela de 24h
            </p>
          </div>
          <Button onClick={handleNew} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Template
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 space-y-4">
          {/* Info Banner */}
          {!infoBannerDismissed && (
            <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="flex-1">
                Templates precisam ser aprovados pela Meta antes de serem usados. O processo leva 24-48h.
              </p>
              <button onClick={dismissBanner} className="shrink-0 text-blue-500 hover:text-blue-700">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar templates..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as CategoryType | "ALL")}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas categorias</SelectItem>
                <SelectItem value="UTILITY">Utilitário</SelectItem>
                <SelectItem value="MARKETING">Marketing</SelectItem>
                <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as StatusType | "ALL")}>
              <SelectTrigger className="h-9 w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos status</SelectItem>
                <SelectItem value="pending">Aguardando</SelectItem>
                <SelectItem value="approved">Aprovados</SelectItem>
                <SelectItem value="rejected">Rejeitados</SelectItem>
                <SelectItem value="disabled">Desativados</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center border border-border rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={cn("px-2.5 py-1.5 text-sm transition-colors", viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                title="Grade"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn("px-2.5 py-1.5 text-sm transition-colors", viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
                title="Lista"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Templates Grid / List */}
          {loading ? (
            <div className="text-center py-16 text-muted-foreground">Carregando templates...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <div className="h-16 w-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Send className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="font-semibold text-foreground">Nenhum template encontrado</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search || filterCategory !== "ALL" || filterStatus !== "ALL"
                  ? "Tente ajustar os filtros"
                  : "Crie seu primeiro template HSM"}
              </p>
              {!search && filterCategory === "ALL" && filterStatus === "ALL" && (
                <Button className="mt-4 gap-2" onClick={handleNew}>
                  <Plus className="h-4 w-4" /> Novo Template
                </Button>
              )}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  template={tpl}
                  onView={() => handleView(tpl)}
                  onEdit={() => handleEdit(tpl)}
                  onDuplicate={() => handleDuplicate(tpl)}
                  onDelete={() => handleDelete(tpl.id)}
                  deleting={deletingId === tpl.id}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((tpl) => (
                <TemplateRow
                  key={tpl.id}
                  template={tpl}
                  onView={() => handleView(tpl)}
                  onEdit={() => handleEdit(tpl)}
                  onDuplicate={() => handleDuplicate(tpl)}
                  onDelete={() => handleDelete(tpl.id)}
                  deleting={deletingId === tpl.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <TemplateDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={fetchTemplates}
        template={editingTemplate}
      />

      {/* View Dialog */}
      <ViewTemplateDialog
        open={viewDialogOpen}
        onClose={() => setViewDialogOpen(false)}
        template={viewingTemplate}
      />
    </div>
  );
};

// ─── Template Card (Grid) ─────────────────────────────────────────────────────

function TemplateCard({
  template,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  deleting,
}: {
  template: HSMTemplate;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="border border-border rounded-xl p-4 bg-card hover:shadow-md transition-shadow flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-sm font-semibold text-foreground truncate flex-1">{template.name}</p>
        <span className="text-xs text-muted-foreground shrink-0">{LANGUAGE_LABELS[template.language] || template.language}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <CategoryBadge category={template.category} />
        <StatusBadge status={template.status} rejectionReason={template.rejection_reason} />
      </div>

      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
        {template.body.slice(0, 120)}{template.body.length > 120 ? "..." : ""}
      </p>

      {template.buttons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {template.buttons.map((btn, i) => (
            <span key={i} className="text-[10px] border border-border rounded px-1.5 py-0.5 text-muted-foreground bg-muted/50">
              {btn.type === "URL" ? "🔗" : btn.type === "PHONE_NUMBER" ? "📞" : "↩"} {btn.text}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 pt-1 border-t border-border">
        <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={onView}>
          <Eye className="h-3.5 w-3.5 mr-1" /> Visualizar
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs flex-1" onClick={onDuplicate}>
          <Copy className="h-3.5 w-3.5 mr-1" /> Duplicar
        </Button>
        {confirmDelete ? (
          <div className="flex gap-1">
            <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={onDelete} disabled={deleting}>
              {deleting ? "..." : "Confirmar"}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setConfirmDelete(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10 p-0" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Template Row (List) ──────────────────────────────────────────────────────

function TemplateRow({
  template,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  deleting,
}: {
  template: HSMTemplate;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="border border-border rounded-lg px-4 py-3 bg-card flex items-center gap-4 hover:shadow-sm transition-shadow">
      <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_auto_1fr] gap-4 items-center">
        <p className="font-mono text-sm font-medium text-foreground truncate">{template.name}</p>
        <CategoryBadge category={template.category} />
        <StatusBadge status={template.status} rejectionReason={template.rejection_reason} />
        <p className="text-xs text-muted-foreground truncate hidden md:block">
          {template.body.slice(0, 80)}{template.body.length > 80 ? "..." : ""}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onView} title="Visualizar">
          <Eye className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="Editar">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDuplicate} title="Duplicar">
          <Copy className="h-4 w-4" />
        </Button>
        {confirmDelete ? (
          <div className="flex gap-1">
            <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={onDelete} disabled={deleting}>
              {deleting ? "..." : "Excluir"}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setConfirmDelete(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmDelete(true)} title="Excluir">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default HSMTemplates;
