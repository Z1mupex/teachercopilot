"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  RefreshCw,
  CircleAlert,
  LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PagePreview } from "@/components/grading/page-preview";
import { ReviewAnswerCard } from "@/components/grading/review-answer-card";
import { GradingSteps } from "@/components/grading/grading-steps";
import { AutonomySummary } from "@/components/grading/autonomy-editor";
import { useWorkReview } from "@/components/grading/use-work-review";
import { canBulkConfirm } from "@/lib/grading/autonomy";
import { recognizedChoiceText } from "@/lib/grading/review-display";
import { gradingFlagLabels } from "@/lib/grading/policy";
import {
  secondaryButtonClass,
  selectClass,
} from "@/components/worksheets/labels";
import { cn } from "@/lib/utils";
import type { WorkReview, ReviewAnswer } from "@/types/grading-workflow";

function decisionLabel(answer: ReviewAnswer) {
  if (answer.status === "teacher_changed") return "Учитель изменил";
  if (answer.status === "teacher_confirmed") return "Учитель подтвердил";
  if (answer.status === "auto_accepted")
    return answer.flags.includes("ai_judgment")
      ? "Принято ИИ"
      : "Сопоставлено с эталоном";
  return "Нужно решение";
}

export function WorkReviewScreen({ initial }: { initial: WorkReview }) {
  const r = useWorkReview(initial),
    d = r.data,
    p = d.progress,
    s = d.submission;
  const [selectedIds, setSelectedIds] = useState<string[]>([]),
    [detailId, setDetailId] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    answers: { id: string; revision: string }[];
    whole: boolean;
  } | null>(null);
  const detail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (detailId) detail.current?.focus();
  }, [detailId]);
  const closed = p.status === "completed",
    blocked = r.busy || !!pending;
  const candidates = d.answers.filter(canBulkConfirm);
  const selected = d.answers.find((a) => a.id === detailId);
  const paperIndex = p.submissions.findIndex((a) => a.id === s?.id);
  const needs = d.answers.filter((a) => a.status === "needs_review");
  const canFinalize =
    p.submissions.length > 0 &&
    p.processed === p.submissions.length &&
    p.needsReview === 0 &&
    p.answers > 0;
  const proposed =
    d.answers.length && d.answers.every((a) => a.proposedScore !== null)
      ? d.answers.reduce((sum, a) => sum + a.proposedScore!, 0)
      : null;
  const confirmed = d.answers
    .filter((a) => a.finalScore !== null)
    .reduce((sum, a) => sum + a.finalScore!, 0);
  async function choosePaper(id: string, focusIssue = false) {
    if (blocked) return;
    setSelectedIds([]);
    setDetailId(null);
    const result = await r.load(id);
    if (focusIssue && result)
      setDetailId(
        result.answers.find((a) => a.status === "needs_review")?.id ?? null,
      );
  }
  async function nextIssue() {
    if (blocked) return;
    const index = d.answers.findIndex((a) => a.id === detailId);
    const answer = d.answers
      .slice(index + 1)
      .find((a) => a.status === "needs_review");
    if (answer) {
      setDetailId(answer.id);
      return;
    }
    const ordered = [
      ...p.submissions.slice(paperIndex + 1),
      ...p.submissions.slice(0, paperIndex),
    ];
    const other = ordered.find((a) => a.status === "needs_review");
    if (other) await choosePaper(other.id, true);
    else if (needs[0]) setDetailId(needs[0].id);
  }
  function requestBulk(whole: boolean) {
    const list = whole
      ? candidates
      : candidates.filter((a) => selectedIds.includes(a.id));
    if (!list.length || blocked || closed) return;
    setPending({
      answers: list.map((a) => ({ id: a.id, revision: a.revision })),
      whole,
    });
  }
  async function applyBulk() {
    if (!pending) return;
    const command = pending;
    setPending(null);
    setSelectedIds([]);
    await r.confirmMany(command.answers, command.whole);
  }
  const number = (value: number | null) =>
    value === null
      ? "—"
      : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 4 }).format(
          value,
        );
  return (
    <div className="min-w-0 space-y-4" aria-busy={r.busy}>
      <Link href="/grading" className="studio-text-button">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Все проверки
      </Link>
      <header className="space-y-2">
        <h1 className="studio-title">Проверить работы</h1>
        <p className="break-words text-sm text-muted-foreground">{p.title}</p>
      </header>
      <GradingSteps current={3} batchId={p.id} />
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border bg-card p-4 sm:p-5">
        {p.autonomy.config ? (
          <AutonomySummary
            rules={p.autonomy.config}
            frozen={p.autonomy.frozen}
          />
        ) : (
          <p className="text-sm">
            Режим выбирается перед запуском распознавания.
          </p>
        )}
        <p className="shrink-0 text-sm">
          <strong className="tabular-nums">{p.needsReview}</strong> ответов
          требуют решения
        </p>
      </div>
      {r.error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 p-4 text-sm text-destructive"
        >
          {r.error}
        </p>
      )}
      {r.notice && (
        <p role="status" className="text-sm text-primary">
          {r.notice}
        </p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="min-w-0 flex-1 space-y-2 text-sm">
          <span>Работа ученика</span>
          <select
            className={selectClass}
            value={s?.id ?? ""}
            disabled={blocked}
            onChange={(e) => void choosePaper(e.target.value)}
          >
            {p.submissions.map((item) => (
              <option key={item.id} value={item.id}>
                № {item.number}
                {item.studentName ? ` · ${item.studentName}` : ""}
                {item.status === "needs_review" ? " · Нужно решение" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={blocked || paperIndex <= 0}
            onClick={() => void choosePaper(p.submissions[paperIndex - 1].id)}
            aria-label="Предыдущая работа"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Назад
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={
              blocked ||
              paperIndex < 0 ||
              paperIndex >= p.submissions.length - 1
            }
            onClick={() => void choosePaper(p.submissions[paperIndex + 1].id)}
          >
            Следующая работа
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={blocked || !s}
            onClick={() => {
              setSelectedIds([]);
              void r.load();
            }}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Обновить
          </button>
        </div>
      </div>
      {s && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5">
            <h2 className="text-xl font-semibold">
              {s.studentName ?? `Работа № ${s.number}`}
            </h2>
            <div className="flex flex-wrap gap-5 text-sm tabular-nums">
              <span>
                Предложено:{" "}
                <strong>
                  {number(proposed)} / {number(d.maximum)}
                </strong>
              </span>
              <span>
                {closed ? "Итог" : "Подтверждено"}:{" "}
                <strong>
                  {number(d.answers.length ? confirmed : null)} /{" "}
                  {number(d.maximum)}
                </strong>
              </span>
            </div>
          </div>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <section
              aria-label="Оригинал работы"
              className="min-w-0 overflow-hidden rounded-lg border bg-card xl:sticky xl:top-5"
            >
              <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                <h3 className="text-sm font-semibold">Оригинал работы</h3>
                {s.pageId && (
                  <a
                    href={`/grading/${p.id}/pages/${s.pageId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="studio-text-button"
                  >
                    Открыть
                  </a>
                )}
              </div>
              {s.pageId ? (
                <div className="studio-paper-view aspect-[3/4] max-h-[75vh]">
                  <PagePreview
                    key={s.pageId}
                    src={`/grading/${p.id}/pages/${s.pageId}`}
                    label={`Оригинал работы № ${s.number}`}
                  />
                </div>
              ) : (
                <p className="p-5 text-sm text-muted-foreground">
                  Изображение недоступно.
                </p>
              )}
            </section>
            <section
              aria-label="Ответы этой работы"
              className="min-w-0 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  Все задания · {d.answers.length}
                </h3>
                <button
                  type="button"
                  className="studio-text-button"
                  disabled={blocked || p.needsReview === 0}
                  onClick={() => void nextIssue()}
                >
                  <CircleAlert className="size-4" aria-hidden="true" />
                  Следующий спорный ответ
                </button>
              </div>
              {!closed && d.answers.length > 0 && (
                <div className="space-y-3 rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={
                        blocked ||
                        !candidates.some((a) => selectedIds.includes(a.id))
                      }
                      onClick={() => requestBulk(false)}
                    >
                      Подтвердить выбранные ·{" "}
                      {
                        candidates.filter((a) => selectedIds.includes(a.id))
                          .length
                      }
                    </button>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={blocked || !candidates.length}
                      onClick={() => requestBulk(true)}
                    >
                      Подтвердить предложения работы · {candidates.length}
                    </button>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Решение принимает учитель. Пустые, нечитаемые и
                    неоднозначные ответы в групповое подтверждение не входят.
                    Уже исправленные учителем баллы сохраняются.
                  </p>
                </div>
              )}
              {pending && (
                <div
                  role="group"
                  aria-label="Подтверждение группы ответов"
                  className="space-y-3 rounded-lg border border-primary bg-secondary/40 p-4"
                >
                  <p className="text-sm font-semibold">
                    Подтвердить предложенные баллы? Выбрано ответов:{" "}
                    {pending.answers.length}.
                  </p>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Операция не завершает проверку. Если один из ответов
                    изменён, группа целиком останется без изменений.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void applyBulk()} disabled={r.busy}>
                      <Check className="size-4" aria-hidden="true" />
                      Подтвердить · {pending.answers.length}
                    </Button>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      disabled={r.busy}
                      onClick={() => setPending(null)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
              {d.answers.length === 0 ? (
                <div className="rounded-lg border bg-card p-6">
                  <p className="text-sm">
                    {s.status === "processing"
                      ? "Работа обрабатывается. Обновите экран после завершения."
                      : "Для этой работы ещё нет результатов распознавания."}
                  </p>
                  {s.error && (
                    <p className="mt-2 text-sm text-destructive">{s.error}</p>
                  )}
                  <Link
                    href={`/grading/${p.id}/process`}
                    className="mt-3 inline-block text-sm text-primary underline"
                  >
                    Перейти к обработке
                  </Link>
                </div>
              ) : (
                <ol className="divide-y overflow-hidden rounded-lg border bg-card">
                  {d.answers.map((answer) => {
                    const eligible = !closed && canBulkConfirm(answer);
                    return (
                      <li
                        key={answer.id}
                        className={cn(
                          "p-4",
                          answer.id === detailId && "bg-secondary/40",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {!closed && (
                            <input
                              type="checkbox"
                              aria-label={`Выбрать задание ${answer.questionNumber}`}
                              checked={selectedIds.includes(answer.id)}
                              disabled={blocked || !eligible}
                              onChange={(e) =>
                                setSelectedIds((ids) =>
                                  e.target.checked
                                    ? [...ids, answer.id]
                                    : ids.filter((id) => id !== answer.id),
                                )
                              }
                              className="mt-1 size-4 shrink-0 accent-primary"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <button
                                type="button"
                                className="min-h-8 text-left text-sm font-semibold text-primary"
                                disabled={blocked}
                                onClick={() =>
                                  setDetailId(
                                    detailId === answer.id ? null : answer.id,
                                  )
                                }
                              >
                                Задание {answer.questionNumber}
                              </button>
                              <span className="text-xs tabular-nums">
                                {answer.finalScore !== null
                                  ? "Принято"
                                  : "Предложено"}{" "}
                                <strong className="text-sm">
                                  {number(
                                    answer.finalScore ?? answer.proposedScore,
                                  )}{" "}
                                  / {answer.question.max_score}
                                </strong>
                              </span>
                            </div>
                            <p className="line-clamp-2 break-words text-xs leading-5 text-muted-foreground">
                              {answer.question.prompt}
                            </p>
                            <p className="mt-2 line-clamp-3 break-words text-sm">
                              Ответ:{" "}
                              {recognizedChoiceText(
                                answer.question,
                                answer.choiceIds,
                                answer.text,
                              ) || "Отсутствует"}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                              <span
                                className={
                                  answer.status === "needs_review"
                                    ? "font-medium text-destructive"
                                    : "text-muted-foreground"
                                }
                              >
                                {decisionLabel(answer)}
                              </span>
                              <span className="text-muted-foreground">
                                Confidence {Math.round(answer.confidence * 100)}
                                %
                              </span>
                            </div>
                            {answer.status === "needs_review" &&
                              answer.flags.length > 0 && (
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                                  {answer.flags
                                    .map(
                                      (flag) =>
                                        gradingFlagLabels[
                                          flag as keyof typeof gradingFlagLabels
                                        ] ?? "Нужно решение учителя",
                                    )
                                    .join(" · ")}
                                </p>
                              )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              {selected && (
                <div
                  ref={detail}
                  tabIndex={-1}
                  role="region"
                  aria-label={`Подробности задания ${selected.questionNumber}`}
                  className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ReviewAnswerCard
                    key={selected.id + ":" + selected.revision}
                    batchId={p.id}
                    answer={selected}
                    busy={blocked}
                    closed={closed}
                    hideOriginal
                    onSave={async (command, score) => {
                      setSelectedIds([]);
                      await r.save(selected.id, command, score);
                    }}
                  />
                </div>
              )}
            </section>
          </div>
        </>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-4 border-t pt-5">
        <Link href={`/grading/${p.id}/process`} className="studio-text-button">
          Прогресс обработки
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        {closed ? (
          <Link
            href={`/grading/${p.id}/results`}
            className={secondaryButtonClass}
          >
            Итоговые результаты
            <LockKeyhole className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <Button
            disabled={blocked || !canFinalize}
            onClick={() => void r.finalize()}
          >
            Завершить проверку
          </Button>
        )}
      </footer>
      {!closed && !canFinalize && (
        <p className="text-xs leading-5 text-muted-foreground">
          Завершение доступно после обработки всех работ и решения всех
          исключений.
        </p>
      )}
    </div>
  );
}
