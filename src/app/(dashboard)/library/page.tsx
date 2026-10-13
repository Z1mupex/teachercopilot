import type { Metadata } from "next";

import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { throwDatabaseError } from "@/lib/database/errors";
import { questionInputSchema } from "@/lib/validation/worksheets";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Библиотека — Teacher Copilot" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/library");
  const parsed = z
    .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
    .safeParse(await searchParams);
  if (!parsed.success) notFound();
  const page = parsed.data.page;
  const client = await createClient();
  const { data, error, count } = await client
    .from("teacher_library_entries")
    .select("id,worksheet_id,kind,title,folder,tags,content", {
      count: "exact",
    })
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * 20, page * 20 - 1);
  if (error || count === null)
    throwDatabaseError("library-list", error ?? { code: "MissingCount" });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="studio-title">Библиотека</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Рабочие листы и принятые задания для следующих уроков.
        </p>
      </div>
      <Link
        href="/settings"
        className="inline-block text-sm text-primary underline underline-offset-4"
      >
        Настроить сохранение, папку и теги
      </Link>
      {data!.length === 0 ? (
        <div className="rounded-lg border bg-card p-7">
          <h2 className="font-semibold">Пока нет материалов</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Включите сохранение в настройках библиотеки. Новые материалы
            добавятся после явного сохранения worksheet.
          </p>
          <Link
            href="/worksheets/new"
            className="mt-5 inline-block text-sm text-primary underline"
          >
            Создать работу
          </Link>
        </div>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {data!.map((entry) => {
            const question =
              entry.kind === "question"
                ? questionInputSchema.safeParse(entry.content)
                : null;
            return (
              <li
                key={entry.id}
                className="min-w-0 space-y-3 rounded-lg border bg-card p-5"
              >
                <p className="text-xs text-muted-foreground">
                  {entry.folder} ·{" "}
                  {entry.kind === "worksheet" ? "Worksheet" : "Задание ИИ"}
                </p>
                <h2 className="break-words text-base font-semibold">
                  {entry.title}
                </h2>
                {entry.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md bg-secondary px-2 py-1 text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {question?.success && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-primary">
                      Посмотреть задание
                    </summary>
                    <p className="mt-3 whitespace-pre-wrap break-words">
                      {question.data.prompt}
                    </p>
                  </details>
                )}
                <Link
                  href={`/worksheets/${entry.worksheet_id}`}
                  className="inline-block text-sm text-primary underline underline-offset-4"
                >
                  Открыть рабочий лист
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          Материалов: {count}. Страница {page}.
        </p>
        <div className="flex gap-4">
          {page > 1 && (
            <Link href={`/library?page=${page - 1}`} className="text-primary">
              Назад
            </Link>
          )}
          {page * 20 < count && (
            <Link href={`/library?page=${page + 1}`} className="text-primary">
              Далее
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
