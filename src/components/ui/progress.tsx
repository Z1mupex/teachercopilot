import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Progress({ className, ...props }: ComponentProps<"progress">) {
  return (
    <progress
      {...props}
      className={cn(
        "h-2 w-full appearance-none overflow-hidden rounded-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-secondary [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary",
        className,
      )}
    />
  );
}
