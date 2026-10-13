import "server-only";

import { createClient } from "@/lib/supabase/server";
import { throwDatabaseError } from "@/lib/database/errors";
import {
  printableWorksheetSchema,
  studentQuestion,
  WorksheetPrintError,
} from "@/lib/pdf/student-worksheet";

export async function getPrintableWorksheet(teacherId: string, id: string) {
  const supabase = await createClient();
  // One database statement gives a consistent snapshot. Answer keys are not
  // selected at all, and metadata is reduced to option text before rendering.
  const { data, error } = await supabase
    .from("worksheets")
    .select(
      "id,title,subject,grade,worksheet_variants(id,label,variant_index),questions(id,variant_id,order_index,type,prompt,max_score,metadata)",
    )
    .eq("id", id)
    .eq("teacher_id", teacherId)
    .eq("source", "generated")
    .in("status", ["draft", "ready"])
    .maybeSingle();
  if (error) throwDatabaseError("worksheet-print-read", error);
  if (!data) return null;
  const groups = [
    { id: null, label: "Вариант 1" },
    ...data.worksheet_variants.sort(
      (a, b) => a.variant_index - b.variant_index,
    ),
  ];
  const knownIds = new Set(groups.map((group) => group.id));
  if (data.questions.some((question) => !knownIds.has(question.variant_id)))
    throw new WorksheetPrintError(
      "Варианты работы недоступны. Обновите страницу.",
    );
  const parsed = printableWorksheetSchema.safeParse({
    id: data.id,
    title: data.title,
    subject: data.subject,
    grade: data.grade,
    variants: groups.map((group) => ({
      id: group.id,
      label: group.label,
      questions: data.questions
        .filter((question) => question.variant_id === group.id)
        .sort(
          (a, b) => a.order_index - b.order_index || a.id.localeCompare(b.id),
        )
        .map(studentQuestion),
    })),
  });
  if (!parsed.success)
    throw new WorksheetPrintError(
      "Добавьте задания во все варианты перед скачиванием PDF.",
    );
  return parsed.data;
}
