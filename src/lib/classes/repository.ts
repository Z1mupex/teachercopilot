import "server-only";

import { throwDatabaseError } from "@/lib/database/errors";
import { readAllRows } from "@/lib/database/read-all-rows";
import { createClient } from "@/lib/supabase/server";
import type { ClassInput } from "@/lib/validation/classes";

export class ClassNotFoundError extends Error {}

export async function listClasses(teacherId: string) {
  const supabase = await createClient();
  return readAllRows("classes-list", (from, to) =>
    supabase
      .from("classes")
      .select("*", { count: "exact" })
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
}

export async function getClass(teacherId: string, id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("classes")
    .select("*")
    .eq("teacher_id", teacherId)
    .eq("id", id)
    .maybeSingle();
  if (error) throwDatabaseError("classes-read", error);
  return data;
}

export async function insertClass(teacherId: string, input: ClassInput) {
  const supabase = await createClient({ writable: true });
  const { data, error } = await supabase
    .from("classes")
    .insert({ ...input, teacher_id: teacherId })
    .select("id")
    .single();
  if (error) throwDatabaseError("classes-create", error);
  return data.id;
}

export async function editClass(
  teacherId: string,
  id: string,
  input: ClassInput,
) {
  const supabase = await createClient({ writable: true });
  const { data, error } = await supabase
    .from("classes")
    .update(input)
    .eq("teacher_id", teacherId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throwDatabaseError("classes-update", error);
  if (!data) throw new ClassNotFoundError();
}

export async function removeClass(teacherId: string, id: string) {
  const supabase = await createClient({ writable: true });
  const { data, error } = await supabase
    .from("classes")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throwDatabaseError("classes-delete", error);
  if (!data) throw new ClassNotFoundError();
}
