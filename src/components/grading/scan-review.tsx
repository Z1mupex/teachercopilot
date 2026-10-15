"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AlertTriangle,
  RotateCw,
  RefreshCw,
  Upload,
  Check,
} from "lucide-react";
import { useBatchUpload } from "@/components/grading/use-batch-upload";
import { PagePreview } from "@/components/grading/page-preview";
import { Button } from "@/components/ui/button";
import { confirmScanReview } from "@/actions/scan-review";
import { scanFlagLabels } from "@/lib/grading/scan-analysis";
import { MAX_WORK_PAGES } from "@/lib/grading/scan-validation";
import {
  selectClass,
  secondaryButtonClass,
} from "@/components/worksheets/labels";
import type { GradingBatch } from "@/types/grading";
export function ScanReview({
  initial,
  pagesPerWork = 1,
}: {
  initial: GradingBatch;
  pagesPerWork?: number;
}) {
  const u = useBatchUpload(initial),
    router = useRouter();
  const [overrides, setOverrides] = useState<Record<string, string>>({}),
    [seen, setSeen] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        initial.pages
          .filter((p) => p.reviewed)
          .map((p) => [p.id, p.imageVersion]),
      ),
    ),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const groupedAlready = initial.pages.some((p) => p.pageIndex > 0);
  const defaultMap = Object.fromEntries(
    u.pages.map((p, i) => [
      p.id,
      groupedAlready
        ? p.submissionId
        : (u.pages[Math.floor(i / pagesPerWork) * pagesPerWork]?.submissionId ??
          p.submissionId),
    ]),
  );
  const groups: { id: string; pages: string[] }[] = [];
  for (const p of u.pages) {
    const id = overrides[p.id] ?? defaultMap[p.id];
    let group = groups.find((g) => g.id === id);
    if (!group) {
      group = { id, pages: [] };
      groups.push(group);
    }
    group.pages.push(p.id);
  }
  const ready =
    u.pages.length > 0 &&
    u.pending.length === 0 &&
    u.pages.every((p) => seen[p.id] === p.imageVersion) &&
    groups.every((g) => g.pages.length <= MAX_WORK_PAGES);
  const busy = u.busy || saving;
  useEffect(() => {
    const ids = u.pending.filter(
      (id) =>
        u.locals[id]?.metadata.source === "batch_scan" && !u.pageErrors[id],
    );
    if (!u.restored || u.busy || u.error || !ids.length || !u.editable) return;
    void u.run(async () => {
      await u.refresh();
      await u.upload(ids);
    });
  }, [u]);
  async function finish() {
    if (!ready || busy) return;
    setSaving(true);
    setError("");
    try {
      const result = await confirmScanReview({
        batch: initial.id,
        revision: u.batch.revision,
        groups,
        reviews: u.pages.map((p) => ({ id: p.id, version: p.imageVersion })),
        confirmed: true,
      });
      if ("error" in result) {
        setError(result.error ?? "Не удалось сохранить просмотр.");
        return;
      }
      router.push(`/grading/${initial.id}/answers`);
      router.refresh();
    } catch {
      setError("Ответ сервера не получен. Обновите галерею перед повтором.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="min-w-0 space-y-5">
      <header className="space-y-2">
        <Link
          href={`/grading/${initial.id}/scan`}
          className="studio-text-button"
        >
          <ArrowLeft className="size-4" />К сканеру
        </Link>
        <h1 className="studio-title">Проверить сканы</h1>
        <p className="break-words text-sm text-muted-foreground">
          {initial.title}
        </p>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <p className="font-semibold">
            {u.pages.length} листов · {groups.length} работ
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Откройте подозрительные снимки, исправьте группировку и отметьте
            каждый просмотренный лист. Подсказки качества приблизительные.
          </p>
        </div>
        <button
          className={secondaryButtonClass}
          disabled={busy}
          onClick={() => u.run(u.refresh)}
        >
          <RefreshCw className="size-4" />
          Обновить
        </button>
      </div>
      {(error || u.error) && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          {error || u.error}
        </p>
      )}
      {!u.editable && (
        <p className="text-sm">
          Проверка уже запущена. Листы доступны только для просмотра.
        </p>
      )}
      {u.pending.length > 0 && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm">
            Ожидают загрузки: {u.pending.length}. Сначала сохраните все листы.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              u.run(async () => {
                await u.refresh();
                await u.upload(u.pending.filter((id) => u.locals[id]));
              })
            }
          >
            Загрузить оставшиеся
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {u.pages.map((page, index) => {
          const flags =
              (u.locals[page.id]?.metadata.quality ?? page.quality)?.flags ??
              [],
            groupId = overrides[page.id] ?? defaultMap[page.id],
            groupIndex = groups.findIndex((g) => g.id === groupId);
          return (
            <article
              key={page.id}
              aria-label={`Лист ${index + 1}`}
              className={`min-w-0 overflow-hidden rounded-lg border bg-card ${flags.length ? "border-amber-500/70" : ""}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <h2 className="text-sm font-semibold">
                  Лист {index + 1} · Работа {groupIndex + 1}
                </h2>
                {flags.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-3.5" />
                    Нужно внимание
                  </span>
                )}
              </div>
              <div className="flex h-72 items-center justify-center bg-secondary/30 p-3">
                {page.status === "stored" || u.locals[page.id] ? (
                  <PagePreview
                    key={u.locals[page.id]?.url ?? page.imageVersion}
                    src={
                      u.locals[page.id]?.url ??
                      `/grading/${initial.id}/pages/${page.id}?preview=1&v=${page.imageVersion}`
                    }
                    label={`Скан листа ${index + 1}`}
                  />
                ) : (
                  <p className="text-sm">В этом браузере нет исходника.</p>
                )}
              </div>
              <div className="space-y-3 p-4">
                {flags.map((flag) => (
                  <p
                    key={flag}
                    className="text-xs text-amber-700 dark:text-amber-300"
                  >
                    {scanFlagLabels[flag]}
                  </p>
                ))}
                {page.status === "stored" && (
                  <a
                    href={`/grading/${initial.id}/pages/${page.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline"
                  >
                    Открыть полный снимок
                  </a>
                )}
                {u.editable && (
                  <>
                    <label className="block space-y-1 text-xs">
                      <span>В какую работу входит лист</span>
                      <select
                        className={selectClass}
                        value={groupId}
                        disabled={busy}
                        onChange={(e) =>
                          setOverrides((v) => ({
                            ...v,
                            [page.id]:
                              e.target.value === "new"
                                ? crypto.randomUUID()
                                : e.target.value,
                          }))
                        }
                      >
                        {groups.map((g, i) => (
                          <option key={g.id} value={g.id}>
                            Работа {i + 1} · {g.pages.length} листов
                          </option>
                        ))}
                        <option value="new">Отдельная новая работа</option>
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={secondaryButtonClass}
                        disabled={busy || page.status !== "stored"}
                        onClick={() => u.run(() => u.rotate(page))}
                      >
                        <RotateCw className="size-4" />
                        Повернуть
                      </button>
                      <label
                        className={`relative inline-flex min-h-11 items-center gap-2 rounded border px-3 text-sm ${busy ? "opacity-50" : "cursor-pointer"}`}
                      >
                        <Upload className="size-4" />
                        Заменить снимок
                        <input
                          className="absolute inset-0 w-full opacity-0"
                          type="file"
                          accept="image/jpeg,image/png"
                          aria-label={`Заменить снимок листа ${index + 1}`}
                          disabled={busy}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file)
                              void u.run(async () => {
                                await u.prepare([file], page.id);
                                await u.upload([page.id]);
                              });
                          }}
                        />
                      </label>
                    </div>
                    <label className="flex min-h-11 items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={
                          page.status === "stored" &&
                          seen[page.id] === page.imageVersion
                        }
                        disabled={busy || page.status !== "stored"}
                        onChange={(e) =>
                          setSeen((v) => ({
                            ...v,
                            [page.id]: e.target.checked
                              ? page.imageVersion
                              : "",
                          }))
                        }
                      />
                      Лист просмотрен, изображение подходит
                    </label>
                  </>
                )}
                {u.pageErrors[page.id] && (
                  <p role="alert" className="text-xs text-destructive">
                    {u.pageErrors[page.id]}
                  </p>
                )}
                {groups[groupIndex]?.pages.length > MAX_WORK_PAGES && (
                  <p role="alert" className="text-xs text-destructive">
                    В одной работе не больше {MAX_WORK_PAGES} листов. Разделите
                    группу.
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {u.editable && (
        <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/95 p-4 backdrop-blur">
          <p className="text-xs text-muted-foreground">
            Просмотрено{" "}
            {
              u.pages.filter(
                (p) => p.status === "stored" && seen[p.id] === p.imageVersion,
              ).length
            }
            /{u.pages.length}. Проверка ИИ начнётся только по вашему запросу.
          </p>
          <Button disabled={!ready || busy} onClick={() => void finish()}>
            <Check className="size-4" />
            {saving ? "Сохраняем…" : "Подтвердить листы и группировку"}
          </Button>
        </footer>
      )}
    </div>
  );
}
