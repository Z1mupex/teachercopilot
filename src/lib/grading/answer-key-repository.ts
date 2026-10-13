import "server-only";
import { createClient } from "@/lib/supabase/server";
import { throwDatabaseError } from "@/lib/database/errors";
import { GradingError } from "@/lib/grading/repository";
import { getWorksheet } from "@/lib/worksheets/repository";
import { duplicateQuestion, questionFromRows } from "@/lib/worksheets/domain";
import {
  answerKeySchema,
  reviewMarkSchema,
  answerSourceSchema,
  type AnswerKeyDetail,
  type AnswerKeyInput,
} from "@/lib/grading/answer-key-validation";
import { z } from "zod";
import type { Json } from "@/types/database";

export async function getAnswerKey(
  teacherId: string,
  batchId: string,
): Promise<AnswerKeyDetail | null> {
  const client = await createClient();
  const { data: batch, error } = await client
    .from("grading_batches")
    .select("*")
    .eq("id", batchId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (error) throwDatabaseError("answer-key-batch", error);
  if (!batch) return null;
  const { count, error: countError } = await client
    .from("submission_answers")
    .select("id,submissions!inner(batch_id)", { count: "exact", head: true })
    .eq("submissions.batch_id", batchId);
  if (countError || count === null)
    throwDatabaseError(
      "answer-key-lock",
      countError ?? { code: "MissingCount" },
    );
  const { data: submissions, error: submissionError } = await client
    .from("submissions")
    .select("variant_id,status")
    .eq("batch_id", batchId);
  if (submissionError)
    throwDatabaseError("answer-key-submissions", submissionError);
  const editable =
    batch.status === "ready" &&
    batch.processed_submissions === 0 &&
    count === 0 &&
    submissions.length > 0 &&
    submissions.every((s) => s.variant_id === null && s.status === "uploaded");
  let input: AnswerKeyInput;
  if (batch.answer_key_worksheet_id) {
    const { data: context, error: contextError } = await client
      .from("worksheets")
      .select("*,questions(*,answer_keys(*)),worksheet_variants(*)")
      .eq("id", batch.answer_key_worksheet_id)
      .eq("teacher_id", teacherId)
      .eq("source", "uploaded")
      .maybeSingle();
    if (contextError || !context)
      throwDatabaseError(
        "answer-key-context",
        contextError ?? { code: "MissingContext" },
      );
    const questionsFor = (id: string | null) =>
      context.questions
        .filter((q) => q.variant_id === id)
        .sort((a, b) => a.order_index - b.order_index)
        .map((q) => questionFromRows(q, q.answer_keys ?? undefined));
    input = answerKeySchema.parse({
      document: {
        title: context.title,
        subject: context.subject,
        grade: context.grade,
        status: batch.answer_key_confirmed_at ? "ready" : "draft",
        questions: questionsFor(null),
        variants: context.worksheet_variants
          .sort((a, b) => a.variant_index - b.variant_index)
          .map((v) => ({
            id: v.id,
            label: v.label,
            questions: questionsFor(v.id),
          })),
      },
      review: z.array(reviewMarkSchema).parse(batch.answer_key_review),
      source: answerSourceSchema.parse(batch.answer_key_source),
      confirmed: Boolean(batch.answer_key_confirmed_at),
    });
  } else if (batch.worksheet_id) {
    const original = await getWorksheet(teacherId, batch.worksheet_id);
    if (!original) throw new GradingError("Исходная работа недоступна.", 404);
    input = {
      document: {
        title: original.title,
        subject: original.subject,
        grade: original.grade,
        questions: original.questions,
        variants: original.variants,
        status: "draft",
      },
      source: "worksheet",
      review: [],
      confirmed: false,
    };
  } else
    input = {
      document: {
        title: batch.title,
        subject: null,
        grade: null,
        status: "draft",
        questions: [],
        variants: [],
      },
      source: "manual",
      review: [],
      confirmed: false,
    };
  return {
    ...input,
    revision: batch.updated_at,
    confirmedAt: batch.answer_key_confirmed_at,
    editable,
  };
}

export async function persistAnswerKey(
  teacherId: string,
  batchId: string,
  revision: string,
  input: AnswerKeyInput,
) {
  const current = await getAnswerKey(teacherId, batchId);
  if (!current) throw new GradingError("Проверка недоступна.", 404);
  if (!current.editable)
    throw new GradingError(
      "Завершите загрузку страниц. Ответы после начала обработки защищены от изменений.",
      409,
    );
  const ids = new Map<string, string>();
  const copyQuestions = (questions: AnswerKeyInput["document"]["questions"]) =>
    questions.map((question) => {
      const copy = duplicateQuestion(question);
      ids.set(question.id, copy.id);
      return copy;
    });
  const document = {
    ...input.document,
    questions: copyQuestions(input.document.questions),
    variants: (input.document.variants ?? []).map((v) => ({
      ...v,
      id: crypto.randomUUID(),
      questions: copyQuestions(v.questions),
    })),
  };
  const review = input.review.map((mark) => ({
    ...mark,
    question_id: ids.get(mark.question_id)!,
  }));
  const client = await createClient({ writable: true });
  const { error } = await client.rpc("save_grading_answer_key", {
    p_batch: batchId,
    p_revision: revision,
    p_document: document as Json,
    p_source: input.source,
    p_review: review as Json,
    p_confirm: input.confirmed,
  });
  if (error) {
    if (error.code === "PT404")
      throw new GradingError("Проверка недоступна.", 404);
    if (error.code === "PT412")
      throw new GradingError(
        "Ответы изменились в другой вкладке. Скопируйте свои правки и обновите страницу.",
        409,
      );
    if (error.code === "PT409")
      throw new GradingError(
        "Эта проверка уже обрабатывается. Ответы защищены от изменений.",
        409,
      );
    if (["PT422", "22P02", "23514"].includes(error.code))
      throw new GradingError(
        "Проверьте ответы, баллы и отметки сомнительных полей.",
      );
    throwDatabaseError("answer-key-save", error);
  }
  const saved = await getAnswerKey(teacherId, batchId);
  if (!saved)
    throw new GradingError("Не удалось перечитать сохранённые ответы.", 503);
  return saved;
}
