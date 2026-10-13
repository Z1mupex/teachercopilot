import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { getBatch } from "@/lib/grading/repository";
import { idSchema } from "@/lib/grading/validation";
import { BatchUpload } from "@/components/grading/batch-upload";
export const metadata: Metadata = {
  title: "Загрузить работы — Teacher Copilot",
};
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
  return (
    <div className="space-y-6">
      <Link
        href="/grading"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        Все проверки
      </Link>
      <div>
        <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">
          {batch.title}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {batch.className ?? "Без класса"} ·{" "}
          {batch.worksheetTitle ?? "Внешние работы"}
        </p>
      </div>
      <BatchUpload key={batch.id} initial={batch} />
    </div>
  );
}
