import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { TOUR_STEPS, TourStep } from "@/hooks/useOnboardingTour";

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TooltipPos {
  top: number;
  left: number;
}

function getElementRect(selector: string): DOMRect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  return el.getBoundingClientRect();
}

function computeTooltipPos(
  rect: SpotlightRect,
  position: TourStep["position"],
  tooltipW = 288,
  tooltipH = 200
): TooltipPos {
  const padding = 12;
  switch (position) {
    case "right":
      return {
        top: rect.top + rect.height / 2 - tooltipH / 2,
        left: rect.left + rect.width + padding,
      };
    case "left":
      return {
        top: rect.top + rect.height / 2 - tooltipH / 2,
        left: rect.left - tooltipW - padding,
      };
    case "top":
      return {
        top: rect.top - tooltipH - padding,
        left: rect.left + rect.width / 2 - tooltipW / 2,
      };
    case "bottom":
    default:
      return {
        top: rect.top + rect.height + padding,
        left: rect.left + rect.width / 2 - tooltipW / 2,
      };
  }
}

interface OnboardingTourProps {
  tourActive: boolean;
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onEnd: () => void;
}

const TOOLTIP_W = 288;
const TOOLTIP_H = 210;

const OnboardingTour: React.FC<OnboardingTourProps> = ({
  tourActive,
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onEnd,
}) => {
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos>({ top: 0, left: 0 });
  const [visible, setVisible] = useState(false);

  const step = TOUR_STEPS[currentStep];

  const resolveStep = useCallback(
    (stepIndex: number, attempt = 0) => {
      if (!tourActive) return;
      const s = TOUR_STEPS[stepIndex];
      const rect = getElementRect(s.target);

      if (!rect || rect.width === 0) {
        // Element not found or hidden — skip to next if possible
        if (stepIndex < TOUR_STEPS.length - 1 && attempt < 2) {
          // Try next step
          onNext();
        } else {
          onEnd();
        }
        return;
      }

      const pad = 6;
      const sr: SpotlightRect = {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      };

      setSpotlight(sr);
      setTooltipPos(computeTooltipPos(sr, s.position, TOOLTIP_W, TOOLTIP_H));
      setVisible(false);
      // Small delay for fade-in animation
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    },
    [tourActive, onNext, onEnd]
  );

  useEffect(() => {
    if (!tourActive) {
      setSpotlight(null);
      setVisible(false);
      return;
    }
    resolveStep(currentStep);
  }, [tourActive, currentStep, resolveStep]);

  // Keep spotlight updated on scroll/resize
  useEffect(() => {
    if (!tourActive) return;
    const update = () => resolveStep(currentStep);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [tourActive, currentStep, resolveStep]);

  if (!tourActive || !spotlight) return null;

  // Clamp tooltip to viewport
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const clampedLeft = Math.max(8, Math.min(tooltipPos.left, vpW - TOOLTIP_W - 8));
  const clampedTop = Math.max(8, Math.min(tooltipPos.top, vpH - TOOLTIP_H - 8));

  return createPortal(
    <>
      {/* Dark overlay */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          pointerEvents: "none",
          background: "rgba(0,0,0,0.65)",
          // Cut out the spotlight using a clip path approach
          // We use box-shadow on the highlight div instead
        }}
      />

      {/* Spotlight highlight div — box-shadow creates the "cut-out" effect */}
      <div
        style={{
          position: "fixed",
          top: spotlight.top,
          left: spotlight.left,
          width: spotlight.width,
          height: spotlight.height,
          zIndex: 9999,
          borderRadius: 8,
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
          pointerEvents: "none",
          transition: "all 0.25s ease",
        }}
      />

      {/* Tooltip card */}
      <div
        style={{
          position: "fixed",
          top: clampedTop,
          left: clampedLeft,
          width: TOOLTIP_W,
          zIndex: 10000,
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(6px)",
          transition: "opacity 0.2s ease, transform 0.2s ease",
          pointerEvents: "auto",
        }}
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-5 border border-blue-200 dark:border-blue-800"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">
            Passo {currentStep + 1} de {totalSteps}
          </span>
          <button
            onClick={onEnd}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            title="Fechar tour"
          >
            ×
          </button>
        </div>

        {/* Title */}
        <h3 className="font-bold text-lg mb-1 text-foreground">{step.title}</h3>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-4">{step.description}</p>

        {/* Footer nav */}
        <div className="flex items-center justify-between">
          <button
            onClick={onPrev}
            disabled={currentStep === 0}
            className="text-sm text-muted-foreground disabled:opacity-40 hover:text-foreground transition-colors"
          >
            ← Anterior
          </button>

          {/* Dot indicators */}
          <div className="flex gap-1">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentStep ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>

          <button
            onClick={onNext}
            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
          >
            {currentStep === totalSteps - 1 ? "Concluir ✓" : "Próximo →"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
};

export default OnboardingTour;
