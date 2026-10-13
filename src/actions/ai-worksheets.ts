"use server";

import { AiRequestError } from "@/lib/ai/errors";
import {
  generateWorksheetSuggestion,
  regenerateQuestionSuggestion,
} from "@/lib/ai/generate-worksheet";
import { requireUser } from "@/lib/auth/session";
import {
  generateWorksheetInputSchema,
  regenerateQuestionInputSchema,
} from "@/lib/validation/ai-worksheets";
import type { QuestionInput, WorksheetInput } from "@/types/worksheets";

function generationError(error: unknown) {
  if (error instanceof AiRequestError) return { error: error.message };
  console.error("AI suggestion failed", { operation: "suggestion" });
  return { error: "Не удалось выполнить запрос AI. Попробуйте позже." };
}

export async function generateWorksheet(
  input: unknown,
): Promise<
  | { worksheet: WorksheetInput }
  | { error: string; fieldErrors?: Record<string, string[]> }
> {
  const user = await requireUser("/worksheets/new");
  const parsed = generateWorksheetInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      error: "Проверьте параметры генерации.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  try {
    return {
      worksheet: await generateWorksheetSuggestion(user.id, parsed.data),
    };
  } catch (error) {
    return generationError(error);
  }
}

export async function regenerateQuestion(
  input: unknown,
): Promise<{ question: QuestionInput } | { error: string }> {
  const user = await requireUser("/worksheets/new");
  const parsed = regenerateQuestionInputSchema.safeParse(input);
  if (!parsed.success)
    return {
      error: "Укажите предмет, класс, тему и сложность задания для замены.",
    };
  try {
    return {
      question: await regenerateQuestionSuggestion(user.id, parsed.data),
    };
  } catch (error) {
    return generationError(error);
  }
}
