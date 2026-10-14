import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { idSchema } from "@/lib/grading/validation";
import { getWorkReview } from "@/lib/grading/workflow-repository";
import { WorkReviewScreen } from "@/components/grading/work-review";
import { z } from "zod";
export const metadata = { title: "Проверить результаты — Teacher Copilot" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser("/grading");
  const { batchId } = await params;
  if (!idSchema.safeParse(batchId).success) notFound();
  const search = z
    .object({ submission: z.uuid().optional() })
    .safeParse(await searchParams);
  if (!search.success) notFound();
  const initial = await getWorkReview(user.id, batchId, search.data.submission);
  if (!initial) notFound();
  return <WorkReviewScreen initial={initial} />;
}
