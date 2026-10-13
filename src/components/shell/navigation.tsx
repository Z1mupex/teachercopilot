"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  Home,
  MessagesSquare,
  PlusSquare,
  Settings,
  Users,
} from "lucide-react";

import { applicationRoutes } from "@/lib/auth/routes";
import { cn } from "@/lib/utils";

const icons = {
  home: Home,
  clipboard: ClipboardCheck,
  plus: PlusSquare,
  users: Users,
  chart: BarChart3,
  messages: MessagesSquare,
  book: BookOpen,
  settings: Settings,
};

export function Navigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Основная навигация" className="space-y-1.5">
      {applicationRoutes.map(({ href, label, icon }) => {
        const Icon = icons[icon];
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-secondary text-primary"
                : "text-secondary-foreground",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
