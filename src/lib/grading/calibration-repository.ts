import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  getGradingProgress,
  workflowError,
} from "@/lib/grading/workflow-repository";
import { getAnswerKey } from "@/lib/grading/answer-key-repository";
import { readAllRows } from "@/lib/database/read-all-rows";
import { GradingError } from "@/lib/grading/repository";
export async function calibrationExamples(teacherId: string, batchId: string) {
  const [progress, key] = await Promise.all([
    getGradingProgress(teacherId, batchId),
    getAnswerKey(teacherId, batchId),
  ]);
  if (!progress || !key) throw new GradingError("Проверка недоступна.", 404);
  const c = progress.calibration;
  if (
    !c.enabled ||
    c.profile ||
    !c.samples.length ||
    progress.submissions
      .filter((s) => c.samples.includes(s.id))
      .some((s) => !["proposed", "needs_review"].includes(s.status))
  )
    throw new GradingError("Сначала обработайте пробные работы.", 409);
  const client = await createClient();
  const rows = await readAllRows("calibration-examples", (from, to) =>
    client
      .from("submission_answers")
      .select(
        "id,question_id,proposed_score,final_score,review_status,grading_calibration_feedback(comment)",
        { count: "exact" },
      )
      .in("submission_id", c.samples)
      .order("id")
      .range(from, to),
  );
  if (
    !rows.length ||
    rows.some(
      (a) =>
        !["teacher_confirmed", "teacher_changed"].includes(a.review_status) ||
        a.final_score === null,
    )
  )
    throw new GradingError("Подтвердите каждый ответ пробных работ.", 409);
  const questions = [
    ...key.document.questions.map((q, i) => ({
      ...q,
      label: `Задание ${i + 1} · вариант 1`,
    })),
    ...(key.document.variants ?? []).flatMap((v, variantIndex) =>
      v.questions.map((q, i) => ({
        ...q,
        label: `Задание ${i + 1} · вариант ${variantIndex + 2}`,
      })),
    ),
  ].filter((q) => q.type !== "multiple_choice");
  const allowed = new Set(questions.map((q) => q.id));
  const examples = rows
    .filter(
      (a) =>
        allowed.has(a.question_id) &&
        a.grading_calibration_feedback?.comment.trim(),
    )
    .map((a) => ({
      question_id: a.question_id,
      proposed_score: a.proposed_score,
      teacher_score: a.final_score,
      comment: a.grading_calibration_feedback!.comment,
    }));
  if (!examples.length)
    throw new GradingError(
      "Добавьте пояснение хотя бы к одному решению учителя.",
      422,
    );
  // No names, images or student transcriptions enter profile generation.
  return {
    revision: c.revision,
    questions: questions.map((q) => ({
      id: q.id,
      label: q.label,
      prompt: q.prompt,
      max_score: q.max_score,
      ...("rubric" in q ? { rubric: q.rubric } : {}),
    })),
    examples,
  };
}
export async function approveCalibration(
  batch: string,
  revision: string,
  profile: import("@/lib/grading/calibration-schema").CalibrationProfile,
) {
  const client = await createClient({ writable: true });
  const { error } = await client.rpc("approve_grading_calibration", {
    p_batch: batch,
    p_revision: revision,
    p_profile: profile,
  });
  if (error) workflowError(error);
}
