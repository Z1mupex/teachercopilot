import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  analyticsSearchSchema,
  listCompletedBatches,
} from "@/lib/grading/analytics-repository";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Аналитика — Teacher Copilot" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/analytics");
  const search = analyticsSearchSchema.safeParse(await searchParams);
  if (!search.success) notFound();
  const { batches, count } = await listCompletedBatches(
    user.id,
    search.data.page,
  );
  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Аналитика</h1>
        <p className="mt-3 text-muted-foreground">
          Завершённые проверки: результаты по заданиям, карта ошибок и темы для
          повторения.
        </p>
      </div>
      {!count ? (
        <div className="rounded-2xl border bg-card p-6">
          <h2 className="text-lg font-semibold">
            Пока нет завершённых проверок
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Загрузите работы, подтвердите ответы и завершите проверку учителем.
            После этого здесь появится аналитика.
          </p>
          <Link
            href="/grading"
            className="mt-4 inline-flex min-h-11 items-center text-primary underline"
          >
            Перейти к проверкам
          </Link>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {batches.map((batch) => (
              <Link
                key={batch.id}
                href={`/grading/${batch.id}/results`}
                className="rounded-2xl border bg-card p-6 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <h2 className="break-words text-lg font-semibold">
                  {batch.title}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {batch.classes?.name ?? "Без класса"} ·{" "}
                  {batch.total_submissions} работ
                </p>
                <p className="mt-4 text-sm font-medium text-primary">
                  Посмотреть результаты и ошибки →
                </p>
              </Link>
            ))}
          </div>
          <nav
            aria-label="Страницы аналитики"
            className="flex flex-wrap items-center gap-4 text-sm"
          >
            <span>
              Страница {search.data.page} · {count} проверок
            </span>
            {search.data.page > 1 && (
              <Link
                href={`/analytics?page=${search.data.page - 1}`}
                className="inline-flex min-h-11 items-center rounded-xl border px-4"
              >
                Предыдущая
              </Link>
            )}
            {search.data.page * 20 < count && (
              <Link
                href={`/analytics?page=${search.data.page + 1}`}
                className="inline-flex min-h-11 items-center rounded-xl border px-4"
              >
                Следующая
              </Link>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
