import "server-only";

import { throwDatabaseError } from "@/lib/database/errors";
import { readAllRows } from "@/lib/database/read-all-rows";
import { createClient } from "@/lib/supabase/server";
import { questionFromRows } from "@/lib/worksheets/domain";
import { worksheetInputSchema } from "@/lib/validation/worksheets";
import type { Json } from "@/types/database";
import type { WorksheetDetail, WorksheetInput } from "@/types/worksheets";

export class WorksheetNotFoundError extends Error {}
export class WorksheetConflictError extends Error {}
export class WorksheetReadOnlyError extends Error {}

function mutationFailure(operation: string, error: { code?: string }) {
  if (error.code === "PT404") throw new WorksheetNotFoundError();
  if (error.code === "PT412") throw new WorksheetConflictError();
  if (error.code === "PT409") throw new WorksheetReadOnlyError();
  throwDatabaseError(operation, error);
}

export async function listWorksheets(teacherId: string) {
  const supabase = await createClient();
  return readAllRows("worksheets-list", (from, to) =>
    supabase
      .from("worksheets")
      .select("id,title,subject,grade,status,source,created_at,updated_at", {
        count: "exact",
      })
      .eq("teacher_id", teacherId)
      .eq("source", "generated")
      .in("status", ["draft", "ready"])
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
}

export async function getWorksheet(
  teacherId: string,
  id: string,
): Promise<WorksheetDetail | null> {
  const supabase = await createClient();
  const { data: worksheet, error } = await supabase
    .from("worksheets")
    .select("*")
    .eq("teacher_id", teacherId)
    .eq("id", id)
    .eq("source", "generated")
    .in("status", ["draft", "ready"])
    .maybeSingle();
  if (error) throwDatabaseError("worksheets-read", error);
  if (!worksheet) return null;
  const [questionResult, variantResult, batchResult] = await Promise.all([
    supabase
      .from("questions")
      .select("*,answer_keys(*)")
      .eq("worksheet_id", id)
      .order("order_index")
      .order("id"),
    supabase
      .from("worksheet_variants")
      .select("id,label,variant_index")
      .eq("worksheet_id", id)
      .order("variant_index"),
    supabase
      .from("grading_batches")
      .select("id", { count: "exact", head: true })
      .eq("worksheet_id", id)
      .eq("teacher_id", teacherId),
  ]);
  for (const result of [questionResult, variantResult, batchResult])
    if (result.error)
      throwDatabaseError("worksheet-content-read", result.error);
  if (!variantResult.data || batchResult.count === null)
    throwDatabaseError("worksheet-content-count", { code: "MissingCount" });
  try {
    const rows = questionResult.data!;
    const knownIds = new Set(variantResult.data.map((variant) => variant.id));
    if (
      rows.some(
        (row) => row.variant_id !== null && !knownIds.has(row.variant_id),
      )
    )
      throw new Error("InvalidWorksheetVariant");
    const questionsFor = (variantId: string | null) =>
      rows
        .filter((row) => row.variant_id === variantId)
        .map((row) => questionFromRows(row, row.answer_keys ?? undefined));
    const input = worksheetInputSchema.parse({
      title: worksheet.title,
      subject: worksheet.subject,
      grade: worksheet.grade,
      status: worksheet.status,
      questions: questionsFor(null),
      ...(variantResult.data.length
        ? {
            variants: variantResult.data.map((variant) => ({
              id: variant.id,
              label: variant.label,
              questions: questionsFor(variant.id),
            })),
          }
        : {}),
    });
    return {
      ...input,
      id: worksheet.id,
      updated_at: worksheet.updated_at,
      editable: batchResult.count === 0,
    };
  } catch {
    throwDatabaseError("worksheet-content-invalid", {
      code: "InvalidWorksheetContent",
    });
  }
}

export async function persistWorksheet(
  teacherId: string,
  document: WorksheetInput,
  id?: string,
  expectedUpdatedAt?: string,
) {
  // RPC independently derives ownership from auth.uid(); this preflight is also
  // deliberately scoped to the actor verified by the Server Action.
  if (id && !(await getWorksheet(teacherId, id)))
    throw new WorksheetNotFoundError();
  const supabase = await createClient({ writable: true });
  const { data, error } = await supabase.rpc("save_teacher_worksheet", {
    p_document: document as Json,
    p_id: id,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) mutationFailure("worksheet-save", error);
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof data.id !== "string" ||
    typeof data.updated_at !== "string"
  )
    throwDatabaseError("worksheet-save-result", { code: "InvalidResult" });
  return { id: data.id, updated_at: data.updated_at };
}

export async function removeWorksheet(teacherId: string, id: string) {
  const supabase = await createClient({ writable: true });
  const { data: worksheet, error: readError } = await supabase
    .from("worksheets")
    .select("id")
    .eq("id", id)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (readError) throwDatabaseError("worksheet-delete-read", readError);
  if (!worksheet) throw new WorksheetNotFoundError();
  const { data, error } = await supabase.rpc("delete_teacher_worksheet", {
    p_id: id,
  });
  if (error) mutationFailure("worksheet-delete", error);
  if (data !== true) throw new WorksheetNotFoundError();
}
