import "server-only";

import { throwDatabaseError } from "@/lib/database/errors";
import { readAllRows } from "@/lib/database/read-all-rows";
import { createClient } from "@/lib/supabase/server";
import type { BatchInput } from "@/lib/grading/validation";
import type { GradingBatch } from "@/types/grading";
import type { Json } from "@/types/database";
import { scanQualitySchema } from "@/lib/grading/scan-validation";

export class GradingError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

export async function getBatch(
  teacherId: string,
  id: string,
): Promise<GradingBatch | null> {
  const client = await createClient();
  const { data, error } = await client
    .from("grading_batches")
    .select(
      "id,title,status,updated_at,answer_key_confirmed_at,scan_review_required,classes(name),worksheets!grading_batches_worksheet_id_teacher_id_fkey(title),submissions(id,upload_index,created_at,submission_pages(id,page_index,upload_status,width,height,storage_path,scan_quality,scan_reviewed_at,content_hash,perceptual_hash))",
    )
    .eq("id", id)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (error) throwDatabaseError("grading-read", error);
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    status: data.status,
    revision: data.updated_at,
    answerKeyConfirmedAt: data.answer_key_confirmed_at,
    className: data.classes?.name ?? null,
    worksheetTitle: data.worksheets?.title ?? null,
    scanReviewRequired: data.scan_review_required,
    pages: data.submissions
      .sort(
        (a, b) =>
          (a.upload_index ?? Number.MAX_SAFE_INTEGER) -
            (b.upload_index ?? Number.MAX_SAFE_INTEGER) ||
          a.created_at.localeCompare(b.created_at),
      )
      .flatMap((submission) =>
        submission.submission_pages
          .sort((a, b) => a.page_index - b.page_index)
          .map((page) => ({
            id: page.id,
            status:
              page.upload_status === "stored"
                ? ("stored" as const)
                : ("pending" as const),
            width: page.width,
            height: page.height,
            imageVersion: page.storage_path.split("/").at(-1) ?? "",
            submissionId: submission.id,
            pageIndex: page.page_index,
            reviewed: !!page.scan_reviewed_at,
            quality: page.scan_quality
              ? scanQualitySchema.parse(page.scan_quality)
              : null,
            contentHash: page.content_hash,
            perceptualHash: page.perceptual_hash,
          })),
      ),
  };
}

export const BATCH_LIST_SIZE = 20;

export async function listBatches(teacherId: string, page = 1) {
  const client = await createClient();
  const { data, error, count } = await client
    .from("grading_batches")
    .select("id,title,status,total_submissions,created_at,classes(name)", {
      count: "exact",
    })
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * BATCH_LIST_SIZE, page * BATCH_LIST_SIZE - 1);
  if (error) throwDatabaseError("grading-list", error);
  return { batches: data ?? [], count: count ?? 0 };
}

export async function batchOptions(teacherId: string) {
  const client = await createClient();
  const [classes, worksheets] = await Promise.all([
    readAllRows("grading-classes", (from, to) =>
      client
        .from("classes")
        .select("id,name", { count: "exact" })
        .eq("teacher_id", teacherId)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    readAllRows("grading-worksheets", (from, to) =>
      client
        .from("worksheets")
        .select("id,title", { count: "exact" })
        .eq("teacher_id", teacherId)
        .eq("status", "ready")
        .eq("source", "generated")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
  ]);
  return { classes, worksheets };
}

export async function insertBatch(teacherId: string, input: BatchInput) {
  const client = await createClient({ writable: true });
  // Composite FKs and RLS also enforce ownership of optional associations.
  if (input.class_id) {
    const { data, error } = await client
      .from("classes")
      .select("id")
      .eq("id", input.class_id)
      .eq("teacher_id", teacherId)
      .maybeSingle();
    if (error) throwDatabaseError("grading-class", error);
    if (!data) throw new GradingError("Выбранный класс недоступен.");
  }
  if (input.worksheet_id) {
    const { data, error } = await client
      .from("worksheets")
      .select("id")
      .eq("id", input.worksheet_id)
      .eq("teacher_id", teacherId)
      .eq("status", "ready")
      .maybeSingle();
    if (error) throwDatabaseError("grading-worksheet", error);
    if (!data)
      throw new GradingError("Выбранная работа недоступна или ещё не готова.");
  }
  const { data, error } = await client
    .from("grading_batches")
    .insert({ ...input, teacher_id: teacherId, status: "draft" })
    .select("id")
    .single();
  if (error) throwDatabaseError("grading-create", error);
  return data.id;
}

export async function manageUpload(
  batchId: string,
  revision: string,
  command: string,
  payload: Json,
) {
  const client = await createClient({ writable: true });
  const { error } = await client.rpc("manage_grading_upload", {
    p_batch: batchId,
    p_revision: revision,
    p_command: command,
    p_payload: payload,
  });
  if (error) {
    if (error.code === "PT404")
      throw new GradingError("Проверка или страница недоступна.", 404);
    if (error.code === "PT412")
      throw new GradingError(
        "Проверка изменена в другой вкладке. Обновите список перед повтором.",
        409,
      );
    if (error.code === "PT409")
      throw new GradingError(
        "Сначала загрузите все страницы. Проверки с результатами защищены от изменений.",
        409,
      );
    if (error.code === "22023")
      throw new GradingError(
        "Не удалось сохранить страницы. Проверьте количество и обновите список.",
      );
    throwDatabaseError("grading-upload-command", error);
  }
}

export async function ownedPage(
  teacherId: string,
  batchId: string,
  pageId: string,
) {
  const client = await createClient({ writable: true });
  const { data: page, error } = await client
    .from("submission_pages")
    .select(
      "id,storage_path,preview_storage_path,upload_status,width,height,removed_submission_images(page_id),submissions!inner(batch_id,grading_batches!inner(id,status,updated_at,processed_submissions,teacher_id))",
    )
    .eq("id", pageId)
    .eq("submissions.batch_id", batchId)
    .eq("submissions.grading_batches.teacher_id", teacherId)
    .maybeSingle();
  if (error) throwDatabaseError("grading-page-read", error);
  if (!page) throw new GradingError("Работа недоступна.", 404);
  return { client, batch: page.submissions.grading_batches, page };
}

export function assertEditable(batch: {
  status: string;
  processed_submissions: number;
}) {
  if (
    !["draft", "uploading", "ready"].includes(batch.status) ||
    batch.processed_submissions !== 0
  )
    throw new GradingError(
      "Эта проверка уже обрабатывается. Страницы защищены от изменений.",
      409,
    );
}

export async function deleteBlob(path: string) {
  return deleteBlobs([path]);
}
export async function deleteBlobs(paths: string[]) {
  if (!paths.length) return;
  const client = await createClient({ writable: true });
  const { error } = await client.storage.from("submission-files").remove(paths);
  if (error)
    throw new GradingError(
      "Страница удалена из проверки, но файл не удалось удалить из хранилища. Обратитесь к администратору.",
      503,
    );
}
