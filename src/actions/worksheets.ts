"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { DatabaseRequestError } from "@/lib/database/errors";
import {
  persistWorksheet,
  removeWorksheet,
  WorksheetConflictError,
  WorksheetNotFoundError,
  WorksheetReadOnlyError,
} from "@/lib/worksheets/repository";
import {
  saveWorksheetSchema,
  worksheetIdSchema,
} from "@/lib/validation/worksheets";
import type { WorksheetMutationResult } from "@/types/worksheets";

function safeError(error: unknown): string {
  if (error instanceof WorksheetNotFoundError)
    return "Работа не найдена или недоступна.";
  if (error instanceof WorksheetConflictError)
    return "Работа уже изменена в другой вкладке. Обновите страницу перед сохранением.";
  if (error instanceof WorksheetReadOnlyError)
    return "Работа используется в проверках и доступна только для чтения. История оценивания сохранена.";
  if (!(error instanceof DatabaseRequestError))
    console.error("Worksheet mutation failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
  return "Не удалось сохранить изменения. Попробуйте ещё раз.";
}

function revalidateWorksheets(id: string) {
  for (const path of [
    "/worksheets",
    "/dashboard",
    `/worksheets/${id}`,
    `/worksheets/${id}/edit`,
  ])
    revalidatePath(path);
}

export async function saveWorksheet(
  input: unknown,
): Promise<WorksheetMutationResult> {
  const user = await requireUser("/worksheets/new");
  // Only domain fields enter persistence. Browser ownership claims are discarded.
  const object =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const parsed = saveWorksheetSchema.safeParse({
    id: object.id,
    expected_updated_at: object.expected_updated_at,
    document: {
      title: object.title,
      subject: object.subject,
      grade: object.grade,
      status: object.status,
      questions: object.questions,
      variants: object.variants,
    },
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.filter((part) => part !== "document").join(".");
      (fieldErrors[path || "root"] ??= []).push(issue.message);
    }
    return { error: "Проверьте поля работы и задания.", fieldErrors };
  }
  let result: { id: string; updated_at: string };
  try {
    result = await persistWorksheet(
      user.id,
      parsed.data.document,
      parsed.data.id,
      parsed.data.expected_updated_at,
    );
  } catch (error) {
    return { error: safeError(error) };
  }
  revalidateWorksheets(result.id);
  return result;
}

export async function deleteWorksheet(
  id: string,
  confirmation: string,
): Promise<{ success: true } | { error: string }> {
  const user = await requireUser("/worksheets");
  const parsedId = worksheetIdSchema.safeParse(id);
  if (!parsedId.success || confirmation !== "delete")
    return { error: "Подтвердите удаление доступной вам работы." };
  try {
    await removeWorksheet(user.id, parsedId.data);
  } catch (error) {
    return { error: safeError(error) };
  }
  revalidateWorksheets(parsedId.data);
  return { success: true };
}
