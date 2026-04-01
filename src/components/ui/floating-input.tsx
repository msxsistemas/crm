import * as React from "react";
import { cn } from "@/lib/utils";

interface FloatingInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ className, label, value, type, ...props }, ref) => {
    const hasValue = type === "time" || (value !== undefined && value !== "");

    return (
      <div className="relative">
        <input
          type={type}
          ref={ref}
          value={value}
          className={cn(
            "peer flex h-9 w-full rounded-md border border-input bg-background px-3 pt-3 pb-1 text-sm placeholder-transparent focus-visible:outline-none focus-visible:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50",
            type === "time" && "relative pr-10 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-3 [&::-webkit-calendar-picker-indicator]:top-1/2 [&::-webkit-calendar-picker-indicator]:-translate-y-1/2 [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer",
            className
          )}
          placeholder={label}
          {...props}
        />
        <label
          className={cn(
            "absolute left-2.5 px-0.5 bg-background text-muted-foreground transition-all pointer-events-none",
            hasValue
              ? "-top-2 text-[10px] font-medium"
              : "top-1/2 -translate-y-1/2 text-sm",
            "peer-focus:-top-2 peer-focus:text-[10px] peer-focus:font-medium peer-focus:translate-y-0"
          )}
        >
          {label}
        </label>
      </div>
    );
  }
);
FloatingInput.displayName = "FloatingInput";

interface FloatingTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

const FloatingTextarea = React.forwardRef<HTMLTextAreaElement, FloatingTextareaProps>(
  ({ className, label, value, ...props }, ref) => {
    const hasValue = value !== undefined && value !== "";

    return (
      <div className="relative">
        <textarea
          ref={ref}
          value={value}
          className={cn(
            "peer flex w-full rounded-md border border-input bg-background px-3 pt-4 pb-2 text-sm placeholder-transparent focus-visible:outline-none focus-visible:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          placeholder={label}
          {...props}
        />
        <label
          className={cn(
            "absolute left-2.5 px-0.5 bg-background text-muted-foreground transition-all pointer-events-none",
            hasValue
              ? "-top-2 text-[10px] font-medium"
              : "top-3 text-sm",
            "peer-focus:-top-2 peer-focus:text-[10px] peer-focus:font-medium"
          )}
        >
          {label}
        </label>
      </div>
    );
  }
);
FloatingTextarea.displayName = "FloatingTextarea";

interface FloatingSelectWrapperProps {
  label: string;
  hasValue: boolean;
  children: React.ReactNode;
}

const FloatingSelectWrapper = ({ label, hasValue, children }: FloatingSelectWrapperProps) => {
  return (
    <div className="relative">
      {children}
      <label
        className={cn(
          "absolute left-2.5 px-0.5 bg-background text-muted-foreground transition-all pointer-events-none",
          hasValue
            ? "-top-2 text-[10px] font-medium"
            : "top-1/2 -translate-y-1/2 text-sm"
        )}
      >
        {label}
      </label>
    </div>
  );
};

export { FloatingInput, FloatingTextarea, FloatingSelectWrapper };
