import "server-only";

import { throwDatabaseError } from "@/lib/database/errors";
import { createClient } from "@/lib/supabase/server";

export async function getDashboardData(teacherId: string) {
  const supabase = await createClient();
  const [classes, batches, worksheets] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, grade, subject, student_count", { count: "exact" })
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(4),
    supabase
      .from("grading_batches")
      .select(
        "id, title, status, total_submissions, processed_submissions, created_at",
        { count: "exact" },
      )
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(5),
    supabase
      .from("worksheets")
      .select("id, title, subject, grade, status, created_at", {
        count: "exact",
      })
      .eq("teacher_id", teacherId)
      .eq("source", "generated")
      .order("created_at", { ascending: false })
      .order("id")
      .limit(5),
  ]);
  if (classes.error) throwDatabaseError("dashboard-classes", classes.error);
  if (batches.error) throwDatabaseError("dashboard-batches", batches.error);
  if (worksheets.error)
    throwDatabaseError("dashboard-worksheets", worksheets.error);
  if (
    classes.count === null ||
    batches.count === null ||
    worksheets.count === null
  )
    throwDatabaseError("dashboard-counts", { code: "missing_count" });
  return {
    classes: classes.data,
    classCount: classes.count,
    batches: batches.data,
    batchCount: batches.count,
    worksheets: worksheets.data,
    worksheetCount: worksheets.count,
  };
}
