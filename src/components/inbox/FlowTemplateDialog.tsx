import { LayoutTemplate, RotateCw, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { FlowTemplate, FlowTemplateStep } from "@/pages/FlowTemplates";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: FlowTemplate[];
  loading: boolean;
  applyingId: string | null;
  onApply: (tpl: FlowTemplate) => void;
}

const STEP_LABELS: Record<FlowTemplateStep["type"], string> = {
  send_message:       "Mensagem",
  add_tag:            "Tag +",
  remove_tag:         "Tag -",
  assign_agent:       "Atribuir",
  wait:               "Aguardar",
  close_conversation: "Encerrar",
  send_note:          "Nota",
  add_label:          "Etiqueta +",
};

export default function FlowTemplateDialog({ open, onOpenChange, templates, loading, applyingId, onApply }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            Aplicar Template de Atendimento
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-3 scrollbar-thin">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
              <RotateCw className="h-5 w-5 animate-spin" />
              <span className="text-sm">Carregando templates...</span>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <LayoutTemplate className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhum template cadastrado</p>
              <p className="text-xs mt-1">Crie templates em <strong>Templates de Atendimento</strong></p>
            </div>
          ) : (
            templates.map((tpl) => (
              <div key={tpl.id} className="border border-border rounded-lg p-4 hover:bg-accent/30 transition-colors">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground">{tpl.name}</p>
                    {tpl.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="gap-1.5 h-8 px-3 text-xs shrink-0"
                    onClick={() => onApply(tpl)}
                    disabled={applyingId === tpl.id}
                  >
                    {applyingId === tpl.id ? (
                      <RotateCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5" />
                    )}
                    {applyingId === tpl.id ? "Aplicando..." : "Aplicar"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tpl.steps.slice().sort((a, b) => a.order - b.order).map((step) => (
                    <span
                      key={step.id}
                      className="inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border"
                    >
                      {step.type === "wait"
                        ? `Aguardar ${step.config.wait_minutes ?? "?"}min`
                        : STEP_LABELS[step.type]}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Passos de espera são ignorados na aplicação imediata.
                </p>
              </div>
            ))
          )}
        </div>
        <DialogFooter className="pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
