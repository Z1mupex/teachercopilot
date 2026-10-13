"use client";
import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { GradingSteps } from "@/components/grading/grading-steps";
import { ReviewAnswerCard } from "@/components/grading/review-answer-card";
import { useGradingReview } from "@/components/grading/use-grading-review";
import { secondaryButtonClass } from "@/components/worksheets/labels";
import type { ReviewSlice } from "@/types/grading-workflow";
export function GradingReview({ initial }: { initial: ReviewSlice }) {
  const r = useGradingReview(initial),
    p = r.data.progress,
    closed = p.status === "completed";
  const canFinalize =
    p.processed === p.submissions.length &&
    p.submissions.length > 0 &&
    p.needsReview === 0 &&
    p.answers > 0;
  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        r.busy ||
        !r.answer
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          "input,textarea,select,button,a,[contenteditable=true]",
        )
      )
        return;
      if (event.key === "ArrowRight") {
        event.preventDefault();
        r.navigate(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        r.navigate(-1);
      } else if (event.key === "Enter" && !closed) {
        event.preventDefault();
        void r.save("confirm");
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [r, closed]);
  return (
    <div className="min-w-0 space-y-6" aria-busy={r.busy}>
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Проверить результаты
        </h1>
        <p className="mt-3 break-words text-muted-foreground">
          {p.title} · Окончательное решение принимает учитель.
        </p>
      </div>
      <GradingSteps current={3} batchId={p.id} />
      <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Требуют проверки</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {p.needsReview}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Проверено учителем</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {p.teacherReviewed}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Готово ответов</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {p.answers - p.needsReview} / {p.answers}
            </p>
          </div>
        </div>
        <Progress
          aria-label="Готовность ответов"
          value={p.answers - p.needsReview}
          max={Math.max(1, p.answers)}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" aria-label="Режим очереди">
            <button
              type="button"
              aria-pressed={!r.all}
              disabled={r.busy}
              className={`${secondaryButtonClass} ${!r.all ? "border-primary text-primary" : ""}`}
              onClick={() => void r.load(false, 0)}
            >
              Требуют проверки
            </button>
            <button
              type="button"
              aria-pressed={r.all}
              disabled={r.busy}
              className={`${secondaryButtonClass} ${r.all ? "border-primary text-primary" : ""}`}
              onClick={() => void r.load(true, 0)}
            >
              Все ответы
            </button>
          </div>
          <button
            type="button"
            disabled={r.busy}
            className={secondaryButtonClass}
            onClick={() => void r.load()}
          >
            <RefreshCw className="size-4" />
            Обновить очередь
          </button>
        </div>
      </section>
      {r.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {r.error}
        </p>
      )}
      {r.notice && (
        <p role="status" className="text-sm text-primary">
          {r.notice}
        </p>
      )}
      {r.answer ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm text-muted-foreground">
              Ответ {r.data.page * 40 + r.index + 1} из {r.data.count}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Предыдущий ответ"
                className={secondaryButtonClass}
                disabled={r.busy || (r.index === 0 && r.data.page === 0)}
                onClick={() => r.navigate(-1)}
              >
                <ArrowLeft className="size-4" />
                Назад
              </button>
              <button
                type="button"
                aria-label="Следующий ответ"
                className={secondaryButtonClass}
                disabled={
                  r.busy || r.data.page * 40 + r.index + 1 >= r.data.count
                }
                onClick={() => r.navigate(1)}
              >
                Далее
                <ArrowRight className="size-4" />
              </button>
            </div>
          </div>
          <ReviewAnswerCard
            key={`${r.answer.id}:${r.answer.revision}`}
            batchId={p.id}
            answer={r.answer}
            busy={r.busy}
            closed={closed}
            onSave={r.save}
          />
          <p className="text-xs text-muted-foreground">
            Клавиатура: ← / → — переход между ответами, Enter — подтвердить
            балл. Во время ввода балла сочетания отключены.
          </p>
        </>
      ) : (
        <div className="rounded-2xl border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-9 text-primary" />
          <p className="font-semibold">
            {p.answers === 0
              ? "Пока нет распознанных ответов"
              : "Все сомнительные ответы проверены"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {p.processed < p.submissions.length
              ? "Сначала завершите обработку всех работ."
              : "В режиме «Все ответы» можно просмотреть каждое сравнение и решение."}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/grading/${p.id}/process`}
          className={secondaryButtonClass}
        >
          Прогресс обработки
        </Link>
        {closed ? (
          <Link
            className={secondaryButtonClass}
            href={`/grading/${p.id}/results`}
          >
            Итоговые результаты
          </Link>
        ) : (
          <Button
            disabled={r.busy || !canFinalize}
            onClick={() => void r.finalize()}
          >
            <CheckCircle2 className="size-4" />
            Завершить проверку
          </Button>
        )}
      </div>
      {!closed && !canFinalize && (
        <p className="text-sm text-muted-foreground">
          Завершение станет доступно после обработки всех работ и проверки всех
          сомнительных ответов.
        </p>
      )}
    </div>
  );
}
