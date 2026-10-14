"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gradingRequest } from "@/lib/grading/client-http";
import type { WorkReview } from "@/types/grading-workflow";

export function useWorkReview(initial: WorkReview) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const locked = useRef(false),
    mounted = useRef(true);
  const router = useRouter();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const base = `/grading/${initial.progress.id}/review`;
  async function read(id: string) {
    const { result } = await gradingRequest<{ result: WorkReview }>(
      `${base}/paper?submission=${id}`,
    );
    return result;
  }
  async function load(id = data.submission?.id) {
    if (locked.current || !id) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await read(id);
      if (mounted.current) setData(result);
      return mounted.current ? result : undefined;
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "Не удалось загрузить работу.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function mutate(input: Record<string, unknown>, message: string) {
    if (locked.current || !data.submission) return;
    const id = data.submission.id;
    locked.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    let acknowledged = false;
    try {
      await gradingRequest(`${base}/data`, input);
      acknowledged = true;
      const result = await read(id);
      if (mounted.current) {
        setData(result);
        setNotice(message);
      }
    } catch (e) {
      // Never retry mutations implicitly. A fresh read can recover an acknowledgement
      // or reveal a stale revision without repeating teacher decisions.
      if (!acknowledged) {
        try {
          const result = await read(id);
          if (mounted.current) setData(result);
        } catch {
          if (mounted.current)
            setNotice(
              "Не удалось обновить состояние работы. Нажмите «Обновить».",
            );
        }
      }
      if (mounted.current)
        setError(
          `${acknowledged ? "Решение сохранено, но экран не обновился. " : "Операция не подтверждена. "}${e instanceof Error ? e.message : "Обновите работу перед повтором."}`,
        );
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function save(
    id: string,
    command: "confirm" | "score" | "unreadable",
    score?: number,
  ) {
    const answer = data.answers.find((a) => a.id === id);
    if (!answer) return;
    await mutate(
      {
        command,
        answer_id: answer.id,
        revision: answer.revision,
        ...(command === "score" ? { score } : {}),
      },
      "Решение сохранено.",
    );
  }
  async function confirmMany(
    answers: { id: string; revision: string }[],
    wholePaper: boolean,
  ) {
    if (!data.submission) return;
    await mutate(
      {
        command: "confirm_many",
        submission_id: data.submission.id,
        answers,
        whole_paper: wholePaper,
      },
      `Учитель подтвердил ответов: ${answers.length}.`,
    );
  }
  async function finalize() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await gradingRequest(`${base}/data`, { command: "finalize" });
      router.push(`/grading/${initial.progress.id}/results`);
      router.refresh();
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : "Не удалось завершить проверку.",
        );
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { data, busy, error, notice, load, save, confirmMany, finalize };
}
