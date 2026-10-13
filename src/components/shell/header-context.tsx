"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { applicationRoutes } from "@/lib/auth/routes";

const gradingPages: Record<string, string> = {
  new: "Новая проверка",
  "design-preview": "Примерка дизайна",
  scan: "Сканирование",
  answers: "Ответы и критерии",
  process: "Проверка",
  review: "Решения учителя",
  results: "Результаты",
};

export function HeaderContext() {
  const pathname = usePathname();
  const route = applicationRoutes.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );
  const label =
    route?.label ??
    (pathname.startsWith("/worksheets")
      ? "Рабочие листы"
      : "Рабочее пространство");
  const lastSegment = pathname.split("/").at(-1) ?? "";
  const detail = pathname.startsWith("/grading/")
    ? (gradingPages[lastSegment] ?? "Работа")
    : pathname.startsWith("/classes/")
      ? lastSegment === "new"
        ? "Новый класс"
        : "Класс"
      : undefined;

  return (
    <nav
      aria-label="Путь страницы"
      className="hidden min-w-0 items-center gap-3 text-[13px] lg:flex"
    >
      <span aria-hidden="true" className="h-4 w-px bg-border" />
      {detail && route ? (
        <>
          <Link
            href={route.href}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label}
          </Link>
          <ChevronRight
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <span aria-current="page" className="truncate font-medium">
            {detail}
          </span>
        </>
      ) : (
        <span aria-current="page" className="truncate font-medium">
          {label}
        </span>
      )}
    </nav>
  );
}
