import type { Metadata } from "next";

import Link from "next/link";
import { ArrowRight, GraduationCap, Plus, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { listClasses } from "@/lib/classes/repository";

export const metadata: Metadata = { title: "Классы — Teacher Copilot" };

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const user = await requireUser("/classes");
  const [classes, query] = await Promise.all([
    listClasses(user.id),
    searchParams,
  ]);
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">
            Учебные группы
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Мои классы
          </h1>
          <p className="mt-3 text-muted-foreground">
            Организуйте классы и храните информацию о них под рукой.
          </p>
        </div>
        <Link
          href="/classes/new"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-4" aria-hidden="true" />
          Добавить класс
        </Link>
      </div>
      {query.deleted === "1" && (
        <p
          role="status"
          className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
        >
          Класс удалён.
        </p>
      )}
      {classes.length === 0 ? (
        <Card className="shadow-none">
          <CardContent className="flex min-h-72 flex-col items-center justify-center gap-4 text-center">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-secondary text-primary">
              <Users className="size-8" aria-hidden="true" />
            </span>
            <h2 className="text-xl font-semibold">Добавьте первый класс</h2>
            <p className="max-w-md text-sm leading-6 text-muted-foreground">
              Достаточно указать название. Параллель, предмет и количество
              учеников можно добавить позже.
            </p>
            <Link
              href="/classes/new"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Создать класс
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classes.map((item) => (
            <Link
              key={item.id}
              href={`/classes/${item.id}`}
              className="group rounded-2xl border bg-card p-6 transition hover:border-primary/35 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex items-center justify-between gap-4">
                <span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-primary">
                  <GraduationCap className="size-6" aria-hidden="true" />
                </span>
                <ArrowRight
                  className="size-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary"
                  aria-hidden="true"
                />
              </div>
              <h2 className="mt-5 break-words text-xl font-semibold">
                {item.name}
              </h2>
              <p className="mt-2 break-words text-sm text-muted-foreground">
                {item.subject ?? "Предмет не указан"}
              </p>
              <div className="mt-5 flex flex-wrap gap-3 border-t pt-4 text-xs text-muted-foreground">
                <span>
                  {item.grade === null
                    ? "Параллель не указана"
                    : `${item.grade} класс`}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5" aria-hidden="true" />
                  {item.student_count === null
                    ? "Число учеников не указано"
                    : `Учеников: ${item.student_count}`}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
