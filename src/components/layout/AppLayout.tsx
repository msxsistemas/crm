import { Outlet } from "react-router-dom";
import { Suspense, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AppSidebar from "./AppSidebar";
import TopBar from "./TopBar";
import { useAuth } from "@/hooks/useAuth";
import { usePresence } from "@/hooks/usePresence";
import { useOnboardingTour } from "@/hooks/useOnboardingTour";
import { useGlobalKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import OnboardingTour from "@/components/onboarding/OnboardingTour";
import GlobalSearch from "@/components/GlobalSearch";
import { SessionTimeoutWarning } from "@/components/SessionTimeoutWarning";
import OnboardingWizard from "@/components/OnboardingWizard";
import { ShortcutsCheatsheet } from "@/components/ShortcutsCheatsheet";
import { KeyboardShortcutsManager } from "@/components/KeyboardShortcutsManager";

const AppLayout = () => {
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuário";
  const { updateStatus } = usePresence(user?.id, userName);
  const { tourActive, currentStep, totalSteps, startTour, endTour, nextStep, prevStep } =
    useOnboardingTour();
  const [searchOpen, setSearchOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  useGlobalKeyboardShortcuts({
    onOpenSearch: () => setSearchOpen((prev) => !prev),
    onOpenCheatsheet: () => setCheatsheetOpen(true),
  });

  // Set offline on tab/window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliability on unload
      updateStatus("offline");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [updateStatus]);

  // Auto-start tour for new users (after 1s delay to let DOM settle)
  useEffect(() => {
    if (!user) return;
    const completed = localStorage.getItem("onboarding_completed");
    if (completed) return;
    const timer = setTimeout(() => {
      startTour();
    }, 1000);
    return () => clearTimeout(timer);
  }, [user, startTour]);

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar onStartTour={startTour} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onStartTour={startTour} onOpenSearch={() => setSearchOpen(true)} onOpenShortcuts={() => setCheatsheetOpen(true)} />
        <main className="flex-1 overflow-hidden flex flex-col">
          <Suspense fallback={
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          }>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <OnboardingTour
        tourActive={tourActive}
        currentStep={currentStep}
        totalSteps={totalSteps}
        onNext={nextStep}
        onPrev={prevStep}
        onEnd={endTour}
      />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutsCheatsheet open={cheatsheetOpen} onClose={() => setCheatsheetOpen(false)} />
      <SessionTimeoutWarning />
      <OnboardingWizard />
    </div>
  );
};

export default AppLayout;
