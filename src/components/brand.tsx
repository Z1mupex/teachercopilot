import Link from "next/link";
import { BookOpen } from "lucide-react";

export function Brand({
  href = "/dashboard",
  compact = false,
}: {
  href?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label="Teacher Copilot — панель"
      className="inline-flex items-center gap-3 rounded-md text-sm font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-base"
    >
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <BookOpen className="size-5" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <span className={compact ? "hidden min-[480px]:inline" : undefined}>
        Teacher Copilot
      </span>
    </Link>
  );
}
