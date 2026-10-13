import "server-only";

import { createClient } from "@/lib/supabase/server";
import { throwDatabaseError } from "@/lib/database/errors";
import { getTeacherSettings } from "@/lib/settings/repository";

export async function getNotifications(teacherId: string) {
  const client = await createClient();
  const { settings } = await getTeacherSettings(teacherId);
  const kinds = [
    ...(settings.notify_completed ? ["completed"] : []),
    ...(settings.notify_review ? ["review"] : []),
  ];
  if (!kinds.length) return { items: [], unread: 0 };
  const [list, count] = await Promise.all([
    client
      .from("teacher_notifications")
      .select(
        "id,batch_id,kind,item_count,read_at,created_at,grading_batches(title)",
      )
      .eq("teacher_id", teacherId)
      .in("kind", kinds)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(20),
    client
      .from("teacher_notifications")
      .select("id", { head: true, count: "exact" })
      .eq("teacher_id", teacherId)
      .in("kind", kinds)
      .is("read_at", null),
  ]);
  if (list.error || count.error || count.count === null)
    throwDatabaseError(
      "notifications",
      list.error ?? count.error ?? { code: "MissingCount" },
    );
  return {
    items: list.data!.map((n) => ({
      id: n.id,
      batchId: n.batch_id,
      kind: n.kind,
      count: n.item_count,
      readAt: n.read_at,
      title: n.grading_batches?.title ?? "Проверка",
    })),
    unread: count.count,
  };
}
