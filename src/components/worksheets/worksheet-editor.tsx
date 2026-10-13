"use client";

import { useCallback, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { saveWorksheet } from "@/actions/worksheets";
import { Input } from "@/components/ui/input";
import {
  resizeWorksheetVariants,
  worksheetVariants,
} from "@/lib/worksheets/variants";
import type { WorksheetInput } from "@/types/worksheets";
import { secondaryButtonClass, selectClass } from "./labels";
import {
  WorksheetQuestionEditor,
  type WorksheetEditorProps,
} from "./worksheet-question-editor";

function mergeActive(
  document: WorksheetInput,
  input: WorksheetInput,
  active: number,
): WorksheetInput {
  const next = {
    ...document,
    title: input.title,
    subject: input.subject,
    grade: input.grade,
    status: input.status,
  };
  if (active === 0) return { ...next, questions: input.questions };
  return {
    ...next,
    variants: document.variants?.map((variant, index) =>
      index === active - 1
        ? { ...variant, questions: input.questions }
        : variant,
    ),
  };
}

export function WorksheetEditor(props: WorksheetEditorProps) {
  const { onPendingChange } = props;
  const [document, setDocument] = useState(props.initial);
  const latest = useRef(document);
  const [active, setActive] = useState(0);
  const [count, setCount] = useState((document.variants?.length ?? 0) + 1);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = useCallback((next: WorksheetInput) => {
    if (JSON.stringify(latest.current) === JSON.stringify(next)) return;
    latest.current = next;
    setDocument(next);
    setDirty(true);
  }, []);
  const documentChanged = useCallback(
    (input: WorksheetInput) =>
      update(mergeActive(latest.current, input, active)),
    [active, update],
  );
  const pendingChanged = useCallback(
    (value: boolean) => {
      setPending(value);
      onPendingChange?.(value);
    },
    [onPendingChange],
  );
  const variants = worksheetVariants(document);

  function resize(nextCount: number) {
    setError(null);
    if (
      nextCount < variants.length &&
      !window.confirm(
        "Удалить последние варианты и их задания? Изменения применятся после сохранения работы.",
      )
    )
      return;
    try {
      const next = resizeWorksheetVariants(latest.current, nextCount);
      update(next);
      setCount(nextCount);
      if (active >= nextCount) setActive(0);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Не удалось создать варианты.",
      );
    }
  }

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="variants-title"
        className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6"
      >
        <h2 id="variants-title" className="font-semibold">
          Варианты работы
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Новые варианты копируют задания первого. Редактируйте каждый отдельно;
          изменения сохраняются вместе.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="variant-count" className="mb-2 block text-sm">
              Количество вариантов
            </label>
            <select
              id="variant-count"
              className={selectClass}
              value={count}
              disabled={pending}
              onChange={(event) => setCount(Number(event.target.value))}
            >
              {Array.from({ length: 10 }, (_, index) => (
                <option key={index + 1} value={index + 1}>
                  {index + 1}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={pending || count === variants.length}
            onClick={() => resize(count)}
          >
            Применить количество
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={pending || variants.length >= 10}
            onClick={() => resize(variants.length + 1)}
          >
            <Copy className="size-4" aria-hidden="true" />
            Копировать базовый вариант
          </button>
        </div>
        <div
          role="group"
          aria-label="Выбор варианта"
          className="flex flex-wrap gap-2"
        >
          {variants.map((variant, index) => (
            <button
              key={variant.id ?? "base"}
              type="button"
              aria-pressed={index === active}
              disabled={pending}
              onClick={() => {
                setActive(index);
                setError(null);
              }}
              className={`${secondaryButtonClass} max-w-full break-words ${index === active ? "border-primary bg-secondary text-primary" : ""}`}
            >
              <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                {variant.label || `Вариант ${index + 1}`}
              </span>
            </button>
          ))}
        </div>
        {active > 0 && (
          <div>
            <label htmlFor="variant-label" className="mb-2 block text-sm">
              Название варианта
            </label>
            <Input
              id="variant-label"
              maxLength={80}
              disabled={pending}
              value={variants[active].label}
              onChange={(event) =>
                update({
                  ...latest.current,
                  variants: latest.current.variants?.map((variant, index) =>
                    index === active - 1
                      ? { ...variant, label: event.target.value }
                      : variant,
                  ),
                })
              }
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </section>
      <WorksheetQuestionEditor
        key={variants[active]?.id ?? "base"}
        {...props}
        initial={{
          title: document.title,
          subject: document.subject,
          grade: document.grade,
          status: document.status,
          questions: variants[active]?.questions ?? [],
        }}
        documentDirty={dirty}
        onPendingChange={pendingChanged}
        onDocumentChange={documentChanged}
        onSave={async (input) =>
          saveWorksheet({
            ...mergeActive(latest.current, input, active),
            ...(props.worksheetId
              ? { id: props.worksheetId, expected_updated_at: props.updatedAt }
              : {}),
          })
        }
      />
    </div>
  );
}
