"use server";
import { requireUser } from "@/lib/auth/session";
import { AiRequestError } from "@/lib/ai/errors";
import { generateDebateTopics } from "@/lib/ai/generate-debate";
import {
  debateTopicInputSchema,
  type DebateTopicOutput,
} from "@/lib/debate/ai-schema";

export async function suggestDebateTopics(
  input: unknown,
): Promise<{ suggestion: DebateTopicOutput } | { error: string }> {
  const user = await requireUser("/debate");
  const parsed = debateTopicInputSchema.safeParse(input);
  if (!parsed.success)
    return { error: "Проверьте предмет, уровень, тему и язык." };
  try {
    return { suggestion: await generateDebateTopics(user.id, parsed.data) };
  } catch (error) {
    if (error instanceof AiRequestError) {
      if (error.code === "invalid_output")
        return {
          error:
            "AI вернул темы, которые не прошли проверку. Измените параметры и попробуйте ещё раз.",
        };
      if (error.code === "incomplete" || error.code === "timeout")
        return {
          error: "AI не завершил подбор тем вовремя. Попробуйте ещё раз позже.",
        };
      return { error: error.message };
    }
    console.error("Debate suggestion failed", { operation: "topics" });
    return { error: "Не удалось получить темы дебатов. Попробуйте позже." };
  }
}
