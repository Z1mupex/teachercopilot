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
    <nav
      aria-label="Основная навигация"
      className="studio-navigation space-y-1"
    >
      <p className="px-3 pb-3 text-xs font-medium text-muted-foreground">
        Рабочее пространство
      </p>
      {applicationRoutes.map(({ href, label, icon }, index) => {
        const Icon = icons[icon];
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <div key={href}>
            {index === 5 && (
              <p className="px-3 pt-7 pb-3 text-xs font-medium text-muted-foreground">
                Инструменты
              </p>
            )}
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 py-2.5 text-[15px] font-medium leading-5 tracking-[-0.01em] transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-secondary font-semibold text-primary"
                  : "text-foreground/75",
              )}
            >
              <Icon
                className="size-[18px] shrink-0"
                strokeWidth={1.7}
                aria-hidden="true"
              />
              {label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
