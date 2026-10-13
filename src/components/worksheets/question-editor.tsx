"use client";

import {
  ArrowDown,
  ArrowUp,
  Copy,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { QuestionInput } from "@/types/worksheets";
import {
  questionControlId,
  type QuestionFieldError,
} from "@/lib/worksheets/editor-validation";
import {
  difficultyLabels,
  questionTypeLabels,
  secondaryButtonClass,
  selectClass,
  textAreaClass,
} from "./labels";

export function QuestionEditor({
  question,
  index,
  count,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
  onRegenerate,
  disabled,
  errors = [],
}: {
  question: QuestionInput;
  index: number;
  count: number;
  onChange: (question: QuestionInput) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (offset: -1 | 1) => void;
  onRegenerate?: () => void;
  disabled: boolean;
  errors?: QuestionFieldError[];
}) {
  const prefix = `question-${question.id}`;
  function errorProps(field: string) {
    const matching = errors.flatMap((error, index) =>
      error.field === field ? [`${prefix}-error-${index}`] : [],
    );
    return {
      "aria-invalid": matching.length > 0 || undefined,
      "aria-describedby": matching.length ? matching.join(" ") : undefined,
    };
  }
  return (
    <article
      className="min-w-0 space-y-5 rounded-2xl border bg-card p-4 sm:p-5"
      aria-labelledby={`${prefix}-title`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id={`${prefix}-title`} className="font-semibold">
          <span className="mr-2 inline-flex size-7 items-center justify-center rounded-lg bg-secondary text-primary">
            {index + 1}
          </span>
          {questionTypeLabels[question.type]}
        </h3>
        <div className="flex flex-wrap gap-1">
          {[
            {
              icon: ArrowUp,
              label: `Поднять задание ${index + 1}`,
              action: () => onMove(-1),
              unavailable: index === 0,
            },
            {
              icon: ArrowDown,
              label: `Опустить задание ${index + 1}`,
              action: () => onMove(1),
              unavailable: index === count - 1,
            },
            {
              icon: Copy,
              label: `Дублировать задание ${index + 1}`,
              action: onDuplicate,
              unavailable: count >= 100,
            },
            {
              icon: Trash2,
              label: `Удалить задание ${index + 1}`,
              action: onRemove,
              unavailable: false,
            },
          ].map(({ icon: Icon, label, action, unavailable }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              title={label}
              onClick={action}
              disabled={disabled || unavailable}
              className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          ))}
        </div>
      </div>
      {errors.length > 0 && (
        <ul
          className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          aria-label={`Ошибки задания ${index + 1}`}
        >
          {errors.map((error, errorIndex) => (
            <li
              key={`${error.field}-${errorIndex}`}
              id={`${prefix}-error-${errorIndex}`}
            >
              <a
                href={`#${questionControlId(question, error.field)}`}
                className="underline underline-offset-4"
                onClick={(event) => {
                  event.preventDefault();
                  document
                    .getElementById(questionControlId(question, error.field))
                    ?.focus();
                }}
              >
                {error.message}
              </a>
            </li>
          ))}
        </ul>
      )}
      <fieldset disabled={disabled} className="min-w-0 space-y-5">
        <div>
          <label
            htmlFor={`${prefix}-prompt`}
            className="mb-2 block text-sm font-medium"
          >
            Формулировка задания
          </label>
          <textarea
            id={`${prefix}-prompt`}
            {...errorProps("prompt")}
            value={question.prompt}
            onChange={(event) =>
              onChange({ ...question, prompt: event.target.value })
            }
            maxLength={12000}
            placeholder="Напишите вопрос или условие задачи"
            className={textAreaClass}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor={`${prefix}-score`}
              className="mb-2 block text-sm font-medium"
            >
              Максимальный балл
            </label>
            <Input
              id={`${prefix}-score`}
              {...errorProps("max_score")}
              type="number"
              min={0}
              max={1000}
              step="any"
              value={Number.isNaN(question.max_score) ? "" : question.max_score}
              onChange={(event) =>
                onChange({ ...question, max_score: event.target.valueAsNumber })
              }
            />
          </div>
          <div>
            <label
              htmlFor={`${prefix}-difficulty`}
              className="mb-2 block text-sm font-medium"
            >
              Сложность
            </label>
            <select
              id={`${prefix}-difficulty`}
              {...errorProps("difficulty")}
              value={question.difficulty ?? ""}
              onChange={(event) =>
                onChange({
                  ...question,
                  difficulty: event.target.value
                    ? (event.target.value as "easy" | "medium" | "hard")
                    : null,
                })
              }
              className={selectClass}
            >
              <option value="">Не указана</option>
              {Object.entries(difficultyLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {question.type === "multiple_choice" && (
          <div
            id={`${prefix}-choices`}
            tabIndex={-1}
            {...errorProps("options")}
            className="space-y-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="text-sm font-medium">Варианты ответа</p>
            <p className="text-xs leading-5 text-muted-foreground">
              Отметьте один или несколько правильных вариантов.
            </p>
            {question.options.map((option, optionIndex) => (
              <div key={option.id} className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  {...errorProps("correct_option_ids")}
                  aria-label={`Вариант ${optionIndex + 1} правильный, задание ${index + 1}`}
                  checked={question.correct_option_ids.includes(option.id)}
                  onChange={(event) =>
                    onChange({
                      ...question,
                      correct_option_ids: event.target.checked
                        ? [...question.correct_option_ids, option.id]
                        : question.correct_option_ids.filter(
                            (id) => id !== option.id,
                          ),
                    })
                  }
                  className="size-5 shrink-0 accent-primary"
                />
                <Input
                  id={`${prefix}-option-${option.id}`}
                  {...errorProps(`options.${optionIndex}.text`)}
                  className="min-w-0"
                  aria-label={`Текст варианта ${optionIndex + 1}, задание ${index + 1}`}
                  value={option.text}
                  maxLength={2000}
                  placeholder={`Вариант ${optionIndex + 1}`}
                  onChange={(event) =>
                    onChange({
                      ...question,
                      options: question.options.map((item) =>
                        item.id === option.id
                          ? { ...item, text: event.target.value }
                          : item,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  aria-label={`Удалить вариант ${optionIndex + 1}, задание ${index + 1}`}
                  disabled={question.options.length <= 2}
                  onClick={() =>
                    onChange({
                      ...question,
                      options: question.options.filter(
                        (item) => item.id !== option.id,
                      ),
                      correct_option_ids: question.correct_option_ids.filter(
                        (id) => id !== option.id,
                      ),
                    })
                  }
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-35"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={question.options.length >= 12}
              onClick={() =>
                onChange({
                  ...question,
                  options: [
                    ...question.options,
                    { id: crypto.randomUUID(), text: "" },
                  ],
                })
              }
              className={secondaryButtonClass}
            >
              <Plus className="size-4" aria-hidden="true" />
              Добавить вариант
            </button>
          </div>
        )}
        {question.type === "short_answer" && (
          <div>
            <label
              htmlFor={`${prefix}-answer`}
              className="mb-2 block text-sm font-medium"
            >
              Правильный ответ
            </label>
            <textarea
              id={`${prefix}-answer`}
              {...errorProps("expected_answer")}
              value={question.expected_answer}
              onChange={(event) =>
                onChange({ ...question, expected_answer: event.target.value })
              }
              maxLength={4000}
              className={textAreaClass}
              placeholder="Эталонный короткий ответ"
            />
          </div>
        )}
        {question.type === "numeric" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor={`${prefix}-answer`}
                className="mb-2 block text-sm font-medium"
              >
                Правильный ответ
              </label>
              <Input
                id={`${prefix}-answer`}
                {...errorProps("expected_answer")}
                type="number"
                step="any"
                value={
                  Number.isNaN(question.expected_answer)
                    ? ""
                    : question.expected_answer
                }
                onChange={(event) =>
                  onChange({
                    ...question,
                    expected_answer: event.target.valueAsNumber,
                  })
                }
              />
            </div>
            <div>
              <label
                htmlFor={`${prefix}-tolerance`}
                className="mb-2 block text-sm font-medium"
              >
                Допустимая погрешность
              </label>
              <Input
                id={`${prefix}-tolerance`}
                {...errorProps("tolerance")}
                type="number"
                min={0}
                step="any"
                value={
                  Number.isNaN(question.tolerance) ? "" : question.tolerance
                }
                onChange={(event) =>
                  onChange({
                    ...question,
                    tolerance: event.target.valueAsNumber,
                  })
                }
              />
            </div>
          </div>
        )}
        {question.type === "open_response" && (
          <div className="space-y-4">
            <div>
              <label
                htmlFor={`${prefix}-answer`}
                className="mb-2 block text-sm font-medium"
              >
                Пример ответа{" "}
                <span className="font-normal text-muted-foreground">
                  · необязательно
                </span>
              </label>
              <textarea
                id={`${prefix}-answer`}
                {...errorProps("expected_answer")}
                value={question.expected_answer ?? ""}
                onChange={(event) =>
                  onChange({
                    ...question,
                    expected_answer: event.target.value || null,
                  })
                }
                maxLength={12000}
                className={textAreaClass}
              />
            </div>
            <div>
              <label
                htmlFor={`${prefix}-rubric`}
                className="mb-2 block text-sm font-medium"
              >
                Критерии оценивания{" "}
                <span className="font-normal text-muted-foreground">
                  · необязательно
                </span>
              </label>
              <textarea
                id={`${prefix}-rubric`}
                {...errorProps("rubric")}
                value={question.rubric ?? ""}
                onChange={(event) =>
                  onChange({ ...question, rubric: event.target.value || null })
                }
                maxLength={12000}
                className={textAreaClass}
                placeholder="Какие элементы ответа и за сколько баллов учитывать"
              />
            </div>
          </div>
        )}
      </fieldset>
      {onRegenerate && (
        <div className="border-t pt-4">
          <button
            type="button"
            disabled={disabled}
            onClick={onRegenerate}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Предложить другое задание с AI
          </button>
        </div>
      )}
    </article>
  );
}
