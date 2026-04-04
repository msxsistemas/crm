import React from "react";
import { cn } from "@/lib/utils";

export interface AgentStatusProps {
  status: "online" | "away" | "offline";
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

const sizeMap = {
  sm: "h-2 w-2",
  md: "h-3 w-3",
  lg: "h-4 w-4",
};

const colorMap = {
  online: "bg-green-500",
  away: "bg-yellow-400",
  offline: "bg-gray-400",
};

const labelMap = {
  online: "Online",
  away: "Ausente",
  offline: "Offline",
};

const AgentStatus: React.FC<AgentStatusProps> = ({
  status,
  size = "sm",
  showLabel = false,
  className,
}) => {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "rounded-full shrink-0",
          sizeMap[size],
          colorMap[status]
        )}
      />
      {showLabel && (
        <span className="text-xs text-muted-foreground">{labelMap[status]}</span>
      )}
    </span>
  );
};

export default AgentStatus;
