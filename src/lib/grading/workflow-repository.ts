import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { throwDatabaseError } from "@/lib/database/errors";
import { GradingError } from "@/lib/grading/repository";
import { getAnswerKey } from "@/lib/grading/answer-key-repository";
import { cropSchema } from "@/lib/grading/grading-validation";
import type { GradingProgress, ReviewSlice } from "@/types/grading-workflow";

export const REVIEW_PAGE_SIZE = 40;
export function workflowError(error: { code?: string }) {
  const messages: Record<string, string> = {
    PT404: "Работа недоступна.",
    PT409:
      "Состояние проверки изменилось. Обновите страницу. Завершение доступно после обработки работ и проверки всех сомнительных ответов.",
    PT412: "Ответ уже изменён в другой вкладке. Обновите очередь.",
    PT422: "Проверьте вариант, ответы и допустимые баллы.",
    PT429: "Уже обрабатываются две работы. Дождитесь результата.",
  };
  if (error.code && messages[error.code])
    throw new GradingError(messages[error.code], Number(error.code.slice(2)));
  throwDatabaseError("grading-workflow", error);
}

export async function getGradingProgress(
  teacherId: string,
  batchId: string,
): Promise<GradingProgress | null> {
  const client = await createClient();
  const { data: b, error } = await client
    .from("grading_batches")
    .select(
      "id,title,status,answer_key_confirmed_at,processed_submissions,submissions(id,status,student_name,variant_id,grading_lease_until,grading_error,proposed_score,final_score,max_score,upload_index,created_at,submission_pages(id))",
    )
    .eq("id", batchId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (error) throwDatabaseError("grading-progress", error);
  if (!b) return null;
  const countAnswers = (statuses?: string[]) => {
    let query = client
      .from("submission_answers")
      .select("id,submissions!inner(batch_id)", { head: true, count: "exact" })
      .eq("submissions.batch_id", batchId);
    if (statuses) query = query.in("review_status", statuses);
    return query;
  };
  const counts = await Promise.all([
    countAnswers(),
    countAnswers(["needs_review"]),
    countAnswers(["teacher_confirmed", "teacher_changed"]),
  ]);
  for (const c of counts)
    if (c.error || c.count === null)
      throwDatabaseError("grading-count", c.error ?? { code: "MissingCount" });
  return {
    observedAt: new Date().toISOString(),
    id: b.id,
    title: b.title,
    status: b.status,
    confirmed: Boolean(b.answer_key_confirmed_at),
    processed: b.processed_submissions,
    answers: counts[0].count!,
    needsReview: counts[1].count!,
    teacherReviewed: counts[2].count!,
    submissions: b.submissions
      .sort(
        (a, b) =>
          (a.upload_index ?? Number.MAX_SAFE_INTEGER) -
            (b.upload_index ?? Number.MAX_SAFE_INTEGER) ||
          a.created_at.localeCompare(b.created_at),
      )
      .map((s, index) => ({
        id: s.id,
        number: index + 1,
        studentName: s.student_name,
        status: s.status,
        variantId: s.variant_id,
        leaseUntil: s.grading_lease_until,
        error: s.grading_error,
        proposedScore: s.proposed_score,
        finalScore: s.final_score,
        maxScore: s.max_score,
        pageId: s.submission_pages[0]?.id ?? null,
      })),
  };
}

const storedAnswerSchema = z.object({
  text: z.string().nullable().default(null),
  choice_ids: z.array(z.string()).default([]),
  flags: z.array(z.string()).default([]),
  crop: cropSchema.nullable().default(null),
  teacher_unreadable: z.boolean().default(false),
});
export async function getReviewSlice(
  teacherId: string,
  batchId: string,
  all: boolean,
  page: number,
): Promise<ReviewSlice | null> {
  const [progress, key] = await Promise.all([
    getGradingProgress(teacherId, batchId),
    getAnswerKey(teacherId, batchId),
  ]);
  if (!progress || !key) return null;
  const client = await createClient();
  let query = client
    .from("submission_answers")
    .select("*,submissions!inner(id,batch_id)", { count: "exact" })
    .eq("submissions.batch_id", batchId)
    .order("created_at")
    .order("id");
  if (!all) query = query.eq("review_status", "needs_review");
  const { data, error, count } = await query.range(
    page * REVIEW_PAGE_SIZE,
    (page + 1) * REVIEW_PAGE_SIZE - 1,
  );
  if (error || count === null)
    throwDatabaseError("grading-review", error ?? { code: "MissingCount" });
  const questions = new Map(
    [
      key.document.questions,
      ...(key.document.variants ?? []).map((v) => v.questions),
    ].flatMap((group) =>
      group.map((q, i) => [q.id, { question: q, number: i + 1 }] as const),
    ),
  );
  const submissions = new Map(progress.submissions.map((s) => [s.id, s]));
  return {
    progress,
    page,
    count,
    answers: data.map((a) => {
      const q = questions.get(a.question_id),
        s = submissions.get(a.submission_id);
      if (!q || !s?.pageId)
        throw new GradingError(
          "Не удалось сопоставить результат с оригиналом.",
          503,
        );
      const recognized = storedAnswerSchema.parse(a.recognized_answer);
      return {
        id: a.id,
        revision: a.updated_at,
        submissionId: s.id,
        submissionNumber: s.number,
        studentName: s.studentName,
        pageId: s.pageId,
        questionNumber: q.number,
        question: q.question,
        text: recognized.text,
        choiceIds: recognized.choice_ids,
        flags: recognized.flags,
        crop: recognized.crop,
        teacherUnreadable: recognized.teacher_unreadable,
        proposedScore: a.proposed_score ?? 0,
        finalScore: a.final_score,
        confidence: a.confidence ?? 0,
        explanation: a.reasoning_summary ?? "",
        status: a.review_status,
      };
    }),
  };
}
