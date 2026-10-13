"use client";
import { useState } from "react";
import { Check, Eye, PenLine, ImageOff } from "lucide-react";
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
  needs_review: "Нужна проверка",
  auto_accepted: "Автоматическое сравнение",
  teacher_confirmed: "Подтверждено учителем",
  teacher_changed: "Изменено учителем",
};
export function ReviewAnswerCard({
  batchId,
  answer,
  busy,
  closed,
  onSave,
}: {
  batchId: string;
  answer: ReviewAnswer;
  busy: boolean;
  closed: boolean;
  onSave: (
    command: "confirm" | "score" | "unreadable",
    score?: number,
  ) => Promise<void>;
}) {
  const [full, setFull] = useState(!answer.crop),
    [score, setScore] = useState(
      String(answer.finalScore ?? answer.proposedScore),
    );
  const numeric = /^\d+(?:[.,]\d{1,4})?$/u.test(score)
    ? Number(score.replace(",", "."))
    : NaN;
  const valid =
    Number.isFinite(numeric) &&
    numeric >= 0 &&
    numeric <= answer.question.max_score;
  const original = `/grading/${batchId}/pages/${answer.pageId}`,
    src = full ? original : `/grading/${batchId}/answers/${answer.id}/crop`;
  return (
    <section
      aria-labelledby="review-card-title"
      className="overflow-hidden rounded-2xl border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5">
        <div>
          <h2
            id="review-card-title"
            className="break-words text-lg font-semibold"
          >
            Работа № {answer.submissionNumber}
            {answer.studentName ? ` · ${answer.studentName}` : ""}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Задание {answer.questionNumber} ·{" "}
            {labels[answer.status] ?? answer.status}
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
          {confidenceLabel(answer.confidence)} ·{" "}
          {Math.round(answer.confidence * 100)}%
        </span>
      </div>
      <div className="grid min-w-0 lg:grid-cols-2">
        <div className="min-w-0 space-y-3 border-b bg-secondary/30 p-4 lg:border-r lg:border-b-0 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">
              {full ? "Оригинал работы" : "Область ответа, выделенная AI"}
            </h3>
            {answer.crop && (
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => setFull(!full)}
              >
                <Eye className="size-4" />
                {full ? "Область ответа" : "Вся страница"}
              </button>
            )}
          </div>
          <div className="flex min-h-56 max-h-[36rem] justify-center overflow-auto rounded-xl border bg-background">
            <PagePreview
              key={src}
              src={src}
              label={`Оригинал работы № ${answer.submissionNumber}, задание ${answer.questionNumber}`}
            />
          </div>
          <a
            href={original}
            className="text-sm text-primary underline"
            target="_blank"
            rel="noreferrer"
          >
            Открыть оригинал в новой вкладке
          </a>
        </div>
        <div className="min-w-0 space-y-5 p-4 sm:p-5">
          <div>
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Задание
            </h3>
            <p className="mt-2 whitespace-pre-wrap break-words">
              {answer.question.prompt}
            </p>
          </div>
          <div className="rounded-xl border bg-secondary/40 p-4">
            <h3 className="text-sm font-semibold">Распознанный ответ</h3>
            <p className="mt-2 whitespace-pre-wrap break-words">
              {recognizedChoiceText(
                answer.question,
                answer.choiceIds,
                answer.text,
              )}
            </p>
            {answer.teacherUnreadable && (
              <p className="mt-2 text-sm text-destructive">
                Учитель отметил ответ как нечитаемый.
              </p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold">
              Ожидаемый ответ / критерии
            </h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">
              {expectedAnswerText(answer.question)}
            </p>
          </div>
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <h3 className="text-sm font-semibold">
              Предложено {answer.proposedScore} из {answer.question.max_score}
            </h3>
            <p className="mt-2 break-words text-sm">{answer.explanation}</p>
            {answer.flags.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {answer.flags.map((flag) => (
                  <li
                    key={flag}
                    className="rounded-md border bg-background px-2 py-1 text-xs"
                  >
                    {gradingFlagLabels[
                      flag as keyof typeof gradingFlagLabels
                    ] ?? flag}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {closed ? (
            <p className="rounded-xl bg-secondary p-4 font-medium">
              Итоговый балл: {answer.finalScore} / {answer.question.max_score}
            </p>
          ) : (
            <fieldset disabled={busy} className="space-y-3">
              <legend className="mb-3 font-semibold">Решение учителя</legend>
              <Button className="w-full" onClick={() => void onSave("confirm")}>
                <Check className="size-4" />
                Подтвердить оценку: {answer.proposedScore}
              </Button>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor="teacher-score" className="text-sm">
                    Назначить балл от 0 до {answer.question.max_score}
                  </label>
                  <Input
                    id="teacher-score"
                    inputMode="decimal"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
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
                  <PenLine className="size-4" />
                  Сохранить балл
                </button>
              </div>
              {!valid && (
                <p id="score-error" className="text-sm text-destructive">
                  Укажите число от 0 до {answer.question.max_score}, до четырёх
                  знаков после запятой.
                </p>
              )}
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => void onSave("unreadable")}
              >
                <ImageOff className="size-4" />
                Нечитаемо · 0 баллов
              </button>
              <p className="text-xs text-muted-foreground">
                Решение сохраняется сразу. Отметка «Нечитаемо» назначает 0
                баллов; до завершения проверки это можно изменить в режиме «Все
                ответы».
              </p>
            </fieldset>
          )}
        </div>
      </div>
    </section>
  );
}
