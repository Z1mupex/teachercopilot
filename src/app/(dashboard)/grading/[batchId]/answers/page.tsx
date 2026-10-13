import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { isAiConfigured } from "@/lib/env";
import { idSchema } from "@/lib/grading/validation";
import { getBatch } from "@/lib/grading/repository";
import { getAnswerKey } from "@/lib/grading/answer-key-repository";
import { AnswerKeyEditor } from "@/components/grading/answer-key-editor";
export const metadata: Metadata = {
  title: "Добавить ответы — Teacher Copilot",
};
export default async function Page({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const user = await requireUser("/grading");
  const { batchId } = await params;
  if (!idSchema.safeParse(batchId).success) notFound();
  const [batch, key] = await Promise.all([
    getBatch(user.id, batchId),
    getAnswerKey(user.id, batchId),
  ]);
  if (!batch || !key) notFound();
  return (
    <div className="space-y-6">
      <Link
        href={`/grading/${batchId}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        Работы учеников
      </Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Добавить ответы
        </h1>
        <p className="mt-3 break-words text-sm text-muted-foreground">
          {batch.title} · Проверьте правильные ответы и критерии перед
          дальнейшей обработкой.
        </p>
      </div>
      <AnswerKeyEditor
        key={batchId}
        batchId={batchId}
        initial={key}
        aiConfigured={isAiConfigured()}
      />
    </div>
  );
}
