import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { throwDatabaseError } from "@/lib/database/errors";
import { GradingError } from "@/lib/grading/repository";
import { getAnswerKey } from "@/lib/grading/answer-key-repository";
import { cropSchema } from "@/lib/grading/grading-validation";
import type { GradingProgress, ReviewSlice } from "@/types/grading-workflow";
import type { WorkReview, ReviewAnswer } from "@/types/grading-workflow";
import { readAllRows } from "@/lib/database/read-all-rows";
import { parseStoredAutonomy, legacyAutonomy } from "@/lib/grading/autonomy";
import { calibrationProfileSchema } from "@/lib/grading/calibration-schema";

export const REVIEW_PAGE_SIZE = 40;
export function workflowError(error: { code?: string }) {
  const messages: Record<string, string> = {
    PT404: "Работа недоступна.",
    PT409:
      "Состояние проверки изменилось. Обновите страницу. Завершение доступно после обработки работ и проверки всех сомнительных ответов.",
    PT412: "Ответ уже изменён в другой вкладке. Обновите работу.",
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
      "id,title,status,answer_key_confirmed_at,processed_submissions,grading_started_at,grading_preferences,autonomy_config,updated_at,calibration_enabled,calibration_samples,calibration_profile",
    )
    .eq("id", batchId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (error) throwDatabaseError("grading-progress", error);
  if (!b) return null;
  const submissions = await readAllRows("grading-submissions", (from, to) =>
    client
      .from("submissions")
      .select(
        "id,status,student_name,variant_id,grading_lease_until,grading_error,proposed_score,final_score,max_score,upload_index,created_at,submission_pages(id,page_index)",
        { count: "exact" },
      )
      .eq("batch_id", batchId)
      .order("upload_index", { nullsFirst: false })
      .order("created_at")
      .order("id")
      .range(from, to),
  );
  if (submissions.length > 1000)
    throw new GradingError("Слишком много работ в одной проверке.", 422);
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
    calibration: {
      enabled: b.calibration_enabled,
      samples: b.calibration_samples,
      profile: b.calibration_profile
        ? calibrationProfileSchema.parse(b.calibration_profile)
        : null,
      revision: b.updated_at,
    },
    autonomy: {
      config: b.grading_preferences
        ? parseStoredAutonomy(b.grading_preferences)
        : b.grading_started_at
          ? legacyAutonomy
          : b.autonomy_config
            ? parseStoredAutonomy(b.autonomy_config)
            : null,
      frozen: !!b.grading_started_at,
      revision: b.updated_at,
    },
    submissions: submissions
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
        pageId:
          s.submission_pages.sort((a, b) => a.page_index - b.page_index)[0]
            ?.id ?? null,
        pages: s.submission_pages
          .sort((a, b) => a.page_index - b.page_index)
          .map((p) => ({ id: p.id, number: p.page_index + 1 })),
      })),
  };
}

const storedAnswerSchema = z.object({
  text: z.string().nullable().default(null),
  choice_ids: z.array(z.string()).default([]),
  flags: z.array(z.string()).default([]),
  crop: cropSchema.nullable().default(null),
  teacher_unreadable: z.boolean().default(false),
  page_id: z.uuid().nullable().optional(),
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
    .select(
      "*,submissions!inner(id,batch_id),grading_calibration_feedback(comment)",
      { count: "exact" },
    )
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
        pageId:
          recognized.page_id && s.pages.some((p) => p.id === recognized.page_id)
            ? recognized.page_id
            : s.pageId,
        questionNumber: q.number,
        question: q.question,
        text: recognized.text,
        choiceIds: recognized.choice_ids,
        flags: recognized.flags,
        crop: recognized.crop,
        teacherUnreadable: recognized.teacher_unreadable,
        proposedScore: a.proposed_score,
        finalScore: a.final_score,
        confidence: a.confidence ?? 0,
        explanation: a.reasoning_summary ?? "",
        status: a.review_status,
        calibrationSample:
          progress.calibration.enabled &&
          !progress.calibration.profile &&
          progress.calibration.samples.includes(s.id),
        calibrationComment: a.grading_calibration_feedback?.comment ?? "",
      };
    }),
  };
}

export async function getWorkReview(
  teacherId: string,
  batchId: string,
  submissionId?: string,
): Promise<WorkReview | null> {
  const [progress, key] = await Promise.all([
    getGradingProgress(teacherId, batchId),
    getAnswerKey(teacherId, batchId),
  ]);
  if (!progress || !key) return null;
  const submission = submissionId
    ? progress.submissions.find((s) => s.id === submissionId)
    : (progress.submissions.find((s) => s.status === "needs_review") ??
      progress.submissions.find((s) =>
        ["proposed", "completed"].includes(s.status),
      ) ??
      progress.submissions[0]);
  if (submissionId && !submission) return null;
  if (!submission)
    return { progress, submission: null, answers: [], maximum: null };
  const group =
    submission.variantId === null
      ? key.document.questions
      : key.document.variants?.find((v) => v.id === submission.variantId)
          ?.questions;
  if (!group)
    throw new GradingError("Вариант работы не совпадает с ключом.", 503);
  const byQuestion = new Map(
    group.map((q, index) => [q.id, { question: q, number: index + 1 }]),
  );
  const client = await createClient();
  const rows = await readAllRows("work-answers", (from, to) =>
    client
      .from("submission_answers")
      .select("*,grading_calibration_feedback(comment)", { count: "exact" })
      .eq("submission_id", submission.id)
      .order("id")
      .range(from, to),
  );
  if (
    rows.length > 100 ||
    (["proposed", "needs_review", "completed"].includes(submission.status) &&
      rows.length !== group.length)
  )
    throw new GradingError(
      "Получен неполный набор ответов. Обновите работу.",
      503,
    );
  const answers: ReviewAnswer[] = rows
    .map((a) => {
      const q = byQuestion.get(a.question_id);
      if (!q || !submission.pageId)
        throw new GradingError("Ответ не совпадает с вариантом работы.", 503);
      const recognized = storedAnswerSchema.parse(a.recognized_answer);
      return {
        id: a.id,
        revision: a.updated_at,
        submissionId: submission.id,
        submissionNumber: submission.number,
        studentName: submission.studentName,
        pageId:
          recognized.page_id &&
          submission.pages.some((p) => p.id === recognized.page_id)
            ? recognized.page_id
            : submission.pageId,
        questionNumber: q.number,
        question: q.question,
        text: recognized.text,
        choiceIds: recognized.choice_ids,
        flags: recognized.flags,
        crop: recognized.crop,
        teacherUnreadable: recognized.teacher_unreadable,
        proposedScore: a.proposed_score,
        finalScore: a.final_score,
        confidence: a.confidence ?? 0,
        explanation: a.reasoning_summary ?? "",
        status: a.review_status,
        calibrationSample:
          progress.calibration.enabled &&
          !progress.calibration.profile &&
          progress.calibration.samples.includes(submission.id),
        calibrationComment: a.grading_calibration_feedback?.comment ?? "",
      };
    })
    .sort((a, b) => a.questionNumber - b.questionNumber);
  return {
    progress,
    submission,
    answers,
    maximum: group.reduce((sum, q) => sum + q.max_score, 0),
  };
}
