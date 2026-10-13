import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/database/read-all-rows";
import { throwDatabaseError } from "@/lib/database/errors";
import { getTeacherSettings } from "@/lib/settings/repository";

// Only terminal batches qualify. Scores/answers and their immutable page rows remain.
export async function cleanupCompletedImages(
  teacherId: string,
  expiredOnly: boolean,
) {
  const client = await createClient({ writable: true });
  const { settings } = await getTeacherSettings(teacherId);
  if (expiredOnly && settings.retention_days === null) return 0;
  const cutoff = new Date(
    Date.now() - (settings.retention_days ?? 0) * 86400000,
  ).toISOString();
  const batches = await readAllRows("privacy-batches", (from, to) => {
    let query = client
      .from("grading_batches")
      .select("id", { count: "exact" })
      .eq("teacher_id", teacherId)
      .eq("status", "completed")
      .order("id");
    if (expiredOnly) query = query.lt("completed_at", cutoff);
    return query.range(from, to);
  });
  let removed = 0;
  for (const batch of batches) {
    const pages = await readAllRows("privacy-pages", (from, to) =>
      client
        .from("submission_pages")
        .select(
          "id,storage_path,removed_submission_images(page_id),submissions!inner(batch_id)",
          { count: "exact" },
        )
        .eq("submissions.batch_id", batch.id)
        .eq("upload_status", "stored")
        .order("id")
        .range(from, to),
    );
    for (const page of pages) {
      if (page.removed_submission_images) continue;
      if (!page.storage_path.startsWith(`${teacherId}/`))
        throw new Error("InvalidOwnedImagePath");
      const { error } = await client.storage
        .from("submission-files")
        .remove([page.storage_path]);
      if (error)
        throwDatabaseError("privacy-storage-remove", { code: error.name });
      // Record only acknowledged removals. A lost response can be safely retried.
      const marker = await client
        .from("removed_submission_images")
        .upsert(
          { page_id: page.id, teacher_id: teacherId },
          { onConflict: "page_id", ignoreDuplicates: true },
        );
      if (marker.error)
        throwDatabaseError("privacy-image-marker", marker.error);
      removed++;
    }
  }
  return removed;
}
