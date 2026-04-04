import { useState, useCallback } from "react";

export interface TourStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="inbox"]',
    title: "💬 Inbox",
    description:
      "Aqui ficam todas as conversas do WhatsApp. Responda mensagens, transfira e organize os atendimentos.",
    position: "right",
  },
  {
    target: '[data-tour="contacts"]',
    title: "👥 Contatos",
    description:
      "Gerencie sua base de contatos. Importe via CSV, adicione campos customizados e organize em grupos.",
    position: "right",
  },
  {
    target: '[data-tour="campaigns"]',
    title: "📢 Campanhas",
    description:
      "Dispare mensagens em massa para grupos de contatos. Acompanhe as taxas de entrega em tempo real.",
    position: "right",
  },
  {
    target: '[data-tour="bots"]',
    title: "🤖 Chatbot",
    description:
      "Configure fluxos automáticos de atendimento. Use o editor visual para criar jornadas sem código.",
    position: "right",
  },
  {
    target: '[data-tour="dashboard"]',
    title: "📊 Dashboard",
    description:
      "Acompanhe métricas em tempo real: conversas, performance dos agentes, heatmap de horários e metas.",
    position: "right",
  },
  {
    target: '[data-tour="notifications"]',
    title: "🔔 Notificações",
    description:
      "Receba alertas de novas mensagens, menções e transferências em tempo real.",
    position: "bottom",
  },
  {
    target: '[data-tour="settings"]',
    title: "⚙️ Configurações",
    description:
      "Configure conexões WhatsApp, horários de atendimento, SLA, etiquetas e muito mais.",
    position: "right",
  },
];

export function useOnboardingTour() {
  const [tourActive, setTourActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setTourActive(true);
    // Set flag immediately to prevent re-triggers
    localStorage.setItem("onboarding_completed", "true");
  }, []);

  const endTour = useCallback(() => {
    setTourActive(false);
    localStorage.setItem("onboarding_completed", "true");
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((s) => {
      if (s < TOUR_STEPS.length - 1) return s + 1;
      // Last step: end tour
      setTourActive(false);
      return s;
    });
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  return {
    tourActive,
    currentStep,
    startTour,
    endTour,
    nextStep,
    prevStep,
    totalSteps: TOUR_STEPS.length,
  };
}
