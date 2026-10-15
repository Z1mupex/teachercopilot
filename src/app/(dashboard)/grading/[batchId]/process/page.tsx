import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { isAiConfigured } from "@/lib/env";
import { idSchema } from "@/lib/grading/validation";
import { getGradingProgress } from "@/lib/grading/workflow-repository";
import { getAnswerKey } from "@/lib/grading/answer-key-repository";
import { GradingProcessor } from "@/components/grading/grading-processor";
import { getTeacherSettings } from "@/lib/settings/repository";
import { gradingSettings } from "@/lib/settings/schema";
export const metadata = { title: "Распознать и оценить — Teacher Copilot" };
export default async function Page({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const user = await requireUser("/grading");
  const { batchId } = await params;
  if (!idSchema.safeParse(batchId).success) notFound();
  const [progress, key, preferences] = await Promise.all([
    getGradingProgress(user.id, batchId),
    getAnswerKey(user.id, batchId),
    getTeacherSettings(user.id),
  ]);
  if (!progress || !key) notFound();
  return (
    <GradingProcessor
      initial={progress}
      variants={[
        { id: null, label: "Вариант 1" },
        ...(key.document.variants ?? []).map((v) => ({
          id: v.id,
          label: v.label,
        })),
      ]}
      aiConfigured={isAiConfigured()}
      defaultAutonomy={{
        ...gradingSettings(preferences.settings),
        mode: preferences.settings.ai_preset,
      }}
      calibrationQuestions={[
        { label: "Вариант 1", questions: key.document.questions },
        ...(key.document.variants ?? []),
      ].flatMap((group) =>
        group.questions
          .filter((q) => q.type !== "multiple_choice")
          .map((q) => ({
            id: q.id,
            label: `${group.label} · задание ${group.questions.indexOf(q) + 1}: ${q.prompt.slice(0, 100)}`,
          })),
      )}
    />
  );
}
