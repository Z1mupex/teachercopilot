"use client";
import { useState } from "react";
import {
  Check,
  Eye,
  ExternalLink,
  PenLine,
  ImageOff,
  LockKeyhole,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PagePreview } from "@/components/grading/page-preview";
import { secondaryButtonClass } from "@/components/worksheets/labels";
import { confidenceLabel, gradingFlagLabels } from "@/lib/grading/policy";
import {
  expectedAnswerText,
  recognizedChoiceText,
} from "@/lib/grading/review-display";
import type { ReviewAnswer } from "@/types/grading-workflow";

const labels: Record<string, string> = {
  needs_review: "Нужно решение",
  auto_accepted: "Сравнено с эталоном",
  teacher_confirmed: "Подтверждено учителем",
  teacher_changed: "Изменено учителем",
};

export function ReviewAnswerCard({
  batchId,
  answer,
  busy,
  closed,
  preview = false,
  hideOriginal = false,
  onSave,
}: {
  batchId: string;
  answer: ReviewAnswer;
  busy: boolean;
  closed: boolean;
  preview?: boolean;
  hideOriginal?: boolean;
  onSave: (
    command: "confirm" | "score" | "unreadable",
    score?: number,
  ) => Promise<void>;
}) {
  const [full, setFull] = useState(!answer.crop);
  const [score, setScore] = useState(
    String(answer.finalScore ?? answer.proposedScore ?? ""),
  );
  const numeric = /^\d+(?:[.,]\d{1,4})?$/u.test(score)
    ? Number(score.replace(",", "."))
    : NaN;
  const valid =
    Number.isFinite(numeric) &&
    numeric >= 0 &&
    numeric <= answer.question.max_score;
  const original = "/grading/" + batchId + "/pages/" + answer.pageId;
  const src = full
    ? original
    : "/grading/" + batchId + "/answers/" + answer.id + "/crop";

  return (
    <section aria-labelledby="review-card-title" className="studio-review-card">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="studio-eyebrow mb-1.5">
            Работа {String(answer.submissionNumber).padStart(2, "0")} · Задание{" "}
            {String(answer.questionNumber).padStart(2, "0")}
          </p>
          <h2
            id="review-card-title"
            className="text-base font-bold [overflow-wrap:anywhere]"
          >
            {answer.studentName ?? "Работа № " + answer.submissionNumber}
          </h2>
        </div>
        <span
          className={
            "studio-status " +
            (answer.status === "needs_review" ? "studio-status-warning" : "")
          }
        >
          <span
            className="size-1.5 rounded-full bg-current"
            aria-hidden="true"
          />
          {answer.status === "auto_accepted" &&
          answer.flags.includes("ai_judgment")
            ? "Принято по порогу уверенности"
            : (labels[answer.status] ?? answer.status)}
        </span>
      </header>
      <div
        className={
          hideOriginal ? "min-w-0" : "grid min-w-0 lg:grid-cols-[1.04fr_1fr]"
        }
      >
        {!hideOriginal && (
          <div className="min-w-0 border-b lg:border-r lg:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
              <h3 className="text-xs font-bold">
                {full ? "Оригинал работы" : "Область ответа, выделенная AI"}
              </h3>
              {answer.crop && (
                <button
                  type="button"
                  className="studio-text-button"
                  onClick={() => setFull(!full)}
                >
                  <Eye className="size-3.5" aria-hidden="true" />
                  {full ? "Область ответа" : "Вся страница"}
                </button>
              )}
            </div>
            <div className="studio-paper-view">
              <PagePreview
                key={src}
                src={src}
                label={
                  "Оригинал работы № " +
                  answer.submissionNumber +
                  ", задание " +
                  answer.questionNumber
                }
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
              <span className="text-xs text-muted-foreground">
                {full ? "Полная страница" : "Фрагмент оригинала"}
              </span>
              <a
                href={original}
                className="studio-text-button"
                target="_blank"
                rel="noreferrer"
              >
                Открыть оригинал
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        )}
        <div className="studio-review-details min-w-0 px-5 py-6 sm:px-7">
          <div className="border-b pb-5">
            <h3 className="studio-eyebrow">Задание</h3>
            <p className="mt-3 whitespace-pre-wrap text-base leading-7 [overflow-wrap:anywhere]">
              {answer.question.prompt}
            </p>
          </div>
          <div className="studio-comparison py-6">
            <div className="min-w-0">
              <h3 className="studio-eyebrow">Распознанный ответ</h3>
              <p className="mt-3 whitespace-pre-wrap text-xl leading-8 [overflow-wrap:anywhere]">
                {recognizedChoiceText(
                  answer.question,
                  answer.choiceIds,
                  answer.text,
                )}
              </p>
              {answer.teacherUnreadable && (
                <p className="mt-2 text-xs text-destructive">
                  Учитель отметил ответ как нечитаемый.
                </p>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="studio-eyebrow">Ожидаемый ответ / критерии</h3>
              <p className="mt-3 whitespace-pre-wrap text-base leading-7 text-secondary-foreground [overflow-wrap:anywhere]">
                {expectedAnswerText(answer.question)}
              </p>
            </div>
          </div>
          <div className="studio-assessment">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold">Предварительная оценка</h3>
                <p className="mt-1 text-2xl font-bold tabular-nums">
                  {answer.proposedScore ?? "—"}
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    / {answer.question.max_score}
                  </span>
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>
                  {answer.flags.includes("ai_judgment")
                    ? "Уверенность ИИ"
                    : "Уверенность распознавания"}
                </p>
                <p className="mt-1 font-bold text-foreground">
                  {confidenceLabel(answer.confidence)} ·{" "}
                  {Math.round(answer.confidence * 100)}%
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 [overflow-wrap:anywhere]">
              {answer.explanation}
            </p>
            {answer.flags.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
                {answer.flags.map((flag) => (
                  <li key={flag} className="flex items-center gap-1.5">
                    <span
                      className="size-1 rounded-full bg-current"
                      aria-hidden="true"
                    />
                    {gradingFlagLabels[
                      flag as keyof typeof gradingFlagLabels
                    ] ?? flag}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {closed ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t pt-5">
              <div>
                <p className="studio-eyebrow">Итоговый балл</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">
                  {answer.finalScore ?? "—"}
                  <span className="ml-2 text-base font-normal text-muted-foreground">
                    / {answer.question.max_score}
                  </span>
                </p>
              </div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <LockKeyhole className="size-3.5" aria-hidden="true" />
                Проверка завершена
              </p>
            </div>
          ) : (
            <fieldset disabled={busy} className="mt-6 border-t pt-5">
              <legend className="sr-only">Решение учителя</legend>
              <p className="mb-4 text-sm font-bold">Решение учителя</p>
              <Button
                className="w-full"
                disabled={answer.proposedScore === null}
                onClick={() => void onSave("confirm")}
              >
                <Check className="size-4" aria-hidden="true" />
                Подтвердить оценку · {answer.proposedScore ?? "—"}
              </Button>
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="teacher-score"
                    className="mb-2 block text-xs text-muted-foreground"
                  >
                    Свой балл · от 0 до {answer.question.max_score}
                  </label>
                  <Input
                    id="teacher-score"
                    inputMode="decimal"
                    value={score}
                    onChange={(event) => setScore(event.target.value)}
                    aria-invalid={!valid}
                    aria-describedby={!valid ? "score-error" : undefined}
                  />
                </div>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={!valid}
                  onClick={() => void onSave("score", numeric)}
                >
                  <PenLine className="size-3.5" aria-hidden="true" />
                  Сохранить
                </button>
              </div>
              {!valid && (
                <p id="score-error" className="mt-2 text-sm text-destructive">
                  Укажите число от 0 до {answer.question.max_score}, до четырёх
                  знаков после запятой.
                </p>
              )}
              <button
                type="button"
                className="studio-text-button mt-4"
                onClick={() => void onSave("unreadable")}
              >
                <ImageOff className="size-3.5" aria-hidden="true" />
                Нечитаемо · 0 баллов
              </button>
              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                {preview
                  ? "В режиме примерки решения остаются только на этом экране."
                  : hideOriginal
                    ? "Решение сохраняется сразу. До завершения проверки можно снова открыть задание и изменить балл."
                    : "Решение сохраняется сразу. До завершения проверки его можно изменить в режиме «Все ответы»."}
              </p>
            </fieldset>
          )}
        </div>
      </div>
    </section>
  );
}
