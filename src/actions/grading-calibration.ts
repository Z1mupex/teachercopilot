"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { calibrationProfileSchema } from "@/lib/grading/calibration-schema";
import { suggestCalibration } from "@/lib/ai/calibrate-grading";
import { approveCalibration } from "@/lib/grading/calibration-repository";
import { GradingError } from "@/lib/grading/repository";
import { AiRequestError } from "@/lib/ai/errors";
import { gradingAiMessage } from "@/lib/grading/ai-errors";
const identity = z.object({
  batch: z.uuid(),
  revision: z.iso.datetime({ offset: true }),
});
function failure(error: unknown) {
  if (error instanceof GradingError) return error.message;
  if (error instanceof AiRequestError) return gradingAiMessage(error);
  console.error("Calibration failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return "Не удалось выполнить пробную проверку.";
}
export async function configureCalibration(input: unknown) {
  await requireUser("/grading");
  const parsed = identity
    .extend({ samples: z.array(z.uuid()).max(5) })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    return {
      error:
        "Выберите от трёх до пяти работ (или все работы, если их меньше трёх).",
    };
  const { batch, revision, samples } = parsed.data,
    client = await createClient({ writable: true });
  const { error } = await client.rpc("configure_grading_calibration", {
    p_batch: batch,
    p_revision: revision,
    p_samples: samples,
  });
  if (error)
    return {
      error:
        error.code === "PT412"
          ? "Проверка изменена. Обновите страницу."
          : "Пробные работы выбираются до первого запуска проверки.",
    };
  revalidatePath(`/grading/${batch}/process`);
  return { success: true };
}
export async function generateCalibration(input: unknown) {
  const user = await requireUser("/grading"),
    parsed = z.object({ batch: z.uuid() }).strict().safeParse(input);
  if (!parsed.success) return { error: "Проверка недоступна." };
  try {
    return await suggestCalibration(user.id, parsed.data.batch);
  } catch (error) {
    return { error: failure(error) };
  }
}
export async function saveCalibration(input: unknown) {
  await requireUser("/grading");
  const parsed = identity
    .extend({ profile: calibrationProfileSchema })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { error: "Проверьте правила калибровки." };
  try {
    await approveCalibration(
      parsed.data.batch,
      parsed.data.revision,
      parsed.data.profile,
    );
    revalidatePath(`/grading/${parsed.data.batch}/process`);
    return { success: true };
  } catch (error) {
    return { error: failure(error) };
  }
}
