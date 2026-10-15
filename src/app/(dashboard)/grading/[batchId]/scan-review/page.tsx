import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getBatch } from "@/lib/grading/repository";
import { idSchema } from "@/lib/grading/validation";
import { ScanReview } from "@/components/grading/scan-review";
export const metadata = { title: "Проверить сканы — Teacher Copilot" };
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ pages?: string }>;
}) {
  const user = await requireUser("/grading"),
    { batchId } = await params;
  if (!idSchema.safeParse(batchId).success) notFound();
  const initial = await getBatch(user.id, batchId);
  if (!initial) notFound();
  const count = z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .safeParse((await searchParams).pages ?? 1);
  return (
    <ScanReview
      initial={initial}
      pagesPerWork={count.success ? count.data : 1}
    />
  );
}
