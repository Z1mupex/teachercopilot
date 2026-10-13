"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Check,
  Loader2,
  RefreshCw,
  RotateCw,
  SwitchCamera,
  Upload,
} from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PagePreview } from "@/components/grading/page-preview";
import { useBatchUpload } from "@/components/grading/use-batch-upload";
import { useScanCamera } from "@/components/grading/use-scan-camera";
import { captureScanFrame } from "@/lib/grading/scan-camera";
import {
  normalizeFile,
  rotateLocalPage,
  type NormalizedPage,
} from "@/lib/grading/normalize";
import { MAX_PAGES } from "@/lib/grading/validation";
import type { GradingBatch } from "@/types/grading";

const secondary = "bg-secondary text-foreground hover:bg-secondary/80";
type Capture = NormalizedPage & { url: string; attempted: boolean };
const targetSchema = z.number().int().min(1).max(MAX_PAGES);
export function BatchScan({ initial }: { initial: GradingBatch }) {
  const router = useRouter();
  const upload = useBatchUpload(initial);
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useScanCamera(videoRef);
  const stopCamera = camera.stop;
  const [capture, setCapture] = useState<Capture | null>(null);
  const currentCapture = useRef<Capture | null>(null);
  const [target, setTarget] = useState(
    String(Math.max(30, initial.pages.length)),
  );
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [working, setWorking] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const parsedTarget = targetSchema.safeParse(Number(target));
  const planned =
    parsedTarget.success && parsedTarget.data >= upload.pages.length
      ? parsedTarget.data
      : null;
  const busy = working || upload.busy;
  const canCapture =
    upload.editable &&
    upload.restored &&
    !busy &&
    !capture &&
    planned !== null &&
    upload.pages.length < planned &&
    upload.pages.length < MAX_PAGES;
  useEffect(() => {
    mounted.current = true;
    const guard = (event: BeforeUnloadEvent) => {
      if (currentCapture.current || lock.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", guard);
      if (currentCapture.current)
        URL.revokeObjectURL(currentCapture.current.url);
    };
  }, []);
  useEffect(() => {
    if (!upload.editable) stopCamera();
  }, [upload.editable, stopCamera]);
  function showCapture(page: NormalizedPage | null, attempted = false) {
    if (!mounted.current) return;
    if (currentCapture.current) URL.revokeObjectURL(currentCapture.current.url);
    const next = page
      ? { ...page, url: URL.createObjectURL(page.blob), attempted }
      : null;
    currentCapture.current = next;
    setCapture(next);
  }
  async function localWork(work: () => Promise<void>) {
    if (lock.current || upload.busy) return;
    lock.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Не удалось подготовить снимок.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  function leave() {
    if (busy) return;
    if (
      capture &&
      !upload.locals[capture.id] &&
      !upload.pages.some((page) => page.id === capture.id) &&
      !window.confirm(
        "Несохранённый снимок будет потерян. Перейти к загрузке работ?",
      )
    )
      return;
    camera.stop();
    router.push(`/grading/${initial.id}`);
  }
  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-6" aria-busy={busy}>
      <header>
        <button
          type="button"
          onClick={leave}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground disabled:opacity-50"
        >
          <ArrowLeft className="size-4" aria-hidden />К загрузке работ
        </button>
        <h1 className="mt-1 text-2xl font-bold">Batch Scan</h1>
        <p className="mt-1 break-words text-sm text-muted-foreground">
          {upload.batch.title} · один лист — одна работа
        </p>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <p
          role="status"
          aria-label="Счётчик сохранённых работ"
          className="text-xl font-bold tabular-nums"
        >
          Сохранено {upload.stored} / {planned ?? "—"}
        </p>
        <label className="flex items-center gap-2 text-sm">
          Всего листов
          <Input
            className="h-11 w-20 px-2"
            type="number"
            min={Math.max(1, upload.pages.length)}
            max={MAX_PAGES}
            step={1}
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            disabled={busy}
            aria-invalid={planned === null}
          />
        </label>
        {planned === null && (
          <p role="alert" className="w-full text-sm text-destructive">
            Укажите целое число от {Math.max(1, upload.pages.length)} до{" "}
            {MAX_PAGES}.
          </p>
        )}
      </div>
      {!upload.editable && (
        <p role="alert" className="rounded-xl border p-4">
          Проверка уже обрабатывается. Новые снимки добавить нельзя.
        </p>
      )}
      {upload.batch.answerKeyConfirmedAt && (
        <p className="text-sm text-muted-foreground">
          Добавление снимка потребует снова подтвердить ответы и баллы перед
          распознаванием.
        </p>
      )}
      <section
        aria-label={capture ? "Предпросмотр снимка" : "Камера для съёмки листа"}
        className="overflow-hidden rounded-2xl border bg-card"
      >
        <div className="relative flex h-[min(45svh,420px)] min-h-52 items-center justify-center bg-slate-950">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            onLoadedData={camera.markReady}
            onCanPlay={camera.markReady}
            className="absolute inset-0 h-full w-full object-contain"
            aria-label="Изображение с камеры"
          />
          {!capture && camera.status === "live" && (
            <div
              className="pointer-events-none absolute inset-x-[16%] inset-y-[8%] rounded-md border-2 border-dashed border-white/70"
              aria-hidden
            />
          )}
          {capture ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
              <PagePreview
                key={capture.url}
                src={capture.url}
                label="Снятый лист перед загрузкой"
              />
            </div>
          ) : (
            camera.status !== "live" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-100">
                <Camera className="mx-auto size-10" aria-hidden />
                <p className="mt-3">
                  {camera.status === "requesting"
                    ? "Разрешите доступ к камере в браузере."
                    : "Расположите лист на ровной поверхности и откройте камеру."}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Снимок отправится только после нажатия «Сохранить».
                </p>
              </div>
            )
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
          <p className="text-xs text-muted-foreground">
            {capture
              ? capture.attempted
                ? "После попытки загрузки снимок закреплён для повтора."
                : "Проверьте резкость и края листа."
              : "Рамка — ориентир. Лист автоматически не обрезается."}
          </p>
          {capture && !capture.attempted && (
            <Button
              className={secondary}
              disabled={busy}
              onClick={() =>
                localWork(async () =>
                  showCapture({
                    id: capture.id,
                    blob: await rotateLocalPage(capture.blob),
                  }),
                )
              }
            >
              <RotateCw className="size-4" aria-hidden />
              Повернуть
            </Button>
          )}
        </div>
      </section>
      {camera.error && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {camera.error}
        </p>
      )}
      {(error || upload.error) && (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {error || upload.error}
          <span className="mt-1 block">
            Снимок остаётся для повторной попытки. При конфликте обновите
            список.
          </span>
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-300"
        >
          {notice}
        </p>
      )}
      <div className="sticky bottom-0 z-10 space-y-3 rounded-2xl border bg-card/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur">
        {capture ? (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Button
              className="min-h-14 flex-1"
              disabled={busy || !upload.restored || !upload.editable}
              onClick={() =>
                localWork(async () => {
                  const page = currentCapture.current;
                  if (!page) return;
                  const attempted = { ...page, attempted: true };
                  currentCapture.current = attempted;
                  setCapture(attempted);
                  await upload.run(async () => {
                    await upload.saveCapture(page);
                    showCapture(null);
                    if (mounted.current)
                      setNotice(
                        "Лист сохранён. Поместите следующий лист перед камерой.",
                      );
                  });
                })
              }
            >
              {busy ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <Check className="size-5" aria-hidden />
              )}
              {busy
                ? "Сохраняем…"
                : capture.attempted
                  ? "Повторить загрузку"
                  : "Сохранить и следующий"}
            </Button>
            {!capture.attempted && (
              <Button
                className={secondary}
                disabled={busy}
                onClick={() => {
                  showCapture(null);
                  setError("");
                }}
              >
                Переснять
              </Button>
            )}
          </div>
        ) : camera.status === "live" ? (
          <Button
            className="min-h-14 w-full text-base"
            disabled={!canCapture || !camera.ready}
            onClick={() =>
              localWork(async () => {
                if (!videoRef.current) throw new Error("Камера недоступна.");
                showCapture({
                  id: crypto.randomUUID(),
                  blob: await captureScanFrame(videoRef.current),
                });
              })
            }
          >
            <Camera className="size-5" aria-hidden />
            {busy
              ? "Подготовка…"
              : camera.ready
                ? "Снять лист"
                : "Камера готовится…"}
          </Button>
        ) : (
          <Button
            className="min-h-14 w-full text-base"
            disabled={
              busy ||
              !upload.editable ||
              !upload.restored ||
              camera.status === "requesting"
            }
            onClick={() => camera.start(facing)}
          >
            <Camera className="size-5" aria-hidden />
            {camera.status === "requesting"
              ? "Ожидаем разрешение…"
              : "Открыть камеру"}
          </Button>
        )}
        <div className="flex flex-wrap gap-2">
          {(camera.status === "live" || camera.status === "requesting") && (
            <Button className={secondary} onClick={camera.stop}>
              <CameraOff className="size-4" aria-hidden />
              Остановить камеру
            </Button>
          )}
          {camera.status === "live" && !capture && (
            <Button
              className={secondary}
              disabled={busy}
              onClick={() => {
                const next = facing === "environment" ? "user" : "environment";
                setFacing(next);
                void camera.start(next);
              }}
            >
              <SwitchCamera className="size-4" aria-hidden />
              Сменить камеру
            </Button>
          )}
          {!capture && (
            <label
              className={`relative flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-secondary px-3 py-2 text-sm font-medium focus-within:ring-2 focus-within:ring-ring ${!canCapture ? "opacity-50" : ""}`}
            >
              <Upload className="size-4" aria-hidden />
              Фото с устройства
              <input
                className="absolute inset-0 w-full cursor-pointer opacity-0"
                aria-label="Фото листа с устройства"
                type="file"
                accept="image/jpeg,image/png"
                disabled={!canCapture}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file)
                    void localWork(async () =>
                      normalizeFile(
                        file,
                        1,
                        async (page) => showCapture(page),
                        () => {},
                      ),
                    );
                }}
              />
            </label>
          )}
          <Button
            className={secondary}
            disabled={busy || !upload.restored}
            onClick={() => upload.run(upload.refresh)}
          >
            <RefreshCw className="size-4" aria-hidden />
            Обновить список
          </Button>
        </div>
      </div>
      {planned !== null && upload.pages.length >= planned && !capture && (
        <p role="status" className="rounded-xl border p-4 text-sm">
          {upload.pending.length
            ? "Часть листов ещё не загружена. Повторите их загрузку ниже."
            : "Все запланированные листы сохранены."}{" "}
          {planned < MAX_PAGES
            ? "Для продолжения увеличьте количество листов."
            : "Достигнут лимит 100 работ."}
        </p>
      )}
      {upload.pending.length > 0 && (
        <section
          aria-labelledby="scan-pending-title"
          className="rounded-2xl border bg-card p-4"
        >
          <h2 id="scan-pending-title" className="font-semibold">
            Ожидают загрузки: {upload.pending.length}
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Снимки сохраняются в этом браузере для повтора. Если исходник
            отсутствует, выберите его на странице загрузки работ.
          </p>
          <ul className="mt-3 space-y-2">
            {upload.pages
              .filter((page) => page.status !== "stored")
              .map((page, index) => (
                <li
                  key={page.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm"
                >
                  <span>
                    Ожидающий лист {index + 1}
                    {upload.pageErrors[page.id] && (
                      <span className="block text-destructive">
                        {upload.pageErrors[page.id]}
                      </span>
                    )}
                  </span>
                  {upload.locals[page.id] && (
                    <Button
                      className={secondary}
                      disabled={busy || !!capture}
                      onClick={() =>
                        showCapture(
                          { id: page.id, blob: upload.locals[page.id].blob },
                          true,
                        )
                      }
                    >
                      Открыть для повтора
                    </Button>
                  )}
                </li>
              ))}
          </ul>
        </section>
      )}
      <Button
        className="w-full"
        disabled={
          busy ||
          !!capture ||
          upload.pages.length === 0 ||
          upload.pending.length > 0 ||
          !upload.editable
        }
        onClick={() =>
          upload.run(async () => {
            await upload.finish();
            camera.stop();
            router.push(`/grading/${initial.id}/answers`);
          })
        }
      >
        Готово, к ответам
      </Button>
      <p className="text-xs leading-5 text-muted-foreground">
        Камера останавливается при скрытии вкладки и выходе. Распознавание и
        AI-проверка здесь не запускаются. Для камеры на телефоне нужен HTTPS;
        готовое фото можно выбрать без камеры.
      </p>
    </div>
  );
}
