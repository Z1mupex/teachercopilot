import { z } from "zod";

// Provider schemas deliberately omit editor UUIDs and persistence fields. Every
// property is required, and nullable values express absent answers/rubrics.
const baseQuestion = {
  prompt: z.string().min(1).max(5000),
  max_score: z.number().min(0).max(1000),
  difficulty: z.enum(["easy", "medium", "hard"]),
};

export const aiQuestionOutputSchema = z.discriminatedUnion("type", [
  z.object({
    ...baseQuestion,
    type: z.literal("multiple_choice"),
    options: z.array(z.string().min(1).max(1000)).min(2).max(8),
    correct_option_indexes: z
      .array(z.number().int().min(0).max(7))
      .min(1)
      .max(8),
  }),
  z.object({
    ...baseQuestion,
    type: z.literal("short_answer"),
    expected_answer: z.string().min(1).max(4000),
  }),
  z.object({
    ...baseQuestion,
    type: z.literal("numeric"),
    expected_answer: z.number(),
    tolerance: z.number().min(0).max(1_000_000),
  }),
  z.object({
    ...baseQuestion,
    type: z.literal("open_response"),
    expected_answer: z.string().min(1).max(5000).nullable(),
    rubric: z.string().min(1).max(5000).nullable(),
  }),
]);

export const aiWorksheetOutputSchema = z.object({
  title: z.string().min(1).max(200),
  subject: z.string().min(1).max(120),
  grade: z.number().int().min(1).max(12),
  questions: z.array(aiQuestionOutputSchema).min(1).max(30),
});

// Structured Outputs requires an object root, including individual regeneration.
export const aiRegenerationOutputSchema = z.object({
  question: aiQuestionOutputSchema,
});

export type AiQuestionOutput = z.infer<typeof aiQuestionOutputSchema>;
export type AiWorksheetOutput = z.infer<typeof aiWorksheetOutputSchema>;
