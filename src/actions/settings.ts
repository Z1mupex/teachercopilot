"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { settingsSchema, scaleSchema } from "@/lib/settings/schema";
import { cleanupCompletedImages } from "@/lib/settings/privacy";
import type { Json } from "@/types/database";

export async function saveTeacherSettings(input: unknown) {
  await requireUser("/settings");
  const parsed = z
    .object({ document: settingsSchema, revision: z.number().int().min(0) })
    .strict()
    .safeParse(input);
  if (!parsed.success)
    return {
      error: "Проверьте поля настроек.",
      fieldErrors: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  const client = await createClient({ writable: true });
  const { data, error } = await client.rpc("save_teacher_settings", {
    p_document: parsed.data.document as Json,
    p_revision: parsed.data.revision,
  });
  if (error || !data) {
    console.error("Settings save failed", {
      code: error?.code ?? "MissingRevision",
    });
    return {
      error:
        error?.code === "PT412"
          ? "Настройки изменены в другой вкладке. Обновите страницу перед сохранением."
          : "Не удалось сохранить настройки. Попробуйте ещё раз.",
    };
  }
  revalidatePath("/", "layout");
  return { revision: data };
}

export async function removeCompletedImages(confirmation: unknown) {
  const user = await requireUser("/settings");
  if (confirmation !== "delete-completed-images")
    return { error: "Подтвердите удаление изображений завершённых проверок." };
  try {
    const removed = await cleanupCompletedImages(user.id, false);
    revalidatePath("/grading", "layout");
    return { removed };
  } catch (error) {
    console.error("Image cleanup failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      error:
        "Удаление не завершено. Часть файлов могла быть удалена; повторный запуск безопасен. Результаты сохранены.",
    };
  }
}

export async function runRetentionCleanup() {
  const user = await requireUser("/settings");
  try {
    return { removed: await cleanupCompletedImages(user.id, true) };
  } catch (error) {
    console.error("Retention cleanup failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return {
      error:
        "Не удалось удалить изображения по сроку хранения. Повторите очистку в настройках.",
    };
  }
}

export async function saveGradeConversion(input: unknown) {
  const user = await requireUser("/grading");
  const parsed = z
    .object({
      batch: z.uuid(),
      revision: z.iso.datetime({ offset: true }),
      kind: z.enum(["fo", "control"]),
      scale: scaleSchema,
    })
    .strict()
    .safeParse(input);
  if (
    !parsed.success ||
    parsed.data.scale.at(-1)?.grade !== (parsed.data.kind === "fo" ? 10 : 5) ||
    (parsed.data.kind === "control" &&
      parsed.data.scale.some((row) => row.grade < 1 || row.grade > 5))
  )
    return { error: "Проверьте проценты и оценки шкалы." };
  const client = await createClient({ writable: true });
  const { error } = await client.rpc("save_batch_grade_conversion", {
    p_batch: parsed.data.batch,
    p_revision: parsed.data.revision,
    p_kind: parsed.data.kind,
    p_scale: parsed.data.scale as Json,
  });
  if (error)
    return {
      error:
        error.code === "PT412"
          ? "Работа изменена. Обновите страницу."
          : "Не удалось сохранить шкалу.",
    };
  revalidatePath(`/grading/${parsed.data.batch}/results`);
  const { data, error: readError } = await client
    .from("grading_batches")
    .select("updated_at")
    .eq("id", parsed.data.batch)
    .eq("teacher_id", user.id)
    .single();
  if (readError || !data)
    return {
      error: "Шкала сохранена, но обновление не получено. Обновите страницу.",
    };
  return { revision: data.updated_at };
}
