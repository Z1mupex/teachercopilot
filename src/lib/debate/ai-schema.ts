import { z } from "zod";
export const debateTopicInputSchema = z
  .object({
    subject: z
      .string()
      .trim()
      .min(1, "Укажите предмет.")
      .max(100, "Предмет — до 100 символов."),
    level: z
      .string()
      .trim()
      .min(1, "Укажите класс или уровень.")
      .max(60, "Уровень — до 60 символов."),
    theme: z
      .string()
      .trim()
      .min(3, "Укажите тему.")
      .max(300, "Тема — до 300 символов."),
    language: z.enum(["ru", "en"]),
    includeEnglishSupport: z.boolean(),
  })
  .strict();
const phrases = z.array(z.string().trim().min(1).max(160)).max(5);
export const debateTopicOutputSchema = z
  .object({
    statements: z.array(z.string().trim().min(3).max(500)).length(3),
    vocabulary: phrases,
    agreeing: phrases,
    disagreeing: phrases,
    transitions: phrases,
  })
  .strict();
export type DebateTopicInput = z.infer<typeof debateTopicInputSchema>;
export type DebateTopicOutput = z.infer<typeof debateTopicOutputSchema>;
