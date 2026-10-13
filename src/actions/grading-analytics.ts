"use server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getBatchAnalytics } from "@/lib/grading/analytics-repository";
import { gradingSummarySuggestion } from "@/lib/ai/summarize-grading";
import { AiRequestError } from "@/lib/ai/errors";
import type { AiGradingSummary } from "@/lib/ai/grading-summary-schema";

export async function summarizeGrading(
  input: unknown,
): Promise<{ summary: AiGradingSummary } | { error: string }> {
  const user = await requireUser("/analytics");
  const parsed = z.object({ batchId: z.uuid() }).strict().safeParse(input);
  if (!parsed.success) return { error: "Укажите завершённую проверку." };
  try {
    const detail = await getBatchAnalytics(user.id, parsed.data.batchId);
    if (!detail) return { error: "Проверка недоступна." };
    if (!detail.analytics || !detail.analytics.summary.completed)
      return { error: "Сначала завершите проверку работ." };
    return {
      summary: await gradingSummarySuggestion(user.id, detail.analytics),
    };
  } catch (error) {
    if (error instanceof AiRequestError) return { error: error.message };
    console.error("Grading analytics suggestion failed", {
      operation: "summary",
    });
    return {
      error:
        "Не удалось получить предложение по результатам. Попробуйте позже.",
    };
  }
}
