"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { gradingRequest, GradingClientError } from "@/lib/grading/client-http";
import { GRADING_POLICY } from "@/lib/grading/policy";
import type {
  GradingProgress,
  SubmissionProgress,
} from "@/types/grading-workflow";
export function canProcessSubmission(
  s: SubmissionProgress,
  observedAt: string,
) {
  return (
    s.status === "uploaded" ||
    s.status === "failed" ||
    (s.status === "processing" &&
      (!s.leaseUntil || Date.parse(s.leaseUntil) <= Date.parse(observedAt)))
  );
}
export function useGradingProcessor(
  initial: GradingProgress,
  multipleVariants: boolean,
) {
  const [progress, setProgress] = useState(initial),
    [running, setRunning] = useState(false),
    [paused, setPaused] = useState(false),
    [error, setError] = useState<string | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initial.submissions.map((s) => [
        s.id,
        multipleVariants && s.status === "uploaded"
          ? ""
          : (s.variantId ?? "base"),
      ]),
    ),
  );
  const stopped = useRef(true),
    mounted = useRef(true),
    locked = useRef(false),
    refreshNumber = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopped.current = true;
    };
  }, []);
  const refresh = useCallback(async () => {
    const request = ++refreshNumber.current;
    const { progress: p } = await gradingRequest<{ progress: GradingProgress }>(
      `/grading/${initial.id}/progress`,
    );
    if (mounted.current && request === refreshNumber.current) setProgress(p);
    return p;
  }, [initial.id]);
  const hasRunning =
    running ||
    progress.submissions.some(
      (s) =>
        s.status === "processing" &&
        s.leaseUntil &&
        Date.parse(s.leaseUntil) > Date.parse(progress.observedAt),
    );
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => {
      void refresh().catch(() => {
        if (mounted.current)
          setError("Не удалось обновить прогресс. Нажмите «Обновить».");
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [hasRunning, refresh]);
  async function run(ids: string[]) {
    if (locked.current || !ids.length) return;
    locked.current = true;
    stopped.current = false;
    setRunning(true);
    setPaused(false);
    setError(null);
    const pending = [...ids];
    async function worker() {
      while (!stopped.current) {
        const id = pending.shift();
        if (!id) break;
        try {
          const selected = selections[id];
          if (!selected) throw new Error("Выберите вариант для каждой работы.");
          await gradingRequest(`/grading/${initial.id}/process/${id}`, {
            variant_id: selected === "base" ? null : selected,
          });
        } catch (failure) {
          if (mounted.current)
            setError(
              failure instanceof Error
                ? failure.message
                : "Не удалось обработать работу.",
            );
          if (
            failure instanceof GradingClientError &&
            (failure.status === 429 ||
              [
                "provider_configuration",
                "not_configured",
                "audit_failed",
              ].includes(failure.code ?? ""))
          )
            stopped.current = true;
        }
        try {
          await refresh();
        } catch {
          stopped.current = true;
          if (mounted.current)
            setError(
              "Не удалось обновить прогресс. Обновите страницу перед повторным запуском.",
            );
        }
      }
    }
    try {
      await Promise.all(
        Array.from({ length: GRADING_POLICY.concurrency }, worker),
      );
    } finally {
      locked.current = false;
      if (mounted.current) setRunning(false);
    }
  }
  return {
    progress,
    running,
    paused,
    error,
    selections,
    setSelections,
    refresh,
    run,
    pause() {
      stopped.current = true;
      setPaused(true);
    },
    setError,
  };
}
