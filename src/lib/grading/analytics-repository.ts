import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { throwDatabaseError } from "@/lib/database/errors";
import { GradingError } from "@/lib/grading/repository";
import { getAnswerKey } from "@/lib/grading/answer-key-repository";
import {
  analyticsQuestions,
  calculateAnalytics,
  type AnalyticsAnswer,
  type AnalyticsSubmission,
} from "@/lib/grading/analytics";

export const analyticsSearchSchema = z.object({
  page: z
    .string()
    .regex(/^\d{1,4}$/)
    .transform(Number)
    .pipe(z.number().int().min(1).max(1000))
    .optional()
    .default(1),
  variant: z.union([z.literal("base"), z.uuid()]).optional(),
});

export async function getBatchAnalytics(teacherId: string, batchId: string) {
  const client = await createClient();
  const { data: batch, error } = await client
    .from("grading_batches")
    .select("id,title,status,classes(name)")
    .eq("id", batchId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (error) throwDatabaseError("analytics-owner", error);
  if (!batch) return null;
  if (batch.status !== "completed")
    return { batch, analytics: null, document: null };
  const key = await getAnswerKey(teacherId, batchId);
  if (!key) throw new GradingError("Ключ проверки недоступен.", 503);
  const submissions: AnalyticsSubmission[] = [];
  for (let offset = 0; ;) {
    const { data, error, count } = await client
      .from("submissions")
      .select(
        "id,student_name,variant_id,final_score,max_score,upload_index,created_at",
        { count: "exact" },
      )
      .eq("batch_id", batchId)
      .order("upload_index", { nullsFirst: false })
      .order("created_at")
      .order("id")
      .range(offset, offset + 499);
    if (error || count === null)
      throwDatabaseError(
        "analytics-submissions",
        error ?? { code: "MissingCount" },
      );
    if (count > 1000)
      throw new GradingError(
        "Проверка превышает поддерживаемый размер аналитики (1000 работ).",
        422,
      );
    submissions.push(
      ...data.map((s, i) => ({
        id: s.id,
        number: offset + i + 1,
        studentName: s.student_name,
        variantId: s.variant_id,
        finalScore: s.final_score,
        maxScore: s.max_score,
      })),
    );
    if (submissions.length >= count) break;
    if (!data.length)
      throw new GradingError("Не удалось прочитать все работы.", 503);
    offset += data.length;
  }
  const answers: AnalyticsAnswer[] = [];
  for (let offset = 0; ;) {
    const { data, error, count } = await client
      .from("submission_answers")
      .select(
        "id,submission_id,question_id,final_score,review_status,submissions!inner(batch_id)",
        { count: "exact" },
      )
      .eq("submissions.batch_id", batchId)
      .order("id")
      .range(offset, offset + 499);
    if (error || count === null)
      throwDatabaseError(
        "analytics-answers",
        error ?? { code: "MissingCount" },
      );
    if (count > 100000)
      throw new GradingError("Слишком много ответов для аналитики.", 422);
    answers.push(
      ...data.map((a) => ({
        submissionId: a.submission_id,
        questionId: a.question_id,
        finalScore: a.final_score,
        reviewStatus: a.review_status,
      })),
    );
    if (answers.length >= count) break;
    if (!data.length)
      throw new GradingError("Не удалось прочитать все результаты.", 503);
    offset += data.length;
  }
  return {
    batch,
    document: key.document,
    analytics: calculateAnalytics(
      analyticsQuestions(key.document),
      submissions,
      answers,
    ),
  };
}

export async function listCompletedBatches(teacherId: string, page: number) {
  const client = await createClient();
  const { data, error, count } = await client
    .from("grading_batches")
    .select("id,title,total_submissions,updated_at,classes(name)", {
      count: "exact",
    })
    .eq("teacher_id", teacherId)
    .eq("status", "completed")
    .order("updated_at", { ascending: false })
    .order("id")
    .range((page - 1) * 20, page * 20 - 1);
  if (error || count === null)
    throwDatabaseError("analytics-list", error ?? { code: "MissingCount" });
  return { batches: data, count };
}
