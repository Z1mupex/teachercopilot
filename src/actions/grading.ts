"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import {
  batchInputSchema,
  idSchema,
  layoutSchema,
  revisionSchema,
} from "@/lib/grading/validation";
import {
  deleteBlob,
  getBatch,
  GradingError,
  insertBatch,
  manageUpload,
  ownedPage,
} from "@/lib/grading/repository";
import type { GradingResult } from "@/types/grading";

export async function createGradingBatch(
  _previous: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const user = await requireUser("/grading/new");
  const parsed = batchInputSchema.safeParse({
    title: formData.get("title"),
    class_id: formData.get("class_id"),
    worksheet_id: formData.get("worksheet_id"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let id: string;
  try {
    id = await insertBatch(user.id, parsed.data);
  } catch (error) {
    return { error: failure(error) };
  }
  revalidatePath("/grading");
  revalidatePath("/dashboard");
  redirect(`/grading/${id}`);
}

function failure(error: unknown) {
  if (error instanceof GradingError) return error.message;
  console.error("Grading mutation failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return "Не удалось сохранить изменения. Попробуйте ещё раз.";
}

export async function changeGradingPages(
  batchId: string,
  revision: string,
  input: unknown,
): Promise<GradingResult> {
  const user = await requireUser(`/grading/${batchId}`);
  const parsed = layoutSchema.safeParse(input);
  if (
    !idSchema.safeParse(batchId).success ||
    !revisionSchema.safeParse(revision).success ||
    !parsed.success
  )
    return { error: "Проверьте список страниц и обновите проверку." };
  try {
    let path: string | undefined;
    if (parsed.data.command === "remove")
      path = (await ownedPage(user.id, batchId, parsed.data.id)).page
        .storage_path;
    const { command, ...payload } = parsed.data;
    await manageUpload(batchId, revision, command, payload);
    if (path) await deleteBlob(path);
    revalidatePath("/grading");
    revalidatePath(`/grading/${batchId}`);
    revalidatePath("/dashboard");
    const batch = await getBatch(user.id, batchId);
    if (!batch) throw new GradingError("Проверка недоступна.");
    return { batch };
  } catch (error) {
    return { error: failure(error) };
  }
}

export async function refreshGradingBatch(
  batchId: string,
): Promise<GradingResult> {
  const user = await requireUser("/grading");
  if (!idSchema.safeParse(batchId).success)
    return { error: "Проверка недоступна." };
  try {
    const batch = await getBatch(user.id, batchId);
    return batch ? { batch } : { error: "Проверка недоступна." };
  } catch (error) {
    return { error: failure(error) };
  }
}
