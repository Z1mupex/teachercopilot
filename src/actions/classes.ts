"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import {
  ClassNotFoundError,
  editClass,
  insertClass,
  removeClass,
} from "@/lib/classes/repository";
import { DatabaseRequestError } from "@/lib/database/errors";
import {
  classIdSchema,
  classInputSchema,
  deleteClassSchema,
} from "@/lib/validation/classes";
import type { ClassFormState } from "@/types/classes";

function readInput(formData: FormData) {
  // Ownership is deliberately absent from browser input.
  return classInputSchema.safeParse({
    name: formData.get("name"),
    grade: formData.get("grade"),
    subject: formData.get("subject"),
    student_count: formData.get("student_count"),
  });
}

function mutationError(error: unknown): ClassFormState {
  if (error instanceof ClassNotFoundError)
    return { error: "Класс не найден или недоступен. Обновите страницу." };
  if (!(error instanceof DatabaseRequestError))
    console.error("Class mutation failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
  return { error: "Не удалось сохранить изменения. Попробуйте ещё раз." };
}

function revalidateClasses(id?: string) {
  revalidatePath("/classes");
  revalidatePath("/dashboard");
  if (id) revalidatePath(`/classes/${id}`);
}

export async function createClass(
  _previous: ClassFormState,
  formData: FormData,
): Promise<ClassFormState> {
  const user = await requireUser("/classes/new");
  const parsed = readInput(formData);
  if (!parsed.success)
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  let id: string;
  try {
    id = await insertClass(user.id, parsed.data);
  } catch (error) {
    return mutationError(error);
  }
  revalidateClasses();
  redirect(`/classes/${id}`);
}

export async function updateClass(
  id: string,
  _previous: ClassFormState,
  formData: FormData,
): Promise<ClassFormState> {
  const user = await requireUser("/classes");
  const parsedId = classIdSchema.safeParse(id);
  if (!parsedId.success) return { error: "Класс не найден или недоступен." };
  const parsed = readInput(formData);
  if (!parsed.success)
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  try {
    await editClass(user.id, parsedId.data, parsed.data);
  } catch (error) {
    return mutationError(error);
  }
  revalidateClasses(parsedId.data);
  return { success: "Изменения сохранены." };
}

export async function deleteClass(
  id: string,
  _previous: ClassFormState,
  formData: FormData,
): Promise<ClassFormState> {
  const user = await requireUser("/classes");
  const parsed = deleteClassSchema.safeParse({
    id,
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success)
    return { error: "Подтвердите удаление доступного вам класса." };
  try {
    await removeClass(user.id, parsed.data.id);
  } catch (error) {
    return mutationError(error);
  }
  revalidateClasses(parsed.data.id);
  redirect("/classes?deleted=1");
}
