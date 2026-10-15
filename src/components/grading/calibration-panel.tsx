"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  configureCalibration,
  generateCalibration,
  saveCalibration,
} from "@/actions/grading-calibration";
import {
  suggestedCalibrationSamples,
  calibrationProfileSchema,
  type CalibrationProfile,
} from "@/lib/grading/calibration-schema";
import {
  secondaryButtonClass,
  selectClass,
} from "@/components/worksheets/labels";
import type { GradingProgress } from "@/types/grading-workflow";
export function CalibrationPanel({
  progress,
  questions,
  running,
  aiConfigured,
  onRefresh,
  onBusy,
}: {
  progress: GradingProgress;
  questions: { id: string; label: string }[];
  running: boolean;
  aiConfigured: boolean;
  onRefresh: () => Promise<GradingProgress>;
  onBusy: (busy: boolean) => void;
}) {
  const c = progress.calibration;
  const [selection, setSelection] = useState(() =>
      c.samples.length
        ? c.samples
        : suggestedCalibrationSamples(progress.submissions.map((s) => s.id)),
    ),
    [busy, setBusyState] = useState(false),
    [error, setError] = useState("");
  const [candidate, setCandidate] = useState<{
    profile: CalibrationProfile;
    revision: string;
  } | null>(null);
  const sampleWorks = progress.submissions.filter((s) =>
      c.samples.includes(s.id),
    ),
    processed = sampleWorks.filter((s) =>
      ["proposed", "needs_review", "completed"].includes(s.status),
    ).length;
  const reviewed =
    processed === c.samples.length &&
    progress.answers > 0 &&
    progress.teacherReviewed === progress.answers;
  const started = progress.autonomy.frozen;
  function setBusy(value: boolean) {
    setBusyState(value);
    onBusy(value);
  }
  async function configure(samples: string[]) {
    if (busy || running) return;
    setBusy(true);
    setError("");
    try {
      const result = await configureCalibration({
        batch: progress.id,
        revision: c.revision,
        samples,
      });
      if ("error" in result) {
        setError(result.error ?? "Не удалось выбрать пробные работы.");
        return;
      }
      await onRefresh();
    } catch {
      setError("Не удалось обновить пробную проверку. Обновите страницу.");
    } finally {
      setBusy(false);
    }
  }
  async function propose() {
    if (busy || running) return;
    setBusy(true);
    setError("");
    try {
      const result = await generateCalibration({ batch: progress.id });
      if ("error" in result) {
        setError(result.error ?? "Не удалось получить правила.");
        return;
      }
      setCandidate(result);
    } catch {
      setError("Не удалось получить предложение правил. Попробуйте позже.");
    } finally {
      setBusy(false);
    }
  }
  async function approve() {
    if (!candidate || busy || running) return;
    const checked = calibrationProfileSchema.safeParse(candidate.profile);
    if (!checked.success) {
      setError("Заполните краткое описание и правила.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await saveCalibration({
        batch: progress.id,
        revision: candidate.revision,
        profile: checked.data,
      });
      if ("error" in result) {
        setError(result.error ?? "Не удалось выполнить действие.");
        return;
      }
      await onRefresh();
      setCandidate(null);
    } catch {
      setError("Подтверждение не получено. Обновите страницу перед повтором.");
    } finally {
      setBusy(false);
    }
  }
  function changeRule(
    index: number,
    value: Partial<CalibrationProfile["rules"][number]>,
  ) {
    setCandidate((old) =>
      old
        ? {
            ...old,
            profile: {
              ...old.profile,
              rules: old.profile.rules.map((rule, i) =>
                i === index ? { ...rule, ...value } : rule,
              ),
            },
          }
        : null,
    );
  }
  if (progress.status === "completed" && !c.enabled) return null;
  return (
    <section
      className="space-y-4 rounded-lg border bg-card p-5"
      aria-label="Пробная проверка"
    >
      <header>
        <h2 className="text-lg font-semibold">Пробная проверка</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Проверим сначала 3–5 работ вместе, затем применим ваши уточнения к
          оставшимся.
        </p>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {c.profile ? (
        <>
          <p className="text-sm font-medium">
            Правила этой проверки подтверждены
          </p>
          <p className="text-sm text-muted-foreground">{c.profile.summary}</p>
          <ul className="space-y-2">
            {c.profile.rules.map((rule, i) => (
              <li key={i} className="text-sm">
                <span className="font-medium">
                  {rule.question_id
                    ? (questions.find((q) => q.id === rule.question_id)
                        ?.label ?? "Задание")
                    : "Общее правило"}
                  :
                </span>{" "}
                {rule.instruction}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Они применятся только к ещё не проверенным работам этой пачки.
            Пробные баллы и подтверждённые решения сохраняются.
          </p>
        </>
      ) : !c.enabled ? (
        !started && (
          <>
            <p className="text-xs leading-5 text-muted-foreground">
              Предложена выборка из разных частей пачки. Качество ответов до
              распознавания неизвестно; работы можно выбрать вручную.
            </p>
            <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
              {progress.submissions.map((s) => (
                <label
                  key={s.id}
                  className="flex min-h-11 items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={selection.includes(s.id)}
                    disabled={
                      busy ||
                      running ||
                      (!selection.includes(s.id) && selection.length >= 5)
                    }
                    onChange={(e) =>
                      setSelection((ids) =>
                        e.target.checked
                          ? [...ids, s.id]
                          : ids.filter((id) => id !== s.id),
                      )
                    }
                  />
                  Работа № {s.number} · {s.pages.length} листов
                </label>
              ))}
            </div>
            <Button
              disabled={
                busy ||
                running ||
                selection.length < Math.min(3, progress.submissions.length)
              }
              onClick={() => void configure(selection)}
            >
              Выбрать пробные работы · {selection.length}
            </Button>
            <p className="text-xs text-muted-foreground">
              Без пробной проверки можно сразу запустить обработку по выбранному
              режиму ИИ.
            </p>
          </>
        )
      ) : (
        <>
          <p className="text-sm">
            Пробные работы: {sampleWorks.map((s) => s.number).join(", ")}.
            Обработано {processed}/{c.samples.length}.
          </p>
          {!started && (
            <button
              className={secondaryButtonClass}
              disabled={busy || running}
              onClick={() => void configure([])}
            >
              Отменить пробную проверку
            </button>
          )}
          {progress.answers > 0 && (
            <Link
              href={`/grading/${progress.id}/review`}
              className={secondaryButtonClass}
            >
              Проверить пробные ответы и добавить пояснения
            </Link>
          )}
          {started && !reviewed && (
            <p className="text-xs leading-5 text-muted-foreground">
              Пройдите каждый ответ пробных работ, исправьте баллы и объясните
              свои решения. Остальные работы пока не запускаются.
            </p>
          )}
          {reviewed && (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || running || !aiConfigured}
                onClick={() => void propose()}
              >
                {busy ? "Готовим…" : "Предложить правила по моим решениям"}
              </Button>
              <button
                className={secondaryButtonClass}
                disabled={busy || running}
                onClick={() =>
                  setCandidate({
                    revision: c.revision,
                    profile: {
                      summary: "Правила этой проверки",
                      rules: [{ question_id: null, instruction: "" }],
                    },
                  })
                }
              >
                Написать правила самостоятельно
              </button>
            </div>
          )}
        </>
      )}
      {candidate && !c.profile && (
        <fieldset
          disabled={busy || running}
          className="space-y-4 rounded border p-4"
        >
          <legend className="px-2 text-sm font-semibold">
            Предложение · проверьте перед применением
          </legend>
          <label className="block space-y-2 text-sm">
            <span>Краткое описание</span>
            <Input
              value={candidate.profile.summary}
              maxLength={800}
              onChange={(e) =>
                setCandidate((old) =>
                  old
                    ? {
                        ...old,
                        profile: { ...old.profile, summary: e.target.value },
                      }
                    : null,
                )
              }
            />
          </label>
          {candidate.profile.rules.map((rule, i) => (
            <div key={i} className="space-y-2 border-t pt-3">
              <label className="block space-y-1 text-xs">
                <span>К чему относится правило {i + 1}</span>
                <select
                  className={selectClass}
                  value={rule.question_id ?? "all"}
                  onChange={(e) =>
                    changeRule(i, {
                      question_id:
                        e.target.value === "all" ? null : e.target.value,
                    })
                  }
                >
                  <option value="all">Общее правило для этой работы</option>
                  {questions.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </label>
              <textarea
                aria-label={`Текст правила ${i + 1}`}
                className="min-h-24 w-full rounded border bg-background p-3 text-sm"
                value={rule.instruction}
                maxLength={600}
                onChange={(e) => changeRule(i, { instruction: e.target.value })}
              />
              <button
                type="button"
                className="text-xs text-destructive"
                onClick={() =>
                  setCandidate((old) =>
                    old
                      ? {
                          ...old,
                          profile: {
                            ...old.profile,
                            rules: old.profile.rules.filter((_, n) => n !== i),
                          },
                        }
                      : null,
                  )
                }
              >
                Убрать правило
              </button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={candidate.profile.rules.length >= 20}
              onClick={() =>
                setCandidate((old) =>
                  old
                    ? {
                        ...old,
                        profile: {
                          ...old.profile,
                          rules: [
                            ...old.profile.rules,
                            { question_id: null, instruction: "" },
                          ],
                        },
                      }
                    : null,
                )
              }
            >
              Добавить правило
            </button>
            <Button onClick={() => void approve()}>
              Подтвердить правила для оставшихся работ
            </Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Сохранение правил не запускает ИИ. После подтверждения отдельно
            начните обработку оставшихся работ. Эти правила не переносятся в
            другие проверки.
          </p>
        </fieldset>
      )}
    </section>
  );
}
