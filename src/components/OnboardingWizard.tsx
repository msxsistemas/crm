import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import api from "@/lib/api";
import {
  MessageCircle,
  Users,
  BarChart2,
  Settings,
  Inbox,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  X,
} from "lucide-react";

const TOTAL_STEPS = 5;

const featureCards = [
  {
    icon: Inbox,
    title: "Caixa de Entrada",
    description: "Gerencie todas as conversas do WhatsApp em um só lugar.",
    color: "bg-green-500/10 text-green-600 dark:text-green-400",
  },
  {
    icon: Users,
    title: "Contatos",
    description: "Organize e segmente seus clientes com etiquetas e grupos.",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  {
    icon: BarChart2,
    title: "Pipeline",
    description: "Acompanhe oportunidades de venda em um funil visual.",
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  {
    icon: BarChart2,
    title: "Relatórios",
    description: "Análise de desempenho e métricas de atendimento em tempo real.",
    color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  {
    icon: Settings,
    title: "Configurações",
    description: "Personalize conexões, automações, bots e muito mais.",
    color: "bg-gray-500/10 text-gray-600 dark:text-gray-400",
  },
];

export default function OnboardingWizard() {
  const { user, refreshUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [signature, setSignature] = useState("");
  const [signingEnabled, setSigningEnabled] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Show wizard if onboarding_completed is false/null
    if (!(user as any).onboarding_completed) {
      setFullName((user as any).full_name || (user as any).name || "");
      setAvatarUrl((user as any).avatar_url || "");
      setSignature((user as any).signature || "");
      setSigningEnabled(!!(user as any).signing_enabled);
      setOpen(true);
    }
  }, [user]);

  if (!open) return null;

  const progressPercent = Math.round((step / TOTAL_STEPS) * 100);

  const handleNext = () => {
    if (step < TOTAL_STEPS) setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep((s) => s - 1);
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await api.patch("/auth/me", {
        full_name: fullName,
        avatar_url: avatarUrl || undefined,
        signature,
        signing_enabled: signingEnabled,
        onboarding_completed: true,
      });
      await refreshUser();
      setOpen(false);
    } catch {
      // Even on error, close so user isn't stuck
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    try {
      await api.patch("/auth/me", { onboarding_completed: true });
      await refreshUser();
    } catch {}
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden">
        {/* Close / skip button */}
        <button
          onClick={handleSkip}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors z-10"
          title="Pular onboarding"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Progress bar */}
        <div className="h-1.5 bg-muted w-full">
          <div
            className="h-full bg-primary transition-all duration-500 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 pb-1 flex items-center justify-between">
          <span className="text-xs text-muted-foreground font-medium">
            Passo {step} de {TOTAL_STEPS}
          </span>
          <div className="flex gap-1">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 w-6 rounded-full transition-colors",
                  i + 1 <= step ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 px-6 pt-4 pb-6">
          {step === 1 && (
            <div className="text-center space-y-4 py-4">
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-primary/10 mx-auto">
                <MessageCircle className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">
                Bem-vindo,{" "}
                {(user as any)?.full_name || (user as any)?.name || "Agente"}!
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Ficamos felizes em tê-lo aqui. Este assistente rápido vai ajudá-lo a
                configurar seu perfil e conhecer os principais recursos do{" "}
                <span className="text-primary font-semibold">MSX CRM</span>.
              </p>
              <p className="text-sm text-muted-foreground">
                Leva menos de 2 minutos. Vamos começar?
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">Seu Perfil</h2>
                <p className="text-sm text-muted-foreground">
                  Complete suas informações para que seus clientes te reconheçam.
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="onb-name" className="text-sm font-medium">
                    Nome completo
                  </Label>
                  <Input
                    id="onb-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Seu nome"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="onb-avatar" className="text-sm font-medium">
                    URL do avatar (opcional)
                  </Label>
                  <Input
                    id="onb-avatar"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Função</Label>
                  <div className="mt-1 flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/50 text-sm text-muted-foreground">
                    {(user as any)?.role || "agent"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">Assinatura</h2>
                <p className="text-sm text-muted-foreground">
                  Configure uma assinatura que aparece automaticamente ao enviar mensagens.
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="onb-sig" className="text-sm font-medium">
                    Texto da assinatura
                  </Label>
                  <Textarea
                    id="onb-sig"
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    placeholder={`Ex.: Atenciosamente,\n${fullName || "Seu Nome"}\nEquipe de Atendimento`}
                    rows={4}
                    className="mt-1 resize-none"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Ativar assinatura</p>
                    <p className="text-xs text-muted-foreground">
                      Adicionar automaticamente ao enviar mensagens
                    </p>
                  </div>
                  <Switch
                    checked={signingEnabled}
                    onCheckedChange={setSigningEnabled}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-xl font-bold text-foreground mb-1">Tour Rápido</h2>
                <p className="text-sm text-muted-foreground">
                  Conheça os 5 principais recursos do CRM.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {featureCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.title}
                      className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3"
                    >
                      <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg shrink-0", card.color)}>
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{card.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="text-center space-y-5 py-4">
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-green-500/10 mx-auto">
                <CheckCircle2 className="h-9 w-9 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Você está pronto!</h2>
              <p className="text-muted-foreground leading-relaxed">
                Seu perfil está configurado. Agora você pode começar a atender seus
                clientes e aproveitar todos os recursos do MSX CRM.
              </p>
              <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground text-left space-y-1">
                <p className="font-medium text-foreground text-xs uppercase tracking-wide mb-2">Resumo da configuração</p>
                <p>Nome: <span className="text-foreground font-medium">{fullName || "Não informado"}</span></p>
                <p>Assinatura: <span className="text-foreground font-medium">{signingEnabled ? "Ativada" : "Desativada"}</span></p>
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4 bg-muted/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={step === 1 ? handleSkip : handleBack}
            className="text-muted-foreground"
          >
            {step === 1 ? (
              "Pular"
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Voltar
              </>
            )}
          </Button>
          {step < TOTAL_STEPS ? (
            <Button size="sm" onClick={handleNext} className="gap-1">
              Próximo
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleFinish} disabled={saving} className="gap-1 bg-green-600 hover:bg-green-700 text-white">
              {saving ? "Salvando..." : "Começar"}
              {!saving && <ChevronRight className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
