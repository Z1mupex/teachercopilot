import Link from "next/link";
import { BookOpen } from "lucide-react";

export function Brand({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg text-base font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-3 sm:text-xl"
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <BookOpen className="size-7" aria-hidden="true" />
      </span>
      <span>Teacher Copilot</span>
    </Link>
  );
}
