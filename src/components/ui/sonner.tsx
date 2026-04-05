import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      closeButton
      duration={4000}
      offset={16}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:dark:bg-zinc-900 group-[.toaster]:text-foreground group-[.toaster]:border group-[.toaster]:border-border/50 group-[.toaster]:shadow-md group-[.toaster]:rounded-lg group-[.toaster]:py-3 group-[.toaster]:px-4 group-[.toaster]:text-sm group-[.toaster]:font-medium",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-xs group-[.toast]:font-normal",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton: "group-[.toast]:!bg-transparent group-[.toast]:!border-0 group-[.toast]:!text-muted-foreground group-[.toast]:hover:!text-foreground group-[.toast]:!shadow-none",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
