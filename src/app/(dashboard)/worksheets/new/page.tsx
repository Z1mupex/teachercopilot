import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewWorksheet } from "@/components/worksheets/new-worksheet";
import { requireUser } from "@/lib/auth/session";
import { isAiConfigured } from "@/lib/env";
import { idSchema } from "@/lib/grading/validation";
import { getBatchAnalytics } from "@/lib/grading/analytics-repository";
import { followUpPrefill } from "@/lib/grading/analytics";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "Создать работу — Teacher Copilot" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/worksheets/new");
  const { fromBatch } = await searchParams;
  let prefill;
  if (fromBatch !== undefined) {
    if (!idSchema.safeParse(fromBatch).success || typeof fromBatch !== "string")
      notFound();
    const detail = await getBatchAnalytics(user.id, fromBatch);
    if (!detail?.analytics || !detail.document) notFound();
    prefill =
      followUpPrefill(
        detail.analytics,
        detail.document.subject,
        detail.document.grade,
      ) ?? undefined;
  }
  return (
    <div className="max-w-6xl space-y-6">
      <Link
        href="/worksheets"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Мои рабочие листы
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Создать рабочий лист
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
          Подготовьте задания для урока вручную или с помощью AI.
        </p>
      </div>
      {prefill && (
        <p className="rounded-xl border bg-secondary p-4 text-sm">
          Параметры заполнены по заданиям с низким результатом. Проверьте
          предмет, параллель и тему. Генерация и сохранение выполняются только
          по вашей команде.
        </p>
      )}
      <NewWorksheet
        key={typeof fromBatch === "string" ? fromBatch : "new"}
        aiAvailable={isAiConfigured()}
        prefill={prefill}
      />
    </div>
  );
}
