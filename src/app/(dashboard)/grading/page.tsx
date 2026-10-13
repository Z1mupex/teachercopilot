import type { Metadata } from "next";

import Link from "next/link";
import { ArrowRight, Files, Plus } from "lucide-react";
import { BATCH_LIST_SIZE, listBatches } from "@/lib/grading/repository";
import { z } from "zod";
import { batchLabels } from "@/components/grading/labels";
import { requireUser } from "@/lib/auth/session";
import { formatWorkCount } from "@/lib/grading/format";

export const metadata: Metadata = { title: "Проверка работ — Teacher Copilot" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await requireUser("/grading");
  const input = z.coerce
    .number()
    .int()
    .min(1)
    .max(100000)
    .safeParse((await searchParams).page ?? 1);
  const page = input.success ? input.data : 1;
  const { batches, count } = await listBatches(user.id, page);
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Проверка работ
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Загружайте готовые работы учеников. Подойдут фото, сканы и PDF.
          </p>
        </div>
        <Link
          href="/grading/new"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus className="size-4" />
          Новая проверка
        </Link>
      </div>
      {count === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center">
          <Files className="mx-auto mb-4 size-12 text-primary" />
          <h2 className="text-xl font-semibold">Начните с загрузки работ</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Можно проверить внешние материалы без рабочего листа из Teacher
            Copilot.
          </p>
          <Link
            href="/grading/new"
            className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary"
          >
            Загрузить первую работу
            <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {batches.map((batch) => (
            <Link
              key={batch.id}
              href={`/grading/${batch.id}${batch.status === "completed" ? "/results" : batch.status === "review" ? "/review" : batch.status === "processing" ? "/process" : ""}`}
              className="min-w-0 rounded-2xl border bg-card p-5 transition hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="min-w-0 [overflow-wrap:anywhere] text-lg font-semibold">
                  {batch.title}
                </h2>
                <ArrowRight className="size-5 shrink-0 text-primary" />
              </div>
              <p className="mt-3 [overflow-wrap:anywhere] text-sm text-muted-foreground">
                {batch.classes?.name ?? "Без класса"} ·{" "}
                {formatWorkCount(batch.total_submissions)}
              </p>
              <p className="mt-4 inline-flex rounded-lg bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
                {batchLabels[batch.status] ?? batch.status}
              </p>
            </Link>
          ))}
        </div>
      )}
      {count > 0 && (
        <nav
          aria-label="Страницы проверок"
          className="flex flex-wrap items-center justify-between gap-4 text-sm"
        >
          <span className="text-muted-foreground">
            Страница {page} · проверок: {count}
          </span>
          <div className="flex gap-5">
            {page > 1 && (
              <Link
                className="text-primary underline-offset-4 hover:underline"
                href={`/grading?page=${page - 1}`}
              >
                Назад
              </Link>
            )}
            {page * BATCH_LIST_SIZE < count && (
              <Link
                className="text-primary underline-offset-4 hover:underline"
                href={`/grading?page=${page + 1}`}
              >
                Далее
              </Link>
            )}
            {batches.length === 0 && (
              <Link className="text-primary" href="/grading">
                К первой странице
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
