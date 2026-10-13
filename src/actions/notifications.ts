"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function readNotifications(ids: unknown) {
  const user = await requireUser();
  const parsed = z.array(z.uuid()).min(1).max(20).safeParse(ids);
  if (!parsed.success) return { error: "Некорректный список уведомлений." };
  const client = await createClient({ writable: true });
  const { data, error } = await client
    .from("teacher_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("teacher_id", user.id)
    .in("id", parsed.data)
    .select("id");
  if (error || data?.length !== parsed.data.length)
    return { error: "Не удалось отметить уведомления прочитанными." };
  return { success: true };
}
