import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { idSchema } from "@/lib/grading/validation";
import {
  analyticsSearchSchema,
  getBatchAnalytics,
} from "@/lib/grading/analytics-repository";
import { BatchAnalytics } from "@/components/grading/batch-analytics";
import { isAiConfigured } from "@/lib/env";
import { getBatchConversion } from "@/lib/settings/repository";
import { percentageGrade } from "@/lib/settings/schema";
import { BatchGradeConversion } from "@/components/settings/batch-grade-conversion";
export const metadata = { title: "Результаты проверки — Teacher Copilot" };
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
  const search = analyticsSearchSchema.safeParse(await searchParams);
  if (!search.success) notFound();
  const detail = await getBatchAnalytics(user.id, batchId);
  if (!detail) notFound();
  if (
    search.data.variant &&
    !detail.analytics?.questions.some(
      (q) => (q.variantId ?? "base") === search.data.variant,
    )
  )
    notFound();
  const progress = detail.batch;
  const grading = await getBatchConversion(user.id, batchId);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Результаты проверки</h1>
        <p className="mt-2 break-words text-muted-foreground">
          {progress.title}
        </p>
      </div>
      <Link
        href={`/grading/${batchId}/review`}
        className="text-primary underline"
      >
        Просмотреть ответы и решения учителя
      </Link>
      {progress.status !== "completed" ? (
        <p className="rounded-xl border bg-card p-5">
          Результаты появятся после завершения ручной проверки.
        </p>
      ) : (
        <>
          <BatchGradeConversion
            batchId={batchId}
            initial={grading.conversion}
            initialRevision={grading.revision}
            foScale={grading.foScale}
            controlScale={grading.controlScale}
          />
          {detail.analytics && (
            <BatchAnalytics
              analytics={detail.analytics}
              batchId={batchId}
              variant={search.data.variant}
              page={search.data.page}
              aiAvailable={isAiConfigured()}
            />
          )}
          <h2 className="text-xl font-semibold">Итоговые баллы</h2>
          <div className="relative overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Итоговые баллы, подтверждённые учителем
              </caption>
              <thead>
                <tr className="border-b">
                  <th className="p-4">Работа</th>
                  <th className="p-4">Ученик</th>
                  <th className="p-4">Баллы</th>
                  <th className="p-4">Максимум</th>
                  <th className="p-4">Результат</th>
                  <th className="p-4">
                    Оценка ·{" "}
                    {grading.conversion.kind === "fo" ? "ФО" : "СОР / СОЧ"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {detail.analytics?.rows.map((s) => (
                  <tr key={s.id} className="border-b last:border-0">
                    <td className="p-4">№ {s.number}</td>
                    <td className="max-w-72 break-words p-4">
                      {s.studentName ?? `Работа № ${s.number}`}
                    </td>
                    <td className="p-4 tabular-nums">{s.finalScore ?? "—"}</td>
                    <td className="p-4 tabular-nums">{s.maxScore ?? "—"}</td>
                    <td className="p-4 tabular-nums">
                      {s.finalScore !== null && s.maxScore && s.maxScore > 0
                        ? `${Math.round((s.finalScore / s.maxScore) * 10000) / 100}%`
                        : "—"}
                    </td>
                    <td className="p-4 tabular-nums">
                      {percentageGrade(
                        s.finalScore,
                        s.maxScore,
                        grading.conversion.scale,
                      ) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
