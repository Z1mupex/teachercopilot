"use client";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  CheckCircle2,
  FileUp,
  Loader2,
  RefreshCw,
  RotateCw,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { secondaryButtonClass } from "@/components/worksheets/labels";
import { useBatchUpload } from "./use-batch-upload";
import type { GradingBatch } from "@/types/grading";
import { GradingSteps } from "@/components/grading/grading-steps";
import { PagePreview } from "@/components/grading/page-preview";

export function BatchUpload({ initial }: { initial: GradingBatch }) {
  const {
    batch,
    pages,
    locals,
    busy,
    restored,
    error,
    progress,
    pageErrors,
    active,
    files,
    editable,
    stored,
    pending,
    run,
    prepare,
    upload,
    rotate,
    remove,
    move,
    refresh,
    finish,
  } = useBatchUpload(initial);
  return (
    <div className="space-y-6" aria-busy={busy}>
      <GradingSteps current={0} batchId={batch.id} />
      {["processing", "review", "completed"].includes(batch.status) && (
        <div className="flex flex-wrap justify-end gap-3">
          <Link
            href={`/grading/${batch.id}/process`}
            className={secondaryButtonClass}
          >
            Прогресс распознавания
          </Link>
          <Link
            href={`/grading/${batch.id}/${batch.status === "completed" ? "results" : "review"}`}
            className={secondaryButtonClass}
          >
            {batch.status === "completed"
              ? "Итоговые результаты"
              : "Проверить ответы"}
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5">
        <div>
          <h2 className="text-lg font-semibold">Работы учеников</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Загружено {stored} / {pages.length} листов. Работ:{" "}
            {new Set(pages.map((page) => page.submissionId)).size}.
          </p>
        </div>
        <button
          className={secondaryButtonClass}
          disabled={busy}
          onClick={() => run(refresh)}
        >
          <RefreshCw className="size-4" />
          Обновить список
        </button>
        <Progress
          aria-label="Прогресс загрузки"
          value={stored}
          max={Math.max(1, pages.length)}
        />
      </div>
      {editable && pages.length > 0 && (
        <Link
          href={`/grading/${batch.id}/scan-review`}
          className={secondaryButtonClass}
        >
          Просмотреть листы и объединить в работы
        </Link>
      )}
      {batch.status === "ready" && (
        <p
          role="status"
          className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300"
        >
          <CheckCircle2 className="size-5 shrink-0" />
          Все страницы сохранены. Проверка готова к добавлению ответов.
        </p>
      )}
      {batch.status === "ready" && (
        <div className="flex justify-end">
          <Link
            href={`/grading/${batch.id}/answers`}
            className={secondaryButtonClass}
          >
            {batch.answerKeyConfirmedAt
              ? "Посмотреть ответы"
              : "Добавить ответы →"}
          </Link>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {editable && (
        <div
          className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-7 text-center"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (!busy && restored)
              void run(() => prepare(Array.from(event.dataTransfer.files)));
          }}
        >
          <UploadCloud className="mx-auto mb-3 size-10 text-primary" />
          <h3 className="text-lg font-semibold">Перетащите файлы сюда</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            JPG, PNG или PDF · до 30 МБ на файл · до 100 страниц в проверке
          </p>
          <label
            className={`${secondaryButtonClass} relative mt-4 cursor-pointer focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background`}
          >
            <FileUp className="size-4" />
            Выбрать файлы
            <input
              aria-label="Файлы работ учеников"
              className="absolute inset-0 w-full cursor-pointer opacity-0"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              multiple
              disabled={busy || !restored}
              onChange={(event) => {
                const selected = Array.from(event.target.files ?? []);
                event.target.value = "";
                void run(() => prepare(selected));
              }}
            />
          </label>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            PDF будет разделён на страницы. До загрузки можно повернуть
            изображения и проверить порядок.
          </p>
          <Link
            href={`/grading/${batch.id}/scan`}
            className={`${secondaryButtonClass} mt-4`}
          >
            <Camera className="size-4" aria-hidden />
            Batch Scan · снять стопку работ
          </Link>
        </div>
      )}
      {files.length > 0 && (
        <ul
          className="space-y-2 rounded-xl border bg-card p-4 text-sm"
          aria-label="Подготовка файлов"
        >
          {files.map((file) => (
            <li key={file.id} className="flex flex-wrap justify-between gap-2">
              <span className="min-w-0 break-all">{file.name}</span>
              <span
                className={
                  file.error ? "text-destructive" : "text-muted-foreground"
                }
              >
                {file.status}
              </span>
            </li>
          ))}
        </ul>
      )}
      {progress && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-primary"
        >
          <Loader2 className="size-4 animate-spin" />
          {progress}
        </p>
      )}
      {pages.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Здесь появится предпросмотр загруженных страниц.
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {pages.map((page, index) => (
          <article
            key={page.id}
            className="min-w-0 overflow-hidden rounded-2xl border bg-card"
            aria-label={`Лист ${index + 1}`}
          >
            <div className="flex items-center justify-between gap-3 border-b p-4">
              <h3 className="font-semibold">
                Лист {index + 1} · работа{" "}
                {Array.from(new Set(pages.map((p) => p.submissionId))).indexOf(
                  page.submissionId,
                ) + 1}
              </h3>
              <span
                className={`text-xs ${pageErrors[page.id] ? "text-destructive" : "text-muted-foreground"}`}
              >
                {active === page.id
                  ? "Загружается…"
                  : pageErrors[page.id]
                    ? "Ошибка загрузки"
                    : page.status === "stored"
                      ? "Загружена"
                      : "Ожидает загрузки"}
              </span>
            </div>
            <div className="flex h-64 items-center justify-center bg-secondary/40 p-3">
              {locals[page.id] || page.status === "stored" ? (
                <PagePreview
                  key={
                    locals[page.id]?.url ?? `${page.id}-${page.imageVersion}`
                  }
                  src={
                    locals[page.id]?.url ??
                    `/grading/${batch.id}/pages/${page.id}?preview=1&v=${page.imageVersion}`
                  }
                  label={`Страница работы ${index + 1}`}
                />
              ) : (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  Исходное изображение не найдено в этом браузере. Выберите его
                  заново.
                </p>
              )}
            </div>
            {editable && (
              <div className="flex flex-wrap gap-2 p-3">
                {[
                  {
                    label: "Повернуть",
                    icon: RotateCw,
                    work: () => rotate(page),
                    disabled: page.status !== "stored" && !locals[page.id],
                  },
                  {
                    label: "Вверх",
                    icon: ArrowUp,
                    work: () => move(index, -1),
                    disabled: index === 0,
                  },
                  {
                    label: "Вниз",
                    icon: ArrowDown,
                    work: () => move(index, 1),
                    disabled: index === pages.length - 1,
                  },
                  {
                    label: "Удалить",
                    icon: Trash2,
                    work: () => remove(page.id),
                    disabled: false,
                  },
                ].map((control) => (
                  <button
                    key={control.label}
                    aria-label={`${control.label} работу ${index + 1}`}
                    title={control.label}
                    className="inline-flex size-11 items-center justify-center rounded-lg border hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                    disabled={busy || control.disabled}
                    onClick={() => run(control.work)}
                  >
                    <control.icon className="size-4" />
                  </button>
                ))}
                {page.status !== "stored" && locals[page.id] && (
                  <button
                    className="ml-auto min-h-11 rounded-lg px-2 text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    disabled={busy}
                    onClick={() => run(() => upload([page.id]))}
                  >
                    {pageErrors[page.id] ? "Повторить загрузку" : "Загрузить"}
                  </button>
                )}
                {page.status !== "stored" && !locals[page.id] && (
                  <label className="relative inline-flex min-h-11 cursor-pointer items-center rounded-lg px-2 text-xs font-medium text-primary focus-within:ring-2 focus-within:ring-ring">
                    Выбрать изображение
                    <input
                      className="absolute inset-0 w-full opacity-0"
                      type="file"
                      accept="image/jpeg,image/png"
                      aria-label={`Изображение работы ${index + 1}`}
                      disabled={busy}
                      onChange={(event) => {
                        const selected = Array.from(event.target.files ?? []);
                        event.target.value = "";
                        void run(() => prepare(selected, page.id));
                      }}
                    />
                  </label>
                )}
              </div>
            )}
            {pageErrors[page.id] && (
              <p role="alert" className="px-4 pb-4 text-sm text-destructive">
                {pageErrors[page.id]}
              </p>
            )}
          </article>
        ))}
      </div>
      {editable && (
        <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
          <Button
            disabled={busy || pending.length === 0}
            onClick={() => run(() => upload(pending))}
          >
            <UploadCloud className="size-4" />
            {stored > 0 ? "Загрузить оставшиеся" : "Загрузить все страницы"}
          </Button>
          <button
            className={secondaryButtonClass}
            disabled={
              busy ||
              pages.length === 0 ||
              stored !== pages.length ||
              batch.status === "ready" ||
              (batch.scanReviewRequired && pages.some((page) => !page.reviewed))
            }
            onClick={() => run(finish)}
          >
            Завершить загрузку
          </button>
        </div>
      )}
    </div>
  );
}
