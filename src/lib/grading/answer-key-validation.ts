import { z } from "zod";
import { worksheetInputSchema } from "@/lib/validation/worksheets";

export const answerSourceSchema = z.enum([
  "manual",
  "worksheet",
  "photo",
  "file",
  "solved_teacher",
]);
export const reviewFieldSchema = z.enum([
  "number",
  "type",
  "answer",
  "score",
  "rubric",
  "options",
  "confidence",
  "missing",
]);
export const reviewMarkSchema = z
  .object({
    question_id: z.uuid(),
    fields: z.array(reviewFieldSchema).min(1).max(8),
    reviewed: z.boolean(),
  })
  .strict();
export const answerKeySchema = z
  .object({
    document: worksheetInputSchema,
    source: answerSourceSchema,
    review: z.array(reviewMarkSchema).max(300),
    confirmed: z.boolean(),
  })
  .strict()
  .superRefine((input, context) => {
    const questions = [
      input.document.questions,
      ...(input.document.variants ?? []).map((v) => v.questions),
    ].flat();
    const ids = new Set(questions.map((q) => q.id));
    const marks = input.review.map((mark) => mark.question_id);
    if (
      new Set(marks).size !== marks.length ||
      marks.some((id) => !ids.has(id))
    )
      context.addIssue({
        code: "custom",
        path: ["review"],
        message: "Обновите отметки проверки ответов.",
      });
    if (input.document.status !== (input.confirmed ? "ready" : "draft"))
      context.addIssue({
        code: "custom",
        path: ["confirmed"],
        message: "Проверьте статус ключа ответов.",
      });
    if (!input.confirmed) return;
    if (input.review.some((mark) => !mark.reviewed))
      context.addIssue({
        code: "custom",
        path: ["review"],
        message: "Проверьте и отметьте все сомнительные поля.",
      });
    const groups = [
      { questions: input.document.questions, path: ["document", "questions"] },
      ...(input.document.variants ?? []).map((variant, index) => ({
        questions: variant.questions,
        path: ["document", "variants", index, "questions"],
      })),
    ];
    for (const group of groups) {
      for (const [index, question] of group.questions.entries()) {
        if (question.max_score <= 0)
          context.addIssue({
            code: "custom",
            path: [...group.path, index, "max_score"],
            message:
              "У каждого задания должен быть положительный максимальный балл.",
          });
        if (
          question.type === "open_response" &&
          !question.expected_answer?.trim() &&
          !question.rubric?.trim()
        )
          context.addIssue({
            code: "custom",
            path: [...group.path, index, "rubric"],
            message:
              "Для развёрнутого ответа добавьте пример ответа или критерии.",
          });
      }
    }
  });
export type AnswerKeyInput = z.infer<typeof answerKeySchema>;
export type ReviewField = z.infer<typeof reviewFieldSchema>;
export type ReviewMark = z.infer<typeof reviewMarkSchema>;
export type AnswerKeyDetail = AnswerKeyInput & {
  revision: string;
  confirmedAt: string | null;
  editable: boolean;
};
export const reviewFieldLabels: Record<ReviewField, string> = {
  number: "номер задания",
  type: "тип задания",
  answer: "правильный ответ",
  score: "максимальный балл",
  rubric: "критерии",
  options: "варианты ответа",
  confidence: "неуверенное распознавание",
  missing: "пропущенное задание",
};
export const MAX_ANSWER_PAGES = 3;
export const MAX_ANSWER_BODY = 12 * 1024 * 1024;
