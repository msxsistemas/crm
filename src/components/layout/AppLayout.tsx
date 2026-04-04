import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import AppSidebar from "./AppSidebar";
import TopBar from "./TopBar";
import { useAuth } from "@/hooks/useAuth";
import { usePresence } from "@/hooks/usePresence";
import { useOnboardingTour } from "@/hooks/useOnboardingTour";
import OnboardingTour from "@/components/onboarding/OnboardingTour";

const AppLayout = () => {
  const { user } = useAuth();
  const userName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuário";
  const { updateStatus } = usePresence(user?.id, userName);
  const { tourActive, currentStep, totalSteps, startTour, endTour, nextStep, prevStep } =
    useOnboardingTour();

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
        <TopBar onStartTour={startTour} />
        <main className="flex-1 overflow-hidden flex flex-col">
          <Outlet />
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
    </div>
  );
};

export default AppLayout;
