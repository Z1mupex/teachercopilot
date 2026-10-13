import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getReviewSlice } from "@/lib/grading/workflow-repository";
import { ReviewDesignPreview } from "@/components/grading/review-design-preview";

export const metadata = { title: "Примерка дизайна — Teacher Copilot" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string | string[] }>;
}) {
  const user = await requireUser("/grading");
  const batch = z.uuid().safeParse((await searchParams).batch);
  if (!batch.success) notFound();
  const initial = await getReviewSlice(user.id, batch.data, true, 0);
  if (!initial) notFound();
  return <ReviewDesignPreview initial={initial} />;
}
