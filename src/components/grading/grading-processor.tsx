"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Play,
  Pause,
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  secondaryButtonClass,
  selectClass,
} from "@/components/worksheets/labels";
import { GradingSteps } from "@/components/grading/grading-steps";
import {
  canProcessSubmission,
  useGradingProcessor,
} from "@/components/grading/use-grading-processor";
import type { GradingProgress } from "@/types/grading-workflow";
import {
  AutonomyEditor,
  AutonomySummary,
} from "@/components/grading/autonomy-editor";
import { autonomySchema, type AutonomyRules } from "@/lib/grading/autonomy";
import { configureGradingAutonomy } from "@/actions/grading-autonomy";
import { CalibrationPanel } from "@/components/grading/calibration-panel";
const statusLabels: Record<string, string> = {
  uploaded: "Ожидает запуска",
  processing: "Обрабатывается",
  failed: "Не удалось обработать",
  needs_review: "Нужна проверка учителя",
  proposed: "Предварительная оценка готова",
  completed: "Завершено",
};
export function GradingProcessor({
  initial,
  variants,
  aiConfigured,
  defaultAutonomy,
  calibrationQuestions,
}: {
  initial: GradingProgress;
  variants: { id: string | null; label: string }[];
  aiConfigured: boolean;
  defaultAutonomy: AutonomyRules;
  calibrationQuestions: { id: string; label: string }[];
}) {
  const p = useGradingProcessor(initial, variants.length > 1),
    batch = p.progress;
  const pending = batch.submissions.filter(
    (s) =>
      canProcessSubmission(s, batch.observedAt) &&
      s.status !== "failed" &&
      (!batch.calibration.enabled ||
        batch.calibration.profile ||
        batch.calibration.samples.includes(s.id)),
  );
  const ready = pending.length > 0 && pending.every((s) => p.selections[s.id]);
  const closed = batch.status === "completed";
  const [autonomy, setAutonomy] = useState(
    batch.autonomy.config ?? defaultAutonomy,
  );
  const [savingAutonomy, setSavingAutonomy] = useState(false);
  const [calibrationBusy, setCalibrationBusy] = useState(false);
  const configured =
    batch.autonomy.frozen ||
    (!!batch.autonomy.config &&
      JSON.stringify(autonomySchema.safeParse(autonomy).data) ===
        JSON.stringify(autonomySchema.safeParse(batch.autonomy.config).data));
  async function saveAutonomy() {
    if (savingAutonomy || p.running || calibrationBusy) return;
    if (!autonomySchema.safeParse(autonomy).success) {
      p.setError("Проверьте порог confidence и параметры режима.");
      return;
    }
    setSavingAutonomy(true);
    p.setError(null);
    try {
      const result = await configureGradingAutonomy({
        batch: batch.id,
        revision: batch.autonomy.revision,
        preferences: autonomy,
        acknowledged: true,
      });
      if ("error" in result) {
        p.setError(result.error ?? "Не удалось сохранить режим.");
        return;
      }
      await p.refresh();
    } catch {
      p.setError(
        "Режим не подтверждён сервером. Обновите страницу перед запуском.",
      );
    } finally {
      setSavingAutonomy(false);
    }
  }
  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Распознать и оценить
        </h1>
        <p className="mt-3 break-words text-muted-foreground">{batch.title}</p>
      </div>
      <GradingSteps current={2} batchId={batch.id} />
      <CalibrationPanel
        progress={batch}
        questions={calibrationQuestions}
        running={p.running || savingAutonomy}
        aiConfigured={aiConfigured}
        onRefresh={p.refresh}
        onBusy={setCalibrationBusy}
      />
      <section
        aria-label="Самостоятельность ИИ для этой проверки"
        className="space-y-4 rounded-lg border bg-card p-5 sm:p-6"
      >
        <h2 className="text-lg font-semibold">Самостоятельность ИИ</h2>
        {batch.autonomy.frozen && batch.autonomy.config ? (
          <AutonomySummary rules={batch.autonomy.config} frozen />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Подтвердите режим перед первым запуском. Он применяется ко всем
              работам этой проверки и фиксируется при запуске.
            </p>
            <AutonomyEditor
              value={autonomy}
              onChange={setAutonomy}
              disabled={p.running || savingAutonomy || calibrationBusy}
            />
            <Button
              onClick={saveAutonomy}
              disabled={
                p.running ||
                savingAutonomy ||
                calibrationBusy ||
                configured ||
                !batch.confirmed
              }
            >
              {savingAutonomy
                ? "Сохраняем…"
                : configured
                  ? "Режим выбран"
                  : "Использовать этот режим"}
            </Button>
          </>
        )}
      </section>
      <section className="space-y-5 rounded-2xl border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2
              className="text-xl font-semibold"
              aria-live="polite"
              aria-atomic="true"
            >
              Проверено {batch.processed}/{batch.submissions.length}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              ИИ предлагает предварительные баллы по выбранному режиму. Спорные
              места проверяет учитель. Каждый ответ сохраняется; после закрытия
              страницы можно продолжить.
            </p>
          </div>
          <button
            type="button"
            className={secondaryButtonClass}
            onClick={() =>
              void p
                .refresh()
                .catch(() => p.setError("Не удалось обновить прогресс."))
            }
          >
            <RefreshCw className="size-4" />
            Обновить
          </button>
        </div>
        <Progress
          aria-label="Обработано работ"
          value={batch.processed}
          max={Math.max(1, batch.submissions.length)}
        />
        {!batch.confirmed && (
          <p className="rounded-xl bg-secondary p-4 text-sm">
            Сначала{" "}
            <Link
              href={`/grading/${batch.id}/answers`}
              className="text-primary underline"
            >
              подтвердите ответы и баллы
            </Link>
            .
          </p>
        )}
        {!aiConfigured && (
          <p className="rounded-xl bg-secondary p-4 text-sm">
            AI пока не подключён. Для распознавания нужен ключ Groq на сервере.
          </p>
        )}
        {p.error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {p.error}
          </p>
        )}
        {!closed && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={
                !ready ||
                p.running ||
                calibrationBusy ||
                !batch.confirmed ||
                !aiConfigured ||
                !configured ||
                savingAutonomy ||
                calibrationBusy
              }
              onClick={() => void p.run(pending.map((s) => s.id))}
            >
              <Play className="size-4" />
              {batch.calibration.enabled && !batch.calibration.profile
                ? "Начать пробную проверку"
                : batch.calibration.profile
                  ? "Проверить оставшиеся по утверждённым правилам"
                  : batch.processed
                    ? "Продолжить обработку"
                    : "Начать распознавание"}
            </Button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={!p.running || p.paused}
              onClick={p.pause}
            >
              <Pause className="size-4" />
              Не запускать следующие
            </button>
            <p className="text-xs text-muted-foreground">
              {p.paused
                ? "Запуск следующих работ приостановлен. Уже запущенные запросы завершатся."
                : "Одновременно — до двух работ. Уже запущенные запросы завершатся."}
            </p>
          </div>
        )}
        {variants.length > 1 && !closed && (
          <p className="text-sm text-muted-foreground">
            Укажите вариант каждой работы. Он определяет ключ для проверки; AI
            не выбирает его автоматически.
          </p>
        )}
      </section>
      <section
        className="overflow-hidden rounded-2xl border bg-card"
        aria-label="Статус каждой работы"
      >
        <ul className="divide-y">
          {batch.submissions.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {s.status === "failed" ? (
                    <AlertTriangle className="size-4 shrink-0 text-destructive" />
                  ) : ["proposed", "needs_review", "completed"].includes(
                      s.status,
                    ) ? (
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  ) : null}
                  <span className="break-words">
                    Работа № {s.number}
                    {batch.calibration.samples.includes(s.id)
                      ? " · Пробная"
                      : ""}{" "}
                    · {s.pages.length} листов
                    {s.studentName ? ` · ${s.studentName}` : ""}
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {canProcessSubmission(s, batch.observedAt) &&
                  s.status === "processing"
                    ? "Попытка прервалась. Можно повторить."
                    : (statusLabels[s.status] ?? s.status)}
                  {s.proposedScore !== null
                    ? ` · Предложено ${s.proposedScore}/${s.maxScore}`
                    : ""}
                </p>
                {s.error && (
                  <p className="mt-2 max-w-2xl break-words text-sm text-destructive">
                    {s.error}
                  </p>
                )}
              </div>
              <div className="flex max-w-full flex-wrap items-center gap-3">
                <select
                  aria-label={`Вариант работы № ${s.number}`}
                  value={p.selections[s.id] ?? s.variantId ?? "base"}
                  disabled={
                    p.running ||
                    calibrationBusy ||
                    !canProcessSubmission(s, batch.observedAt) ||
                    closed
                  }
                  onChange={(e) =>
                    p.setSelections((v) => ({ ...v, [s.id]: e.target.value }))
                  }
                  className={`${selectClass} w-48`}
                >
                  <option value="" disabled>
                    Выберите вариант
                  </option>
                  {variants.map((v) => (
                    <option key={v.id ?? "base"} value={v.id ?? "base"}>
                      {v.label}
                    </option>
                  ))}
                </select>
                {s.pageId && (
                  <a
                    href={`/grading/${batch.id}/pages/${s.pageId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline"
                  >
                    Оригинал
                  </a>
                )}
                {canProcessSubmission(s, batch.observedAt) &&
                  s.status !== "uploaded" &&
                  !closed && (
                    <button
                      type="button"
                      disabled={
                        p.running ||
                        calibrationBusy ||
                        !p.selections[s.id] ||
                        !aiConfigured ||
                        !batch.confirmed ||
                        (batch.calibration.enabled &&
                          !batch.calibration.profile &&
                          !batch.calibration.samples.includes(s.id)) ||
                        !configured ||
                        savingAutonomy ||
                        calibrationBusy
                      }
                      className={secondaryButtonClass}
                      onClick={() => void p.run([s.id])}
                    >
                      Повторить работу
                    </button>
                  )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="flex flex-wrap justify-end gap-3">
        <Link
          href={`/grading/${batch.id}/answers`}
          className={secondaryButtonClass}
        >
          Ответы и критерии
        </Link>
        {batch.answers > 0 && (
          <Link
            href={`/grading/${batch.id}/${closed ? "results" : "review"}`}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            {closed ? "Итоговые результаты" : "Проверить ответы"}
            <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
    </div>
  );
}
