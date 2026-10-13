"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, FilePenLine, Loader2, Sparkles } from "lucide-react";
import { generateWorksheet } from "@/actions/ai-worksheets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { WorksheetInput } from "@/types/worksheets";
import type { followUpPrefill } from "@/lib/grading/analytics";
import {
  questionTypeLabels,
  questionTypes,
  secondaryButtonClass,
  textAreaClass,
} from "./labels";
import { WorksheetEditor } from "./worksheet-editor";

const emptyWorksheet: WorksheetInput = {
  title: "",
  subject: null,
  grade: null,
  status: "draft",
  questions: [],
};

export function NewWorksheet({
  aiAvailable,
  prefill,
}: {
  aiAvailable: boolean;
  prefill?: NonNullable<ReturnType<typeof followUpPrefill>>;
}) {
  const [mode, setMode] = useState<"manual" | "ai">(prefill ? "ai" : "manual");
  const [suggestion, setSuggestion] = useState<WorksheetInput | null>(null);
  const [manual, setManual] = useState(emptyWorksheet);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const [editorPending, setEditorPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [distribution, setDistribution] = useState({
    easy: 30,
    medium: 50,
    hard: 20,
  });
  const total = distribution.easy + distribution.medium + distribution.hard;

  const changeMode = (next: "manual" | "ai") => {
    if (pending || editorPending) return;
    if (mode === next) return;
    if (
      dirty &&
      !window.confirm(
        "Переключение режима удалит несохранённые изменения. Продолжить?",
      )
    )
      return;
    setDirty(false);
    setManual(emptyWorksheet);
    setSuggestion(null);
    setError(null);
    setMode(next);
  };

  return (
    <div className="space-y-6">
      <div
        className="flex flex-col gap-2 rounded-2xl border bg-card p-2 sm:inline-flex sm:flex-row"
        role="group"
        aria-label="Способ создания рабочего листа"
      >
        {[
          {
            value: "manual" as const,
            label: "Создать вручную",
            icon: FilePenLine,
          },
          { value: "ai" as const, label: "Создать с AI", icon: Sparkles },
        ].map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            disabled={pending || editorPending}
            onClick={() => changeMode(value)}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${mode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      {mode === "manual" ? (
        <WorksheetEditor
          key="manual"
          initial={manual}
          aiAvailable={aiAvailable}
          onDirtyChange={setDirty}
          onPendingChange={setEditorPending}
        />
      ) : suggestion ? (
        <div className="space-y-5">
          <button
            type="button"
            disabled={pending || editorPending}
            className={secondaryButtonClass}
            onClick={() => {
              if (pending || editorPending) return;
              if (
                !window.confirm(
                  "Вернуться к параметрам и удалить несохранённое предложение AI?",
                )
              )
                return;
              setSuggestion(null);
              setDirty(false);
            }}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Вернуться к параметрам AI
          </button>
          <WorksheetEditor
            key="generated"
            initial={suggestion}
            generated
            aiAvailable={aiAvailable}
            onDirtyChange={setDirty}
            onPendingChange={setEditorPending}
          />
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const input = {
              subject: String(data.get("subject") ?? ""),
              grade: Number(data.get("grade")),
              topic: String(data.get("topic") ?? ""),
              approximate_duration: Number(data.get("approximate_duration")),
              question_count: Number(data.get("question_count")),
              allowed_types: data.getAll("allowed_types"),
              difficulty_distribution: distribution,
              teacher_instructions: String(
                data.get("teacher_instructions") ?? "",
              ),
            };
            setError(null);
            setFieldErrors([]);
            startTransition(async () => {
              try {
                const result = await generateWorksheet(input);
                if ("error" in result) {
                  setError(result.error);
                  setFieldErrors(
                    Object.values(result.fieldErrors ?? {}).flat(),
                  );
                } else {
                  setSuggestion(result.worksheet);
                  setDirty(true);
                }
              } catch {
                setError(
                  "Не удалось создать задания. Проверьте соединение и попробуйте ещё раз.",
                );
              }
            });
          }}
          className="max-w-4xl space-y-6 rounded-2xl border bg-card p-4 sm:p-6"
          aria-busy={pending}
        >
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
              Что подготовить для урока?
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              AI составит предложение по вашим параметрам. Вы сможете проверить
              и изменить каждое задание перед сохранением.
            </p>
          </div>
          {!aiAvailable && (
            <p
              role="status"
              className="rounded-xl border bg-secondary p-4 text-sm leading-6"
            >
              AI пока не подключён. Создайте рабочий лист вручную или вернитесь
              к генерации после настройки AI.
            </p>
          )}
          <fieldset disabled={pending || !aiAvailable} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="ai-subject"
                  className="mb-2 block text-sm font-medium"
                >
                  Предмет
                </label>
                <Input
                  id="ai-subject"
                  name="subject"
                  defaultValue={prefill?.subject}
                  required
                  maxLength={120}
                  placeholder="Например, алгебра"
                />
              </div>
              <div>
                <label
                  htmlFor="ai-grade"
                  className="mb-2 block text-sm font-medium"
                >
                  Параллель
                </label>
                <Input
                  id="ai-grade"
                  name="grade"
                  type="number"
                  min={1}
                  max={12}
                  step={1}
                  required
                  defaultValue={prefill ? (prefill.grade ?? "") : 8}
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="ai-topic"
                className="mb-2 block text-sm font-medium"
              >
                Тема урока
              </label>
              <Input
                id="ai-topic"
                name="topic"
                defaultValue={prefill?.topic}
                required
                maxLength={200}
                placeholder="Например, квадратные уравнения"
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="ai-duration"
                  className="mb-2 block text-sm font-medium"
                >
                  Примерное время, минут
                </label>
                <Input
                  id="ai-duration"
                  name="approximate_duration"
                  type="number"
                  min={1}
                  max={240}
                  step={1}
                  required
                  defaultValue={20}
                />
              </div>
              <div>
                <label
                  htmlFor="ai-count"
                  className="mb-2 block text-sm font-medium"
                >
                  Количество заданий
                </label>
                <Input
                  id="ai-count"
                  name="question_count"
                  type="number"
                  min={1}
                  max={30}
                  step={1}
                  required
                  defaultValue={8}
                />
              </div>
            </div>
            <fieldset>
              <legend className="mb-3 text-sm font-medium">Типы заданий</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {questionTypes.map((type) => (
                  <label
                    key={type}
                    className="flex min-h-12 items-center gap-3 rounded-xl border p-3 text-sm"
                  >
                    <input
                      name="allowed_types"
                      value={type}
                      type="checkbox"
                      defaultChecked
                      className="size-5 shrink-0 accent-primary"
                    />
                    {questionTypeLabels[type]}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Выберите хотя бы один тип.
              </p>
            </fieldset>
            <fieldset>
              <legend className="mb-3 text-sm font-medium">
                Распределение сложности
              </legend>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { value: "easy" as const, label: "Базовые, %" },
                  { value: "medium" as const, label: "Средние, %" },
                  { value: "hard" as const, label: "Повышенные, %" },
                ].map(({ value, label }) => (
                  <div key={value}>
                    <label
                      htmlFor={`ai-${value}`}
                      className="mb-2 block text-sm"
                    >
                      {label}
                    </label>
                    <Input
                      id={`ai-${value}`}
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      required
                      value={
                        Number.isNaN(distribution[value])
                          ? ""
                          : distribution[value]
                      }
                      onChange={(event) =>
                        setDistribution({
                          ...distribution,
                          [value]: event.target.valueAsNumber,
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <p
                role="status"
                className={`mt-3 text-xs ${total === 100 ? "text-muted-foreground" : "text-destructive"}`}
              >
                {Number.isFinite(total)
                  ? `Итого: ${total}%`
                  : "Заполните все проценты"}
                . Сумма должна быть 100%.
              </p>
            </fieldset>
            <div>
              <label
                htmlFor="ai-instructions"
                className="mb-2 block text-sm font-medium"
              >
                Пожелания учителя{" "}
                <span className="font-normal text-muted-foreground">
                  · необязательно
                </span>
              </label>
              <textarea
                id="ai-instructions"
                name="teacher_instructions"
                defaultValue={prefill?.teacherInstructions}
                maxLength={2000}
                className={textAreaClass}
                placeholder="Например, добавьте задачи с практическими примерами и используйте простые формулировки"
              />
            </div>
          </fieldset>
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
            >
              <p>{error}</p>
              {fieldErrors.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {[...new Set(fieldErrors)].map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <Button
            type="submit"
            disabled={pending || !aiAvailable || total !== 100}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            {pending ? "Готовим задания…" : "Сгенерировать рабочий лист"}
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">
            Проверьте точность вопросов и ключей. AI может ошибаться.
          </p>
        </form>
      )}
    </div>
  );
}
