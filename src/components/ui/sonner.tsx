import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      closeButton
      duration={4000}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border/60 group-[.toaster]:shadow-xl group-[.toaster]:shadow-black/15 group-[.toaster]:rounded-xl",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-sm",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: "group-[.toast]:!bg-card group-[.toast]:!text-muted-foreground group-[.toast]:!border-border/50 group-[.toast]:hover:!bg-muted",
          success: "group-[.toaster]:!border-l-4 group-[.toaster]:!border-l-green-500",
          error: "group-[.toaster]:!border-l-4 group-[.toaster]:!border-l-red-500",
          warning: "group-[.toaster]:!border-l-4 group-[.toaster]:!border-l-amber-500",
          info: "group-[.toaster]:!border-l-4 group-[.toaster]:!border-l-blue-500",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
