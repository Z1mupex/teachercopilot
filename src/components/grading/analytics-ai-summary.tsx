"use client";
import { useState, useTransition } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { summarizeGrading } from "@/actions/grading-analytics";
import type { AiGradingSummary } from "@/lib/ai/grading-summary-schema";

export function AnalyticsAiSummary({
  batchId,
  available,
}: {
  batchId: string;
  available: boolean;
}) {
  const [summary, setSummary] = useState<AiGradingSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <section
      aria-labelledby="ai-analytics-title"
      className="rounded-2xl border bg-card p-5 sm:p-6"
    >
      <h2
        id="ai-analytics-title"
        className="flex items-center gap-2 text-xl font-semibold"
      >
        <Sparkles className="size-5 text-primary" aria-hidden="true" />
        Идеи для следующего урока от AI
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Необязательное AI-предложение по сводной статистике. Изображения и
        индивидуальные ответы учеников не отправляются. Анализ охватывает до 20
        заданий с самым низким результатом.
      </p>
      <Button
        className="mt-4"
        disabled={!available || pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const result = await summarizeGrading({ batchId });
              if ("error" in result) setError(result.error);
              else setSummary(result.summary);
            } catch {
              setError(
                "Не удалось получить предложение. Проверьте соединение и попробуйте снова.",
              );
            }
          });
        }}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="size-4" aria-hidden="true" />
        )}
        {pending
          ? "Готовим предложение…"
          : summary
            ? "Обновить AI-предложение"
            : "Получить AI-предложение"}
      </Button>
      {!available && (
        <p className="mt-2 text-sm text-muted-foreground">
          AI пока не подключён. Вся статистика доступна без него.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {summary && (
        <div
          aria-live="polite"
          className="mt-5 space-y-4 rounded-xl bg-secondary p-4"
        >
          <p className="text-xs font-semibold text-primary">
            Сгенерировано AI · Проверьте перед использованием
          </p>
          <div>
            <h3 className="font-semibold">Общие затруднения</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
              {summary.weaknesses.map((text, i) => (
                <li key={i} className="break-words">
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Что повторить</h3>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm">
              {summary.reviewNextLesson.map((text, i) => (
                <li key={i} className="break-words">
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-semibold">Короткая практика</h3>
            <p className="mt-2 break-words text-sm leading-6">
              {summary.followUpActivity}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
