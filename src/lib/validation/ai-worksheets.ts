import { z } from "zod";

import {
  questionInputSchema,
  questionTypeSchema,
} from "@/lib/validation/worksheets";

function integer(min: number, max: number, message: string) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value.trim())
        : value,
    z
      .number({ error: message })
      .int(message)
      .min(min, message)
      .max(max, message),
  );
}

const subject = z.string().trim().min(1, "Укажите предмет.").max(120);
const grade = integer(1, 12, "Укажите класс от 1 до 12.");
const teacherInstructions = z
  .string()
  .trim()
  .max(2000, "Дополнительные указания: не более 2000 символов.")
  .optional()
  .default("");
const percentage = integer(0, 100, "Укажите целый процент от 0 до 100.");

export const generateWorksheetInputSchema = z
  .object({
    subject,
    grade,
    topic: z.string().trim().min(1, "Укажите тему.").max(200),
    approximate_duration: integer(1, 240, "Укажите время от 1 до 240 минут."),
    question_count: integer(1, 30, "Укажите количество заданий от 1 до 30."),
    allowed_types: z
      .array(questionTypeSchema)
      .min(1, "Выберите хотя бы один тип задания.")
      .max(4),
    difficulty_distribution: z
      .object({ easy: percentage, medium: percentage, hard: percentage })
      .strict(),
    teacher_instructions: teacherInstructions,
  })
  .superRefine((input, context) => {
    const distribution = input.difficulty_distribution;
    if (distribution.easy + distribution.medium + distribution.hard !== 100)
      context.addIssue({
        code: "custom",
        path: ["difficulty_distribution"],
        message: "Сумма долей сложности должна быть 100%.",
      });
    if (new Set(input.allowed_types).size !== input.allowed_types.length)
      context.addIssue({
        code: "custom",
        path: ["allowed_types"],
        message: "Типы заданий не должны повторяться.",
      });
  });

export const regenerateQuestionInputSchema = z.object({
  subject,
  grade,
  question: questionInputSchema.and(
    z.object({
      difficulty: z.enum(["easy", "medium", "hard"]),
      generation_context: z.object({
        topic: z
          .string()
          .trim()
          .min(1, "Укажите тему для замены задания.")
          .max(500),
        approximate_duration: z.number().int().min(1).max(240),
      }),
    }),
  ),
  teacher_instructions: teacherInstructions,
});

export type GenerateWorksheetInput = z.infer<
  typeof generateWorksheetInputSchema
>;
export type RegenerateQuestionInput = z.infer<
  typeof regenerateQuestionInputSchema
>;
