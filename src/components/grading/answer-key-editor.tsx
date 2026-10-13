"use client";
import { useEffect } from "react";
import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  FileText,
  Pencil,
  Plus,
  Save,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuestionEditor } from "@/components/worksheets/question-editor";
import {
  questionTypeLabels,
  questionTypes,
  secondaryButtonClass,
  selectClass,
} from "@/components/worksheets/labels";
import {
  reviewFieldLabels,
  type AnswerKeyDetail,
} from "@/lib/grading/answer-key-validation";
import { useAnswerKey } from "@/components/grading/use-answer-key";
import type { QuestionType } from "@/types/worksheets";
import { GradingSteps } from "@/components/grading/grading-steps";

export function AnswerKeyEditor({
  batchId,
  initial,
  aiConfigured,
}: {
  batchId: string;
  initial: AnswerKeyDetail;
  aiConfigured: boolean;
}) {
  const key = useAnswerKey(batchId, initial);
  useEffect(() => {
    if (key.validationTarget)
      document.getElementById(key.validationTarget.targetId)?.focus();
  }, [key.validationTarget]);
  return (
    <div className="min-w-0 space-y-6" aria-busy={key.busy}>
      <GradingSteps current={1} batchId={batchId} />
      {!initial.editable && (
        <p className="rounded-xl border bg-secondary p-4 text-sm">
          Вы можете просмотреть ответы во всех вариантах. Редактирование
          доступно после завершения загрузки и до начала обработки работ.{" "}
          <Link href={`/grading/${batchId}`} className="text-primary underline">
            Вернуться к работам
          </Link>
        </p>
      )}
      {key.saved.confirmedAt && !key.dirty && (
        <p
          role="status"
          className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300"
        >
          <CheckCircle2 className="size-5 shrink-0" />
          <span>
            Ответы подтверждены. Изменения потребуют нового подтверждения.{" "}
            <Link href={`/grading/${batchId}/process`} className="underline">
              Перейти к распознаванию работ
            </Link>
          </span>
        </p>
      )}
      {key.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {key.error}
        </p>
      )}
      {key.notice && (
        <p role="status" className="rounded-xl border bg-primary/5 p-4 text-sm">
          {key.notice}
        </p>
      )}
      {key.removedQuestion && (
        <div
          role="status"
          className="sticky top-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm shadow-md"
        >
          <p>
            Задание {key.removedQuestion.position + 1} удалено из черновика.
          </p>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={key.busy || !initial.editable}
            onClick={key.undoRemoveQuestion}
          >
            Вернуть задание
          </button>
        </div>
      )}
      <div className="min-w-0 space-y-6">
        <fieldset
          disabled={key.busy || !initial.editable}
          className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5"
        >
          <legend className="sr-only">Способ добавления ответов</legend>
          <h2 className="text-lg font-semibold">Ответы и критерии</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Введите ключ вручную или распознайте документ с ответами учителя.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(
              [
                {
                  id: "manual",
                  title: "Ввести вручную",
                  detail: "Ответы, баллы и критерии",
                  icon: Pencil,
                },
                {
                  id: "photo",
                  title: "Фото ответов",
                  detail: "JPG или PNG листа с ответами",
                  icon: Camera,
                },
                {
                  id: "file",
                  title: "Файл с ответами",
                  detail: "PDF, JPG или PNG",
                  icon: FileText,
                },
                {
                  id: "solved_teacher",
                  title: "Решённая работа учителя",
                  detail: "Фото или PDF с решениями",
                  icon: CheckCircle2,
                },
              ] as const
            ).map(({ id, title, detail, icon: Icon }) => (
              <button
                type="button"
                key={id}
                aria-pressed={key.source === id}
                onClick={() => {
                  key.setSource(id);
                  key.setFiles([]);
                }}
                className={`flex min-w-0 gap-3 rounded-xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${key.source === id ? "border-primary bg-primary/5" : "hover:bg-secondary"}`}
              >
                <Icon className="mt-1 size-6 shrink-0 text-primary" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{title}</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {detail}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {key.source !== "manual" && (
            <div className="mt-5 space-y-3 rounded-xl border border-dashed p-5">
              <p className="text-sm text-muted-foreground">
                До 3 страниц за один запрос, до 30 МБ на исходный файл. PDF
                преобразуется в изображения в браузере. После распознавания
                результат заменит ответы в редакторе; сохранённый ключ обновится
                только по вашей команде.
              </p>
              {!aiConfigured && (
                <p className="text-sm text-muted-foreground">
                  AI пока не подключён. Ответы можно ввести вручную.
                </p>
              )}
              <input
                type="file"
                aria-label="Документ с ответами учителя"
                accept={
                  key.source === "photo"
                    ? "image/jpeg,image/png"
                    : "image/jpeg,image/png,application/pdf"
                }
                multiple
                disabled={!aiConfigured}
                onChange={(event) =>
                  key.setFiles(Array.from(event.target.files ?? []))
                }
                className="block w-full text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-secondary file:px-4 file:py-3 file:text-foreground"
              />
              {key.files.length > 0 && (
                <p className="min-w-0 [overflow-wrap:anywhere] text-xs text-muted-foreground">
                  {key.files.map((file) => file.name).join(", ")}
                </p>
              )}
              <Button
                disabled={!aiConfigured || key.files.length === 0}
                onClick={() => void key.recognize()}
              >
                <Sparkles className="size-4" />
                Распознать ответы
              </Button>
            </div>
          )}
        </fieldset>
        <section className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">
                {["photo", "file", "solved_teacher"].includes(key.value.source)
                  ? "Мы распознали ответы так"
                  : "Ключ ответов"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Заданий: {key.total} · Вариантов: {key.groups.length}. Номер
                задания соответствует его позиции.
              </p>
            </div>
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={key.addVariant}
              disabled={
                key.busy || !initial.editable || key.groups.length >= 10
              }
            >
              <Plus className="size-4" />
              Добавить вариант работы
            </button>
          </div>
          {key.value.source === "worksheet" && (
            <p className="text-sm text-muted-foreground">
              Задания и ключи заполнены из выбранной работы. Изменения
              сохраняются только для этой проверки.
            </p>
          )}
          <div
            id="answer-key-variants"
            tabIndex={-1}
            className="flex min-w-0 flex-wrap gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Варианты ключа"
          >
            {key.groups.map((group, index) => (
              <button
                type="button"
                key={group.id}
                onClick={() => key.setActive(index)}
                aria-pressed={key.active === index}
                disabled={key.busy}
                className={`${secondaryButtonClass} min-w-0 max-w-full [overflow-wrap:anywhere] text-left ${key.active === index ? "border-primary bg-primary/5 text-primary" : ""}`}
              >
                {group.label}
              </button>
            ))}
          </div>
          {key.validationIssues.map(
            (issue, index) =>
              !issue.questionId && (
                <p
                  key={index}
                  id={`answer-key-issue-${index}`}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {issue.message}
                </p>
              ),
          )}
          <fieldset
            disabled={key.busy || !initial.editable}
            className="min-w-0 space-y-4"
          >
            <legend className="sr-only">Задания выбранного варианта</legend>
            {key.active > 0 && (
              <div className="flex flex-wrap gap-3">
                <Input
                  id={`answer-key-variant-${key.group.id}`}
                  aria-label="Название варианта"
                  aria-invalid={
                    key.validationIssues.some(
                      (issue) =>
                        issue.targetId === `answer-key-variant-${key.group.id}`,
                    ) || undefined
                  }
                  aria-describedby={
                    key.validationIssues
                      .flatMap((issue, index) =>
                        issue.targetId === `answer-key-variant-${key.group.id}`
                          ? [`answer-key-issue-${index}`]
                          : [],
                      )
                      .join(" ") || undefined
                  }
                  value={key.group.label}
                  maxLength={80}
                  onChange={(event) =>
                    key.edit({
                      ...key.value,
                      document: {
                        ...key.value.document,
                        variants: (key.value.document.variants ?? []).map(
                          (v, index) =>
                            index === key.active - 1
                              ? { ...v, label: event.target.value }
                              : v,
                        ),
                      },
                    })
                  }
                />
                <button
                  type="button"
                  onClick={key.removeVariant}
                  className={secondaryButtonClass}
                >
                  Удалить этот вариант
                </button>
              </div>
            )}
            {key.group.questions.length === 0 && (
              <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Добавьте первое задание и правильный ответ.
              </p>
            )}
            {key.group.questions.map((question, index) => {
              const mark = key.value.review.find(
                (r) => r.question_id === question.id,
              );
              return (
                <div key={question.id} className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
                    <label className="text-xs text-muted-foreground">
                      Номер / порядок
                      <Input
                        className="mt-1 block w-24"
                        type="number"
                        min={1}
                        max={key.group.questions.length}
                        value={index + 1}
                        aria-label={`Номер задания ${index + 1}`}
                        onChange={(event) =>
                          key.move(index, event.target.valueAsNumber - 1)
                        }
                      />
                    </label>
                    <label className="min-w-0 basis-40 flex-1 text-xs text-muted-foreground">
                      Тип задания
                      <select
                        value={question.type}
                        aria-label={`Тип задания ${index + 1}`}
                        className={`${selectClass} mt-1`}
                        onChange={(event) =>
                          key.changeType(
                            question,
                            event.target.value as QuestionType,
                          )
                        }
                      >
                        {questionTypes.map((type) => (
                          <option key={type} value={type}>
                            {questionTypeLabels[type]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {mark && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-200">
                      <p className="flex items-start gap-2">
                        <AlertTriangle className="size-4 shrink-0" />
                        Проверьте:{" "}
                        {mark.fields
                          .map((field) => reviewFieldLabels[field])
                          .join(", ")}
                        .
                      </p>
                      <label className="mt-3 flex items-center gap-3">
                        <input
                          id={`question-${question.id}-review`}
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={mark.reviewed}
                          onChange={(event) =>
                            key.edit({
                              ...key.value,
                              review: key.value.review.map((r) =>
                                r.question_id === question.id
                                  ? { ...r, reviewed: event.target.checked }
                                  : r,
                              ),
                            })
                          }
                        />
                        Проверил сомнительные поля задания {index + 1}
                      </label>
                    </div>
                  )}
                  <QuestionEditor
                    question={question}
                    index={index}
                    count={key.group.questions.length}
                    disabled={key.busy || !initial.editable}
                    errors={key.validationIssues.filter(
                      (issue) => issue.questionId === question.id,
                    )}
                    onChange={key.changeQuestion}
                    onRemove={() => key.removeQuestion(question)}
                    onDuplicate={() => key.duplicate(question)}
                    onMove={(offset) => key.move(index, index + offset)}
                  />
                </div>
              );
            })}
            <div className="flex flex-wrap gap-3">
              <select
                aria-label="Тип нового задания"
                value={key.newType}
                className={`${selectClass} max-w-xs`}
                onChange={(event) =>
                  key.setNewType(event.target.value as QuestionType)
                }
              >
                {questionTypes.map((type) => (
                  <option key={type} value={type}>
                    {questionTypeLabels[type]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={key.addQuestion}
                disabled={key.total >= 300 || key.group.questions.length >= 100}
              >
                <Plus className="size-4" />
                Добавить задание
              </button>
            </div>
          </fieldset>
        </section>
        <fieldset
          disabled={key.busy || !initial.editable}
          className="min-w-0 space-y-4 rounded-2xl border bg-card p-4 sm:p-5"
        >
          <legend className="sr-only">Сохранение и подтверждение ключа</legend>
          <p className="text-sm text-muted-foreground">
            Черновик сохраняет правки. Подтверждение разрешает использовать ключ
            на следующих этапах проверки. Сомнительных заданий без отметки:{" "}
            {key.unreviewed}.
          </p>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-5 shrink-0 accent-primary"
              checked={key.checked}
              onChange={(event) => key.setChecked(event.target.checked)}
            />
            Я проверил все ответы, типы заданий, варианты и максимальные баллы.
          </label>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => void key.commit(false)}
            >
              <Save className="size-4" />
              Сохранить черновик
            </button>
            <Button
              disabled={!key.checked || key.unreviewed > 0 || key.total === 0}
              onClick={() => void key.commit(true)}
            >
              <CheckCircle2 className="size-4" />
              Подтвердить ответы и баллы
            </Button>
          </div>
        </fieldset>
      </div>
    </div>
  );
}
