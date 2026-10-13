import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { batchOptions } from "@/lib/grading/repository";
import { BatchForm } from "@/components/grading/batch-form";
export const metadata: Metadata = { title: "Новая проверка — Teacher Copilot" };
export default async function Page() {
  const user = await requireUser("/grading/new");
  const options = await batchOptions(user.id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/grading"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />К проверкам
      </Link>
      <div>
        <h1 className="text-3xl font-bold">Новая проверка</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Укажите название и переходите к загрузке работ.
        </p>
      </div>
      <div className="rounded-2xl border bg-card p-6 sm:p-8">
        <BatchForm {...options} />
      </div>
    </div>
  );
}
