"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ReviewAnswerCard } from "@/components/grading/review-answer-card";
import { secondaryButtonClass } from "@/components/worksheets/labels";
import type { ReviewSlice } from "@/types/grading-workflow";

// Design sandbox uses owned read-only data. It imports no mutation actions/hooks.
export function ReviewDesignPreview({ initial }: { initial: ReviewSlice }) {
  const [index, setIndex] = useState(0);
  const [closed, setClosed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const answer = initial.answers[index];
  function navigate(offset: number) {
    setIndex((current) => current + offset);
    setNotice(null);
  }
  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Link href="/grading" className="studio-text-button">
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          Все проверки
        </Link>
        <span className="studio-status">Примерка дизайна</span>
      </div>
      <h1 className="studio-title">Решения учителя</h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
        Попробуйте сравнение ответов и выставление балла. На этом экране решения
        не сохраняются в проверке.
      </p>
      <div className="mt-5 mb-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1" aria-label="Режим примерки">
          <button
            type="button"
            className="studio-tab"
            aria-pressed={!closed}
            onClick={() => {
              setClosed(false);
              setNotice(null);
            }}
          >
            Решение учителя
          </button>
          <button
            type="button"
            className="studio-tab"
            aria-pressed={closed}
            onClick={() => {
              setClosed(true);
              setNotice(null);
            }}
          >
            Завершённая проверка
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {answer ? index + 1 : 0} / {initial.answers.length}
          </span>
          <button
            type="button"
            className={secondaryButtonClass}
            aria-label="Предыдущий пример"
            disabled={index === 0}
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            aria-label="Следующий пример"
            disabled={index >= initial.answers.length - 1}
            onClick={() => navigate(1)}
          >
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-md border bg-secondary px-4 py-3 text-sm text-primary"
        >
          {notice}
        </p>
      )}
      {answer ? (
        <ReviewAnswerCard
          key={answer.id + ":" + closed}
          batchId={initial.progress.id}
          answer={answer}
          busy={false}
          closed={closed}
          preview
          onSave={async (command, score) => {
            const value =
              command === "unreadable"
                ? 0
                : command === "score"
                  ? score
                  : answer.proposedScore;
            setNotice(
              "Выбран балл: " +
                (value?.toLocaleString("ru-RU") ?? "—") +
                ". Данные проверки не изменились.",
            );
          }}
        />
      ) : (
        <p className="rounded-lg border bg-card p-8 text-sm text-muted-foreground">
          В этой проверке пока нет распознанных ответов для примерки.
        </p>
      )}
    </div>
  );
}
