"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  Eye,
  FileText,
  Loader2,
  Plus,
  Save,
  Sparkles,
} from "lucide-react";
import { regenerateQuestion } from "@/actions/ai-worksheets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createEmptyQuestion,
  duplicateQuestion,
} from "@/lib/worksheets/domain";
import { worksheetInputSchema } from "@/lib/validation/worksheets";
import type {
  QuestionInput,
  QuestionType,
  WorksheetInput,
  WorksheetMutationResult,
} from "@/types/worksheets";
import {
  questionTypeLabels,
  questionTypes,
  secondaryButtonClass,
  selectClass,
  textAreaClass,
} from "./labels";
import { QuestionEditor } from "./question-editor";
import { QuestionPreview } from "./question-preview";

export type WorksheetEditorProps = {
  initial: WorksheetInput;
  worksheetId?: string;
  updatedAt?: string;
  generated?: boolean;
  aiAvailable: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
};

export function WorksheetQuestionEditor({
  initial,
  worksheetId,
  generated = false,
  aiAvailable,
  onDirtyChange,
  onPendingChange,
  onDocumentChange,
  onSave,
  documentDirty,
}: WorksheetEditorProps & {
  onDocumentChange: (input: WorksheetInput) => void;
  onSave: (input: WorksheetInput) => Promise<WorksheetMutationResult>;
  documentDirty: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);
  const [newType, setNewType] = useState<QuestionType>("multiple_choice");
  const [preview, setPreview] = useState(false);
  const [regeneration, setRegeneration] = useState<{
    index: number;
    question: QuestionInput;
  } | null>(null);
  const [candidate, setCandidate] = useState<QuestionInput | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPending, startAiTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const form = useForm<WorksheetInput>({
    resolver: zodResolver(worksheetInputSchema),
    defaultValues: initial,
  });
  const { fields, append, remove, move, insert } = useFieldArray({
    control: form.control,
    name: "questions",
    keyName: "fieldKey",
  });
  const values = useWatch({ control: form.control }) as WorksheetInput;
  const isDirty =
    !saved && (form.formState.isDirty || generated || documentDirty);
  const anyPending = pending || aiPending;
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const regenerateTrigger = useRef<HTMLElement | null>(null);
  const dirtyRef = useRef(isDirty);

  useEffect(() => onDocumentChange(values), [values, onDocumentChange]);

  useEffect(() => {
    dirtyRef.current = isDirty;
  }, [isDirty]);
  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange]);
  useEffect(() => onPendingChange?.(anyPending), [anyPending, onPendingChange]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) event.preventDefault();
    };
    const beforeNavigation = (event: MouseEvent) => {
      if (
        !dirtyRef.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(target instanceof HTMLAnchorElement) ||
        target.target === "_blank" ||
        target.hasAttribute("download")
      )
        return;
      if (
        target.href === window.location.href ||
        (target.hash && target.pathname === window.location.pathname)
      )
        return;
      if (
        !window.confirm(
          "Есть несохранённые изменения. Уйти со страницы и потерять их?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeNavigation, true);
    };
  }, []);

  const showRegeneration = (index: number, question: QuestionInput) => {
    regenerateTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setRegeneration({ index, question });
    setCandidate(null);
    setAiError(null);
    dialog.current?.showModal();
    cancel.current?.focus();
  };

  const submit = (status: "draft" | "ready") => {
    setError(null);
    setDetails([]);
    form.setValue("status", status);
    void form.handleSubmit(
      (input) => {
        startTransition(async () => {
          try {
            const result = await onSave(input);
            if ("error" in result) {
              setError(result.error);
              setDetails(Object.values(result.fieldErrors ?? {}).flat());
              return;
            }
            dirtyRef.current = false;
            setSaved(true);
            router.push(`/worksheets/${result.id}`);
            router.refresh();
          } catch {
            setError(
              "Не удалось сохранить рабочий лист. Проверьте соединение и попробуйте ещё раз.",
            );
          }
        });
      },
      (errors) => {
        setError("Проверьте поля рабочего листа перед сохранением.");
        const messages: string[] = [];
        const collect = (value: unknown) => {
          if (!value || typeof value !== "object") return;
          const object = value as Record<string, unknown>;
          if (typeof object.message === "string") messages.push(object.message);
          for (const [key, item] of Object.entries(object))
            if (key !== "ref" && key !== "message") collect(item);
        };
        collect(errors);
        setDetails([...new Set(messages)]);
      },
    )();
  };

  return (
    <div className="space-y-6">
      {generated && (
        <div className="flex gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 dark:border-violet-900 dark:bg-violet-950/30">
          <Sparkles
            className="mt-1 size-5 shrink-0 text-violet-600 dark:text-violet-300"
            aria-hidden="true"
          />
          <p>
            <strong>AI предложил черновик.</strong> Проверьте формулировки и
            ответы. Сохранение подтвердит ваш выбор; пока материал не записан в
            библиотеку.
          </p>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit("draft");
        }}
        noValidate
        className="space-y-6"
        aria-busy={anyPending}
      >
        <section
          className="rounded-2xl border bg-card p-4 sm:p-6"
          aria-labelledby="worksheet-details-title"
        >
          <h2
            id="worksheet-details-title"
            className="mb-5 flex items-center gap-2 font-semibold"
          >
            <FileText className="size-5 text-primary" aria-hidden="true" />
            Параметры рабочего листа
          </h2>
          <fieldset disabled={anyPending} className="space-y-5">
            <div>
              <label
                htmlFor="worksheet-title"
                className="mb-2 block text-sm font-medium"
              >
                Название <span className="text-primary">*</span>
              </label>
              <Input
                id="worksheet-title"
                {...form.register("title")}
                maxLength={200}
                placeholder="Например, квадратные уравнения"
                aria-invalid={Boolean(form.formState.errors.title)}
              />
              {form.formState.errors.title && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="worksheet-subject"
                  className="mb-2 block text-sm font-medium"
                >
                  Предмет
                </label>
                <Input
                  id="worksheet-subject"
                  {...form.register("subject", {
                    setValueAs: (value: unknown) =>
                      typeof value === "string" ? value.trim() || null : null,
                  })}
                  maxLength={120}
                  placeholder="Например, алгебра"
                />
              </div>
              <div>
                <label
                  htmlFor="worksheet-grade"
                  className="mb-2 block text-sm font-medium"
                >
                  Параллель
                </label>
                <Input
                  id="worksheet-grade"
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  {...form.register("grade", {
                    setValueAs: (value: unknown) =>
                      value === "" || value === null || value === undefined
                        ? null
                        : Number(value),
                  })}
                  placeholder="От 1 до 12"
                />
                {form.formState.errors.grade && (
                  <p role="alert" className="mt-2 text-sm text-destructive">
                    {form.formState.errors.grade.message}
                  </p>
                )}
              </div>
            </div>
          </fieldset>
        </section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">
              Задания{" "}
              <span className="ml-1 text-muted-foreground">
                {fields.length}
              </span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Всего баллов:{" "}
              {values.questions?.reduce(
                (sum, question) =>
                  sum +
                  (Number.isFinite(question.max_score)
                    ? question.max_score
                    : 0),
                0,
              ) ?? 0}
            </p>
          </div>
          <button
            type="button"
            disabled={anyPending}
            onClick={() => setPreview(!preview)}
            className={secondaryButtonClass}
          >
            <Eye className="size-4" aria-hidden="true" />
            {preview ? "Вернуться к редактированию" : "Предпросмотр"}
          </button>
        </div>
        {fields.length === 0 && (
          <p className="rounded-2xl border border-dashed bg-card p-8 text-center text-sm leading-6 text-muted-foreground">
            Добавьте первое задание. Для готового рабочего листа нужно хотя бы
            одно заполненное задание.
          </p>
        )}
        <div className="space-y-5">
          {fields.map((field, index) => {
            const question = values.questions?.[index];
            if (!question) return null;
            return preview ? (
              <QuestionPreview
                key={field.fieldKey}
                question={question}
                index={index}
              />
            ) : (
              <QuestionEditor
                key={field.fieldKey}
                question={question}
                index={index}
                count={fields.length}
                disabled={anyPending}
                onChange={(value) =>
                  form.setValue(`questions.${index}`, value, {
                    shouldDirty: true,
                  })
                }
                onRemove={() => remove(index)}
                onDuplicate={() =>
                  insert(index + 1, duplicateQuestion(question))
                }
                onMove={(offset) => move(index, index + offset)}
                onRegenerate={() => showRegeneration(index, question)}
              />
            );
          })}
        </div>
        {!preview && (
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed bg-card p-4 sm:flex-row sm:p-5">
            <label htmlFor="new-question-type" className="sr-only">
              Тип нового задания
            </label>
            <select
              id="new-question-type"
              value={newType}
              disabled={anyPending}
              onChange={(event) =>
                setNewType(event.target.value as QuestionType)
              }
              className={`${selectClass} sm:max-w-xs`}
            >
              {questionTypes.map((type) => (
                <option key={type} value={type}>
                  {questionTypeLabels[type]}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={anyPending || fields.length >= 100}
              onClick={() => append(createEmptyQuestion(newType))}
              className={secondaryButtonClass}
            >
              <Plus className="size-4" aria-hidden="true" />
              Добавить задание
            </button>
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            <p className="font-medium">{error}</p>
            {details.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {details.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card/95 p-4 shadow-lg backdrop-blur-sm">
          <p className="text-xs text-muted-foreground">
            {pending
              ? "Сохраняем материал…"
              : isDirty
                ? "Есть несохранённые изменения"
                : worksheetId
                  ? "Нет несохранённых изменений"
                  : "Заполните параметры и добавьте задания"}
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={anyPending}
              onClick={() => submit("draft")}
              className={secondaryButtonClass}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              Сохранить черновик
            </button>
            <Button
              type="button"
              disabled={anyPending}
              onClick={() => submit("ready")}
            >
              <Check className="size-4" aria-hidden="true" />
              Готово к использованию
            </Button>
          </div>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Черновик допускает незаполненные задания. Перед отметкой «Готово»
          проверьте вопросы, варианты и правильные ответы.
        </p>
        <Link
          href={worksheetId ? `/worksheets/${worksheetId}` : "/worksheets"}
          className="inline-flex min-h-11 items-center rounded-lg text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Отмена и возврат к {worksheetId ? "рабочему листу" : "списку"}
        </Link>
      </form>
      <dialog
        ref={dialog}
        aria-labelledby="regeneration-title"
        onCancel={(event) => {
          if (aiPending) event.preventDefault();
        }}
        onClose={() => {
          setRegeneration(null);
          setCandidate(null);
          regenerateTrigger.current?.focus();
        }}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border bg-card p-5 text-card-foreground shadow-2xl backdrop:bg-black/50 sm:p-6"
      >
        <h2 id="regeneration-title" className="text-xl font-semibold">
          Другое задание с AI
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Исходное задание останется в редакторе, пока вы не примете новый
          вариант.
        </p>
        {!aiAvailable ? (
          <p
            role="status"
            className="mt-4 rounded-xl border bg-secondary p-4 text-sm leading-6"
          >
            AI пока не подключён. Вы можете создавать и редактировать задания
            вручную.
          </p>
        ) : regeneration && !candidate ? (
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const current = regeneration.question;
              const question: QuestionInput = {
                ...current,
                difficulty:
                  current.difficulty ??
                  (data.get("difficulty") as "easy" | "medium" | "hard"),
                generation_context: current.generation_context ?? {
                  topic: String(data.get("topic") ?? ""),
                  approximate_duration: Number(
                    data.get("approximate_duration"),
                  ),
                },
              };
              startAiTransition(async () => {
                setAiError(null);
                try {
                  const result = await regenerateQuestion({
                    question,
                    subject:
                      values.subject || String(data.get("subject") ?? ""),
                    grade: values.grade ?? Number(data.get("grade")),
                    teacher_instructions: String(
                      data.get("teacher_instructions") ?? "",
                    ),
                  });
                  if ("error" in result) setAiError(result.error);
                  else setCandidate(result.question);
                } catch {
                  setAiError(
                    "Не удалось получить новое задание. Проверьте соединение и попробуйте ещё раз.",
                  );
                }
              });
            }}
            aria-busy={aiPending}
          >
            <fieldset disabled={aiPending} className="space-y-4">
              {!values.subject && (
                <div>
                  <label
                    htmlFor="regen-subject"
                    className="mb-2 block text-sm font-medium"
                  >
                    Предмет
                  </label>
                  <Input
                    id="regen-subject"
                    name="subject"
                    required
                    maxLength={120}
                  />
                </div>
              )}
              {values.grade === null && (
                <div>
                  <label
                    htmlFor="regen-grade"
                    className="mb-2 block text-sm font-medium"
                  >
                    Параллель
                  </label>
                  <Input
                    id="regen-grade"
                    name="grade"
                    type="number"
                    min={1}
                    max={12}
                    required
                  />
                </div>
              )}
              {!regeneration.question.generation_context && (
                <>
                  <div>
                    <label
                      htmlFor="regen-topic"
                      className="mb-2 block text-sm font-medium"
                    >
                      Тема
                    </label>
                    <Input
                      id="regen-topic"
                      name="topic"
                      required
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="regen-duration"
                      className="mb-2 block text-sm font-medium"
                    >
                      Примерное время выполнения, минут
                    </label>
                    <Input
                      id="regen-duration"
                      name="approximate_duration"
                      type="number"
                      min={1}
                      max={240}
                      defaultValue={20}
                      required
                    />
                  </div>
                </>
              )}
              {!regeneration.question.difficulty && (
                <div>
                  <label
                    htmlFor="regen-difficulty"
                    className="mb-2 block text-sm font-medium"
                  >
                    Сложность
                  </label>
                  <select
                    id="regen-difficulty"
                    name="difficulty"
                    defaultValue="medium"
                    className={selectClass}
                  >
                    <option value="easy">Базовая</option>
                    <option value="medium">Средняя</option>
                    <option value="hard">Повышенная</option>
                  </select>
                </div>
              )}
              <div>
                <label
                  htmlFor="regen-instructions"
                  className="mb-2 block text-sm font-medium"
                >
                  Пожелания к новому заданию{" "}
                  <span className="font-normal text-muted-foreground">
                    · необязательно
                  </span>
                </label>
                <textarea
                  id="regen-instructions"
                  name="teacher_instructions"
                  maxLength={2000}
                  className={textAreaClass}
                  placeholder="Например, используйте пример из повседневной жизни"
                />
              </div>
            </fieldset>
            {aiError && (
              <p role="alert" className="text-sm text-destructive">
                {aiError}
              </p>
            )}
            <Button type="submit" disabled={aiPending}>
              {aiPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Sparkles className="size-4" aria-hidden="true" />
              )}
              {aiPending ? "Генерируем…" : "Предложить вариант"}
            </Button>
          </form>
        ) : candidate && regeneration ? (
          <div className="mt-5 space-y-4">
            <QuestionPreview question={candidate} index={regeneration.index} />
            <Button
              onClick={() => {
                form.setValue(`questions.${regeneration.index}`, candidate, {
                  shouldDirty: true,
                });
                dialog.current?.close();
              }}
            >
              <Check className="size-4" aria-hidden="true" />
              Принять новое задание
            </Button>
          </div>
        ) : null}
        <button
          ref={cancel}
          type="button"
          disabled={aiPending}
          onClick={() => dialog.current?.close()}
          className={`${secondaryButtonClass} mt-4`}
        >
          {candidate ? "Оставить исходное задание" : "Отмена"}
        </button>
      </dialog>
    </div>
  );
}
