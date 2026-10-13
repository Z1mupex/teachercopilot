import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { idSchema } from "@/lib/grading/validation";
import { getReviewSlice } from "@/lib/grading/workflow-repository";
import { GradingReview } from "@/components/grading/grading-review";
export const metadata = { title: "Проверить результаты — Teacher Copilot" };
export default async function Page({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const user = await requireUser("/grading");
  const { batchId } = await params;
  if (!idSchema.safeParse(batchId).success) notFound();
  const initial = await getReviewSlice(user.id, batchId, false, 0);
  if (!initial) notFound();
  return <GradingReview initial={initial} />;
}
