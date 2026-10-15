"use server";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { scanReviewSchema } from "@/lib/grading/scan-validation";
import { getBatch } from "@/lib/grading/repository";
import { revalidatePath } from "next/cache";
export async function confirmScanReview(input: unknown) {
  const user = await requireUser("/grading"),
    parsed = scanReviewSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const client = await createClient({ writable: true }),
    { batch, revision, groups, reviews } = parsed.data;
  const { error } = await client.rpc("confirm_scan_review", {
    p_batch: batch,
    p_revision: revision,
    p_groups: groups,
    p_reviews: reviews,
    p_confirmed: true,
  });
  if (error)
    return {
      error:
        error.code === "PT412"
          ? "Листы изменились в другой вкладке. Обновите галерею и проверьте новые снимки."
          : error.code === "PT409"
            ? "Сначала загрузите все листы. Начатую проверку менять нельзя."
            : "Каждый лист должен быть просмотрен и входить в одну работу, не больше десяти листов в работе.",
    };
  revalidatePath(`/grading/${batch}`);
  revalidatePath("/dashboard");
  revalidatePath("/grading");
  const saved = await getBatch(user.id, batch);
  if (!saved)
    return { error: "Состояние сохранено, но не удалось обновить проверку." };
  return { batch: saved };
}
