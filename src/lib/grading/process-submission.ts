import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getAnswerKey } from "@/lib/grading/answer-key-repository";
import { GradingError } from "@/lib/grading/repository";
import { workflowError } from "@/lib/grading/workflow-repository";
import { recognizeAndGrade } from "@/lib/ai/grade-submission";
import { AiRequestError } from "@/lib/ai/errors";
import { gradingAiMessage } from "@/lib/grading/ai-errors";
import type { Json } from "@/types/database";

export async function processSubmission(
  teacherId: string,
  batchId: string,
  submissionId: string,
  variantId: string | null,
) {
  const key = await getAnswerKey(teacherId, batchId);
  if (!key) throw new GradingError("Проверка недоступна.", 404);
  if (!key.confirmed)
    throw new GradingError("Сначала подтвердите ответы и баллы.", 409);
  const questions =
    variantId === null
      ? key.document.questions
      : key.document.variants?.find((v) => v.id === variantId)?.questions;
  if (!questions?.length)
    throw new GradingError("Укажите существующий вариант.", 422);
  const client = await createClient({ writable: true });
  const { data: attempt, error: claimError } = await client.rpc(
    "claim_grading_submission",
    { p_batch: batchId, p_submission: submissionId, p_variant: variantId },
  );
  if (claimError) workflowError(claimError);
  if (!attempt) throw new GradingError("Не удалось начать обработку.", 503);
  let saving = false;
  try {
    const { data: page, error } = await client
      .from("submission_pages")
      .select("storage_path,submissions!inner(batch_id)")
      .eq("submission_id", submissionId)
      .eq("submissions.batch_id", batchId)
      .eq("upload_status", "stored")
      .single();
    if (error || !page)
      throw new GradingError("Оригинал работы недоступен.", 503);
    const { data: blob, error: downloadError } = await client.storage
      .from("submission-files")
      .download(page.storage_path);
    if (downloadError || !blob)
      throw new GradingError("Не удалось загрузить оригинал работы.", 503);
    if (blob.size > 6 * 1024 * 1024)
      throw new GradingError("Страница превышает допустимый размер.", 413);
    const result = await recognizeAndGrade(
      teacherId,
      Buffer.from(await blob.arrayBuffer()),
      questions,
    );
    saving = true;
    const { error: saveError } = await client.rpc("finish_grading_submission", {
      p_batch: batchId,
      p_submission: submissionId,
      p_attempt: attempt,
      p_answers: result.answers as Json,
      p_student_name: result.studentName,
    });
    if (saveError) workflowError(saveError);
  } catch (error) {
    // A committed RPC can lose its HTTP acknowledgement. Read the exact attempt
    // before declaring failure; never re-run paid/non-idempotent recognition.
    if (saving) {
      try {
        const { data: saved, error: readError } = await client
          .from("submissions")
          .select("status,grading_attempt_id,grading_batches!inner(teacher_id)")
          .eq("id", submissionId)
          .eq("batch_id", batchId)
          .eq("grading_batches.teacher_id", teacherId)
          .maybeSingle();
        if (readError)
          console.error("Grading acknowledgement lookup failed", {
            code: readError.code,
          });
        if (
          saved?.grading_attempt_id === attempt &&
          ["proposed", "needs_review", "completed"].includes(saved.status)
        )
          return;
      } catch (lookupError) {
        console.error("Grading acknowledgement lookup unavailable", {
          name:
            lookupError instanceof Error ? lookupError.name : "UnknownError",
        });
      }
    }
    const message =
      error instanceof AiRequestError
        ? gradingAiMessage(error)
        : error instanceof GradingError
          ? error.message
          : "Не удалось обработать работу. Повторите попытку.";
    const { error: failureError } = await client.rpc(
      "fail_grading_submission",
      {
        p_batch: batchId,
        p_submission: submissionId,
        p_attempt: attempt,
        p_error: message,
      },
    );
    if (failureError)
      console.error("Grading failure persistence failed", {
        code: failureError.code,
      });
    throw error;
  }
}
