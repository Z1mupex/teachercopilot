import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-xl border bg-card px-4 text-sm outline-none transition placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 aria-invalid:border-destructive disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
