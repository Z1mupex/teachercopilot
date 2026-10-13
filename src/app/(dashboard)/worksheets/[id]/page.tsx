import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FilePenLine } from "lucide-react";
import { z } from "zod";
import { DeleteWorksheetDialog } from "@/components/worksheets/delete-worksheet-dialog";
import { QuestionPreview } from "@/components/worksheets/question-preview";
import { DownloadWorksheetPdf } from "@/components/worksheets/download-worksheet-pdf";
import { worksheetVariants } from "@/lib/worksheets/variants";
import { requireUser } from "@/lib/auth/session";
import { getWorksheet } from "@/lib/worksheets/repository";

export const metadata: Metadata = { title: "Рабочий лист — Teacher Copilot" };
const statusLabels = {
  draft: "Черновик",
  ready: "Готово",
  archived: "В архиве",
};

export default async function WorksheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser("/worksheets");
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const worksheet = await getWorksheet(user.id, parsed.data);
  if (!worksheet) notFound();
  const variants = worksheetVariants(worksheet);
  return (
    <div className="max-w-5xl space-y-6">
      <Link
        href="/worksheets"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Мои рабочие листы
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <p className="mb-2 text-sm font-medium text-primary">
            {statusLabels[worksheet.status]}
          </p>
          <h1 className="break-words text-3xl font-bold tracking-tight">
            {worksheet.title}
          </h1>
          <p className="mt-3 break-words text-sm text-muted-foreground">
            {[
              worksheet.subject,
              worksheet.grade === null ? null : `${worksheet.grade} класс`,
            ]
              .filter(Boolean)
              .join(" · ") || "Предмет и параллель не указаны"}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <DownloadWorksheetPdf id={worksheet.id} title={worksheet.title} />
          {worksheet.editable && (
            <>
              <Link
                href={`/worksheets/${worksheet.id}/edit`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FilePenLine className="size-4" aria-hidden="true" />
                Редактировать
              </Link>
              <DeleteWorksheetDialog
                id={worksheet.id}
                title={worksheet.title}
              />
            </>
          )}
        </div>
      </div>
      {!worksheet.editable && (
        <p className="rounded-xl border bg-secondary p-4 text-sm leading-6 text-muted-foreground">
          Рабочий лист используется в проверках. Его задания и ответы сохранены
          для целостности истории и доступны только для просмотра.
        </p>
      )}
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="rounded-xl border bg-card px-4 py-3">
          Вариантов: <strong>{variants.length}</strong>
        </span>
        <span className="rounded-xl border bg-card px-4 py-3">
          Заданий во всех вариантах:{" "}
          <strong>
            {variants.reduce(
              (sum, variant) => sum + variant.questions.length,
              0,
            )}
          </strong>
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        Предпросмотр для учителя, включая правильные ответы и критерии.
      </p>
      {variants.map((variant) => (
        <section key={variant.id ?? "base"} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="break-words text-xl font-semibold">
              {variant.label}
            </h2>
            <p className="text-sm text-muted-foreground">
              Всего баллов:{" "}
              {variant.questions.reduce(
                (sum, question) => sum + question.max_score,
                0,
              )}
            </p>
          </div>
          {variant.questions.length === 0 ? (
            <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
              В этом черновике пока нет заданий.
            </p>
          ) : (
            <div className="space-y-4">
              {variant.questions.map((question, index) => (
                <QuestionPreview
                  key={question.id}
                  question={question}
                  index={index}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
