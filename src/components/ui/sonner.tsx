import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group [&_.sonner-toast]:flex-row-reverse [&_.sonner-close-button]:!left-auto [&_.sonner-close-button]:!right-0"
      position="top-right"
      closeButton
      duration={3000}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-border/50 group-[.toaster]:shadow-lg group-[.toaster]:shadow-black/10 group-[.toaster]:rounded-xl group-[.toaster]:backdrop-blur-sm",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: "group-[.toast]:!bg-muted group-[.toast]:!text-foreground group-[.toast]:!border-border/50",
          success: "group-[.toaster]:!bg-card group-[.toaster]:!text-success group-[.toaster]:border-success/20",
          error: "group-[.toaster]:!bg-card group-[.toaster]:!text-destructive group-[.toaster]:border-destructive/20",
          info: "group-[.toaster]:!bg-card group-[.toaster]:!text-primary group-[.toaster]:border-primary/20",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
