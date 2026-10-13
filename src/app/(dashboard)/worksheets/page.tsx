import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FileText, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { listWorksheets } from "@/lib/worksheets/repository";

export const metadata: Metadata = {
  title: "Мои рабочие листы — Teacher Copilot",
};
const statusLabels: Record<string, string> = {
  draft: "Черновик",
  ready: "Готово",
  archived: "В архиве",
};
const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export default async function WorksheetsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/worksheets");
  const [worksheets, search] = await Promise.all([
    listWorksheets(user.id),
    searchParams,
  ]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="mb-2 text-sm font-medium text-primary">
            Материалы для ваших уроков
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Мои рабочие листы
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Создавайте, редактируйте и сохраняйте задания с ключами ответов.
          </p>
        </div>
        <Link
          href="/worksheets/new"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Plus className="size-4" aria-hidden="true" />
          Создать рабочий лист
        </Link>
      </div>
      {search.deleted === "1" && (
        <p
          role="status"
          className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300"
        >
          Рабочий лист удалён.
        </p>
      )}
      {worksheets.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-5 py-14 text-center">
          <span className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-secondary text-primary">
            <FileText className="size-8" aria-hidden="true" />
          </span>
          <h2 className="text-xl font-semibold">
            Здесь будут ваши рабочие листы
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            Начните с первого задания или предложите AI тему урока. Материал
            появится здесь после сохранения.
          </p>
          <Link
            href="/worksheets/new"
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl border px-5 py-3 text-sm font-medium text-primary hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Создать первый рабочий лист
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {worksheets.map((worksheet) => (
            <li key={worksheet.id} className="min-w-0">
              <Link
                href={`/worksheets/${worksheet.id}`}
                className="flex h-full flex-col rounded-2xl border bg-card p-5 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <FileText
                    className="size-6 text-primary"
                    aria-hidden="true"
                  />
                  <span
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium ${worksheet.status === "ready" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-secondary text-muted-foreground"}`}
                  >
                    {statusLabels[worksheet.status]}
                  </span>
                </div>
                <h2 className="break-words text-lg font-semibold">
                  {worksheet.title}
                </h2>
                <p className="mt-2 break-words text-sm text-muted-foreground">
                  {[
                    worksheet.subject,
                    worksheet.grade === null
                      ? null
                      : `${worksheet.grade} класс`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Предмет и параллель не указаны"}
                </p>
                <div className="mt-auto flex items-center justify-between gap-3 pt-5 text-xs text-muted-foreground">
                  <span>
                    Обновлён{" "}
                    {dateFormatter.format(new Date(worksheet.updated_at))}
                  </span>
                  <ArrowRight
                    className="size-4 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
