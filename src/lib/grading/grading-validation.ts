import { z } from "zod";

export const cropSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .strict()
  .refine(
    (c) => c.x + c.width <= 1 && c.y + c.height <= 1,
    "Область выходит за пределы страницы.",
  );
export const recognizedAnswerSchema = z
  .object({
    question_id: z.uuid(),
    text: z.string().max(4000).nullable(),
    choice_ids: z.array(z.uuid()).max(12),
    confidence: z.number().min(0).max(1),
    proposed_score: z.number().min(0).max(1000).nullable(),
    explanation: z.string().max(500),
    flags: z.array(z.enum(["blank", "unreadable", "ambiguous"])).max(3),
    crop: cropSchema.nullable(),
  })
  .strict();
export const recognizedSubmissionSchema = z
  .object({
    student_name: z.string().max(160).nullable(),
    answers: z.array(recognizedAnswerSchema).max(100),
  })
  .strict();
export type RecognizedAnswer = z.infer<typeof recognizedAnswerSchema>;
export type RecognizedSubmission = z.infer<typeof recognizedSubmissionSchema>;
export const processInputSchema = z
  .object({ variant_id: z.uuid().nullable() })
  .strict();
export const reviewInputSchema = z.discriminatedUnion("command", [
  z
    .object({
      command: z.literal("confirm"),
      answer_id: z.uuid(),
      revision: z.iso.datetime({ offset: true }),
    })
    .strict(),
  z
    .object({
      command: z.literal("score"),
      answer_id: z.uuid(),
      revision: z.iso.datetime({ offset: true }),
      score: z.number().finite().min(0).max(1000),
    })
    .strict(),
  z
    .object({
      command: z.literal("unreadable"),
      answer_id: z.uuid(),
      revision: z.iso.datetime({ offset: true }),
    })
    .strict(),
]);
export const bulkReviewSchema = z
  .object({
    command: z.literal("confirm_many"),
    submission_id: z.uuid(),
    answers: z
      .array(
        z
          .object({ id: z.uuid(), revision: z.iso.datetime({ offset: true }) })
          .strict(),
      )
      .min(1)
      .max(100),
    whole_paper: z.boolean(),
  })
  .strict()
  .refine(
    (input) =>
      new Set(input.answers.map((a) => a.id)).size === input.answers.length,
    "Выберите разные ответы.",
  );
