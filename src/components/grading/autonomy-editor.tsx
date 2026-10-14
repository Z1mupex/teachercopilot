"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { selectClass } from "@/components/worksheets/labels";
import {
  applyAutonomyPreset,
  autonomyModes,
  autonomyLabel,
  type AutonomyRules,
} from "@/lib/grading/autonomy";
import { cn } from "@/lib/utils";

export function AutonomySummary({
  rules,
  frozen = false,
}: {
  rules: AutonomyRules;
  frozen?: boolean;
}) {
  return (
    <div className="space-y-2 text-sm">
      <p className="font-semibold">
        {autonomyLabel(rules.mode)}{" "}
        <span className="ml-2 text-xs font-normal text-muted-foreground">
          {frozen
            ? "Зафиксирован для этой проверки"
            : "Выбран для этой проверки"}
        </span>
      </p>
      <p className="text-xs leading-5 text-muted-foreground">
        {rules.auto_confirm
          ? `Автопринятие от ${Math.round(rules.confidence_threshold * 100)}% confidence. ${rules.auto_confirm_open ? "Включая развёрнутые ответы по критериям." : rules.auto_confirm_ai ? "Оценки ИИ коротких ответов включены." : "Оценки ИИ проверяет учитель."}`
          : "Каждый ответ проверяет учитель."}{" "}
        Завершение — вручную.
      </p>
    </div>
  );
}

export function AutonomyEditor({
  value,
  onChange,
  disabled = false,
}: {
  value: AutonomyRules;
  onChange: (value: AutonomyRules) => void;
  disabled?: boolean;
}) {
  const id = useId();
  function edit(changes: Partial<AutonomyRules>) {
    const next = { ...value, ...changes, mode: "custom" as const };
    if (!next.auto_confirm) {
      next.auto_confirm_ai = false;
      next.auto_confirm_open = false;
    }
    if (!next.auto_confirm_ai) next.auto_confirm_open = false;
    onChange(next);
  }
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <legend className="sr-only">Самостоятельность ИИ</legend>
      <div className="grid gap-3 lg:grid-cols-3">
        {(Object.keys(autonomyModes) as (keyof typeof autonomyModes)[]).map(
          (mode) => {
            const item = autonomyModes[mode];
            return (
              <label
                key={mode}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-4",
                  value.mode === mode && "border-primary bg-secondary/50",
                  disabled && "cursor-default",
                )}
              >
                <input
                  type="radio"
                  name={id}
                  checked={value.mode === mode}
                  onChange={() => onChange(applyAutonomyPreset(value, mode))}
                  className="mt-1 accent-primary"
                />
                <span>
                  <span className="block text-sm font-semibold">
                    {item.label}
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </span>
                  <span className="mt-3 block text-xs text-primary">
                    От {Math.round(item.threshold * 100)}% confidence
                  </span>
                </span>
              </label>
            );
          },
        )}
      </div>
      {value.mode === "custom" && (
        <p role="status" className="text-xs font-medium text-primary">
          Свои правила · параметры изменены вручную
        </p>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Пустые, нечитаемые и неоднозначные ответы всегда требуют отдельного
        решения. ИИ не завершает проверку самостоятельно. Confidence —
        самооценка модели, а не гарантия правильности.
      </p>
      <details className="rounded-md border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          Параметры и правила сравнения
        </summary>
        <div className="mt-4 space-y-4">
          <label className="block space-y-2 text-sm">
            <span>Порог confidence</span>
            <Input
              aria-label="Порог confidence"
              type="number"
              min={0.5}
              max={1}
              step={0.01}
              value={
                Number.isFinite(value.confidence_threshold)
                  ? value.confidence_threshold
                  : ""
              }
              onChange={(e) =>
                edit({
                  confidence_threshold:
                    e.target.value === "" ? Number.NaN : Number(e.target.value),
                })
              }
              className="max-w-40"
            />
          </label>
          {(
            [
              ["auto_confirm", "Автоматически принимать уверенные ответы"],
              ["auto_confirm_ai", "Принимать оценки ИИ коротких ответов"],
              ["auto_confirm_open", "Принимать оценки ИИ развёрнутых ответов"],
              ["fraction_equivalence", "Считать 0.5 и 1/2 одинаковыми"],
              ["ignore_case", "Игнорировать регистр коротких ответов"],
              ["typo_tolerance", "Допускать небольшие опечатки"],
            ] as const
          ).map(([key, label]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4 border-t pt-3"
            >
              <span id={`${id}-${key}`} className="text-sm">
                {label}
              </span>
              <Switch
                aria-labelledby={`${id}-${key}`}
                checked={value[key]}
                onCheckedChange={(checked) => edit({ [key]: checked })}
                disabled={
                  disabled ||
                  (key === "auto_confirm_ai" && !value.auto_confirm) ||
                  (key === "auto_confirm_open" &&
                    (!value.auto_confirm || !value.auto_confirm_ai))
                }
              />
            </div>
          ))}
          <label className="block space-y-2 text-sm">
            <span>Округление чисел</span>
            <select
              value={
                value.rounding_digits === null
                  ? "none"
                  : String(value.rounding_digits)
              }
              className={selectClass}
              onChange={(e) =>
                edit({
                  rounding_digits:
                    e.target.value === "none" ? null : Number(e.target.value),
                })
              }
            >
              <option value="none">Без дополнительного округления</option>
              {Array.from({ length: 9 }, (_, digits) => (
                <option key={digits} value={digits}>
                  {digits === 0
                    ? "До целого"
                    : `Знаков после запятой: ${digits}`}
                </option>
              ))}
            </select>
          </label>
        </div>
      </details>
    </fieldset>
  );
}
