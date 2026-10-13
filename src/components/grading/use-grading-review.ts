"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { gradingRequest } from "@/lib/grading/client-http";
import type { ReviewSlice } from "@/types/grading-workflow";
export function useGradingReview(initial: ReviewSlice) {
  const locked = useRef(false);
  const router = useRouter(),
    [data, setData] = useState(initial),
    [all, setAll] = useState(false),
    [index, setIndex] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const url = `/grading/${initial.progress.id}/review/data`;
  async function read(mode: boolean, page: number) {
    let { result } = await gradingRequest<{ result: ReviewSlice }>(
      `${url}?all=${mode}&page=${page}`,
    );
    if (!result.answers.length && page > 0)
      ({ result } = await gradingRequest<{ result: ReviewSlice }>(
        `${url}?all=${mode}&page=0`,
      ));
    return result;
  }
  async function load(mode = all, page = data.page, last = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await read(mode, page);
      setData(result);
      setAll(mode);
      setIndex(last ? Math.max(0, result.answers.length - 1) : 0);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось загрузить очередь.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function save(
    command: "confirm" | "score" | "unreadable",
    score?: number,
  ) {
    const answer = data.answers[index];
    if (!answer || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    let acknowledged = false;
    try {
      await gradingRequest(url, {
        command,
        answer_id: answer.id,
        revision: answer.revision,
        ...(command === "score" ? { score } : {}),
      });
      acknowledged = true;
      const result = await read(all, data.page);
      setData(result);
      const retained = result.answers.findIndex((a) => a.id === answer.id);
      setIndex(
        retained >= 0
          ? retained
          : Math.min(index, Math.max(0, result.answers.length - 1)),
      );
      setNotice("Решение сохранено.");
    } catch (e) {
      setError(
        `${acknowledged ? "Решение сохранено, но очередь не обновилась. Нажмите «Обновить очередь». " : ""}${e instanceof Error ? e.message : "Не удалось сохранить решение."}`,
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function navigate(offset: number) {
    if (locked.current) return;
    const next = index + offset;
    if (next >= 0 && next < data.answers.length) {
      setIndex(next);
      setNotice(null);
      setError(null);
    } else if (next < 0 && data.page > 0) void load(all, data.page - 1, true);
    else if (
      next >= data.answers.length &&
      data.page * 40 + data.answers.length < data.count
    )
      void load(all, data.page + 1);
  }
  async function finalize() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await gradingRequest(url, { command: "finalize" });
      router.push(`/grading/${initial.progress.id}/results`);
      router.refresh();
    } catch (e) {
      locked.current = false;
      setError(
        e instanceof Error ? e.message : "Не удалось завершить проверку.",
      );
      setBusy(false);
    }
  }
  return {
    data,
    all,
    index,
    busy,
    error,
    notice,
    answer: data.answers[index],
    load,
    save,
    navigate,
    finalize,
  };
}
