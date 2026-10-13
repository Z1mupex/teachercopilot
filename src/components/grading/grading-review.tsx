"use client";
import { useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Check,
  LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { GradingSteps } from "@/components/grading/grading-steps";
import { ReviewAnswerCard } from "@/components/grading/review-answer-card";
import { useGradingReview } from "@/components/grading/use-grading-review";
import { secondaryButtonClass } from "@/components/worksheets/labels";
import type { ReviewSlice } from "@/types/grading-workflow";

export function GradingReview({ initial }: { initial: ReviewSlice }) {
  const r = useGradingReview(initial);
  const p = r.data.progress;
  const closed = p.status === "completed";
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
    <div className="min-w-0" aria-busy={r.busy}>
      <Link href="/grading" className="studio-text-button mb-6">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Все проверки
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="studio-eyebrow mb-3">Проверка работ</p>
          <h1 className="studio-title">Решения учителя</h1>
          <p className="mt-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">
            {p.title}
          </p>
        </div>
        {closed && (
          <span className="studio-status mt-1">
            <Check className="size-3.5" aria-hidden="true" />
            Проверка завершена
          </span>
        )}
      </div>
      <div className="mt-7 border-t pt-5">
        <GradingSteps current={3} batchId={p.id} />
      </div>
      <section aria-label="Прогресс проверки" className="mt-7">
        <div className="flex flex-wrap gap-x-9 gap-y-4">
          <div className="flex items-baseline gap-2.5">
            <span className="text-2xl font-bold tabular-nums">
              {p.needsReview}
            </span>
            <span className="text-xs text-muted-foreground">нужны решения</span>
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-2xl font-bold tabular-nums">
              {p.teacherReviewed}
            </span>
            <span className="text-xs text-muted-foreground">
              проверено учителем
            </span>
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-2xl font-bold tabular-nums">
              {p.answers - p.needsReview}
              <span className="ml-1 text-base font-normal text-muted-foreground">
                / {p.answers}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              ответов готово
            </span>
          </div>
        </div>
        <div className="studio-progress mt-4">
          <Progress
            aria-label="Готовность ответов"
            value={p.answers - p.needsReview}
            max={Math.max(1, p.answers)}
          />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1" aria-label="Режим очереди">
            <button
              type="button"
              aria-pressed={!r.all}
              disabled={r.busy}
              className="studio-tab"
              onClick={() => void r.load(false, 0)}
            >
              Нужна проверка
              <span className="ml-2 text-xs tabular-nums opacity-70">
                {p.needsReview}
              </span>
            </button>
            <button
              type="button"
              aria-pressed={r.all}
              disabled={r.busy}
              className="studio-tab"
              onClick={() => void r.load(true, 0)}
            >
              Все ответы
              <span className="ml-2 text-xs tabular-nums opacity-70">
                {p.answers}
              </span>
            </button>
          </div>
          <button
            type="button"
            disabled={r.busy}
            className="studio-text-button"
            onClick={() => void r.load()}
          >
            <RefreshCw
              className={"size-3.5 " + (r.busy ? "animate-spin" : "")}
              aria-hidden="true"
            />
            Обновить
          </button>
        </div>
      </section>
      {r.error && (
        <p
          role="alert"
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {r.error}
        </p>
      )}
      {r.notice && (
        <p role="status" className="mt-4 text-sm text-primary">
          {r.notice}
        </p>
      )}
      {r.answer ? (
        <>
          <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-xs text-muted-foreground">
              Ответ{" "}
              <span className="font-bold text-foreground tabular-nums">
                {r.data.page * 40 + r.index + 1}
              </span>{" "}
              из {r.data.count}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Предыдущий ответ"
                className={secondaryButtonClass}
                disabled={r.busy || (r.index === 0 && r.data.page === 0)}
                onClick={() => r.navigate(-1)}
              >
                <ArrowLeft className="size-3.5" aria-hidden="true" />
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
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
          <ReviewAnswerCard
            key={r.answer.id + ":" + r.answer.revision}
            batchId={p.id}
            answer={r.answer}
            busy={r.busy}
            closed={closed}
            onSave={r.save}
          />
          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
            <span>← / → следующий ответ</span>
            {closed ? (
              <span className="flex items-center gap-1.5">
                <LockKeyhole className="size-3" aria-hidden="true" />
                Режим просмотра
              </span>
            ) : (
              <span>
                Enter — подтвердить оценку · во время ввода сочетания отключены
              </span>
            )}
          </p>
        </>
      ) : (
        <div className="mt-6 rounded-lg border bg-card px-6 py-12 text-center sm:py-16">
          <CheckCircle2
            className="mx-auto mb-4 size-8 text-primary"
            strokeWidth={1.4}
            aria-hidden="true"
          />
          <h2 className="text-lg font-bold">
            {p.answers === 0
              ? "Пока нет распознанных ответов"
              : "Все сомнительные ответы проверены"}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
            {p.processed < p.submissions.length
              ? "Сначала завершите обработку всех работ."
              : "Откройте «Все ответы», чтобы посмотреть сравнения и решения учителя."}
          </p>
        </div>
      )}
      <div className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t pt-5">
        <Link
          href={"/grading/" + p.id + "/process"}
          className="studio-text-button"
        >
          Прогресс обработки
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
        {closed ? (
          <Link
            className={secondaryButtonClass}
            href={"/grading/" + p.id + "/results"}
          >
            Итоговые результаты
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <Button
            disabled={r.busy || !canFinalize}
            onClick={() => void r.finalize()}
          >
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Завершить проверку
          </Button>
        )}
      </div>
      {!closed && !canFinalize && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Завершение доступно после обработки всех работ и проверки сомнительных
          ответов.
        </p>
      )}
    </div>
  );
}
