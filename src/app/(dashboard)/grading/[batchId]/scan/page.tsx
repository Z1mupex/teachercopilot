import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getBatch } from "@/lib/grading/repository";
import { idSchema } from "@/lib/grading/validation";
import { BatchScan } from "@/components/grading/batch-scan";
export const metadata: Metadata = { title: "Batch Scan — Teacher Copilot" };
export default async function Page({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const user = await requireUser("/grading");
  const { batchId } = await params;
  if (!idSchema.safeParse(batchId).success) notFound();
  const batch = await getBatch(user.id, batchId);
  if (!batch) notFound();
  if (!["draft", "uploading", "ready"].includes(batch.status))
    return (
      <section className="space-y-4">
        <h1 className="text-2xl font-bold">Съёмка недоступна</h1>
        <p>Проверка уже обрабатывается. Страницы защищены от изменений.</p>
        <Link href={`/grading/${batch.id}`} className="text-primary underline">
          Открыть проверку
        </Link>
      </section>
    );
  return <BatchScan key={batch.id} initial={batch} />;
}
