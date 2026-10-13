import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { WorksheetEditor } from "@/components/worksheets/worksheet-editor";
import { requireUser } from "@/lib/auth/session";
import { isAiConfigured } from "@/lib/env";
import { getWorksheet } from "@/lib/worksheets/repository";

export const metadata: Metadata = {
  title: "Редактировать рабочий лист — Teacher Copilot",
};

export default async function EditWorksheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser("/worksheets");
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const worksheet = await getWorksheet(user.id, parsed.data);
  if (!worksheet) notFound();
  return (
    <div className="max-w-6xl space-y-6">
      <Link
        href={`/worksheets/${worksheet.id}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />К рабочему листу
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Редактировать рабочий лист
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Измените задания и ключи, затем сохраните материал.
        </p>
      </div>
      {worksheet.editable ? (
        <WorksheetEditor
          initial={{
            title: worksheet.title,
            subject: worksheet.subject,
            grade: worksheet.grade,
            status: worksheet.status === "ready" ? "ready" : "draft",
            questions: worksheet.questions,
            variants: worksheet.variants,
          }}
          worksheetId={worksheet.id}
          updatedAt={worksheet.updated_at}
          aiAvailable={isAiConfigured()}
        />
      ) : (
        <p className="rounded-xl border bg-secondary p-5 text-sm leading-6 text-muted-foreground">
          Рабочий лист используется в проверках и доступен только для просмотра.
          Редактирование заданий изменило бы историю результатов.
        </p>
      )}
    </div>
  );
}
