"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { autonomySchema } from "@/lib/grading/autonomy";

export async function configureGradingAutonomy(input: unknown) {
  await requireUser("/grading");
  const parsed = z
    .object({
      batch: z.uuid(),
      revision: z.iso.datetime({ offset: true }),
      preferences: autonomySchema,
      acknowledged: z.literal(true),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    return {
      error: "Подтвердите режим и проверьте параметры самостоятельности ИИ.",
    };
  const client = await createClient({ writable: true });
  const { error } = await client.rpc("configure_grading_autonomy", {
    p_batch: parsed.data.batch,
    p_revision: parsed.data.revision,
    p_preferences: parsed.data.preferences,
    p_acknowledged: true,
  });
  if (error)
    return {
      error:
        error.code === "PT412"
          ? "Проверка изменена в другой вкладке. Обновите страницу перед выбором режима."
          : error.code === "PT409"
            ? "Проверка уже началась: её правила зафиксированы."
            : "Не удалось сохранить режим проверки.",
    };
  revalidatePath(`/grading/${parsed.data.batch}/process`);
  return { success: true };
}
