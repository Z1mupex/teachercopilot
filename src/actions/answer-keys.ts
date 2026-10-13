"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  answerKeySchema,
  type AnswerKeyDetail,
} from "@/lib/grading/answer-key-validation";
import { persistAnswerKey } from "@/lib/grading/answer-key-repository";
import { GradingError } from "@/lib/grading/repository";
import { idSchema, revisionSchema } from "@/lib/grading/validation";

export async function saveAnswerKey(
  batchId: string,
  revision: string,
  input: unknown,
): Promise<
  { data: AnswerKeyDetail; error?: never } | { error: string; data?: never }
> {
  const user = await requireUser("/grading");
  const parsed = answerKeySchema.safeParse(input);
  if (
    !idSchema.safeParse(batchId).success ||
    !revisionSchema.safeParse(revision).success
  )
    return { error: "Обновите проверку перед сохранением." };
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const data = await persistAnswerKey(
      user.id,
      batchId,
      revision,
      parsed.data,
    );
    revalidatePath("/grading");
    revalidatePath("/dashboard");
    revalidatePath(`/grading/${batchId}`);
    revalidatePath(`/grading/${batchId}/answers`);
    return { data };
  } catch (error) {
    if (error instanceof GradingError) return { error: error.message };
    console.error("Answer key save failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return { error: "Не удалось сохранить ответы. Попробуйте ещё раз." };
  }
}
