"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Loader2,
  SwitchCamera,
  Upload,
  RefreshCw,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PagePreview } from "@/components/grading/page-preview";
import { useBatchUpload } from "@/components/grading/use-batch-upload";
import { useScanCamera } from "@/components/grading/use-scan-camera";
import { useAutoScan } from "@/components/grading/use-auto-scan";
import { captureScanFrame, inspectScanBlob } from "@/lib/grading/scan-camera";
import { normalizeFile } from "@/lib/grading/normalize";
import { MAX_PAGES } from "@/lib/grading/validation";
import { scanFlagLabels } from "@/lib/grading/scan-analysis";
import type { LocalPageMetadata } from "@/lib/grading/local-pages";
import type { GradingBatch } from "@/types/grading";
const states = {
  background: "Уберите лист из рамки: запоминаем пустой фон.",
  waiting: "Подложите следующий лист.",
  steady: "Держите лист неподвижно…",
  captured: "Снимок сохранён. Уберите лист и подложите следующий.",
  duplicate: "Этот лист уже снят. Уберите его и подложите следующий.",
};
const secondary = "bg-secondary text-foreground hover:bg-secondary/80";
export function BatchScan({ initial }: { initial: GradingBatch }) {
  const router = useRouter(),
    upload = useBatchUpload(initial),
    videoRef = useRef<HTMLVideoElement>(null),
    camera = useScanCamera(videoRef);
  const stopCamera = camera.stop;
  const [automatic, setAutomatic] = useState(true),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [target, setTarget] = useState(
      String(Math.max(30, initial.pages.length)),
    ),
    [pagesPerWork, setPagesPerWork] = useState(1),
    [facing, setFacing] = useState<"environment" | "user">("environment");
  const lock = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const planned = Number(target),
    validTarget =
      Number.isInteger(planned) &&
      planned >= Math.max(1, upload.pages.length) &&
      planned <= MAX_PAGES;
  const canCapture =
    upload.editable &&
    upload.restored &&
    !working &&
    validTarget &&
    upload.pages.length < planned &&
    upload.pages.length < MAX_PAGES;
  async function queue(blob: Blob, metadata: LocalPageMetadata) {
    if (!canCapture) return;
    await upload.queueCapture({ id: crypto.randomUUID(), blob }, metadata);
    if (mounted.current)
      setNotice("Лист сохранён в этом браузере. Загрузка идёт в фоне.");
  }
  const hashes = upload.pages
    .map(
      (page) =>
        upload.locals[page.id]?.metadata.fingerprint ?? page.perceptualHash,
    )
    .filter((hash): hash is string => !!hash);
  const scan = useAutoScan(
    videoRef,
    automatic &&
      camera.status === "live" &&
      camera.ready &&
      (canCapture || working),
    hashes,
    queue,
    working,
  );
  // Capture never waits for uploads. Network failures stop retries until an explicit
  // retry; immutable local IDs/tokens recover lost acknowledgements without duplicates.
  useEffect(() => {
    const ids = upload.pending.filter(
      (id) => upload.locals[id] && !upload.pageErrors[id],
    );
    if (
      !upload.restored ||
      upload.busy ||
      upload.error ||
      !ids.length ||
      !upload.editable
    )
      return;
    void upload.run(async () => {
      await upload.refresh();
      await upload.upload(ids);
    });
  }, [upload]);
  useEffect(() => {
    if (!upload.editable) stopCamera();
  }, [upload.editable, stopCamera]);
  async function manual(file?: File) {
    if (lock.current || !canCapture) return;
    lock.current = true;
    setWorking(true);
    setError("");
    try {
      let blob: Blob | undefined;
      if (file)
        await normalizeFile(
          file,
          1,
          async (page) => {
            blob = page.blob;
          },
          () => {},
        );
      else if (videoRef.current)
        blob = await captureScanFrame(videoRef.current);
      if (!blob) throw new Error("Не удалось получить снимок.");
      const metadata = await inspectScanBlob(blob);
      await queue(blob, { source: "batch_scan", ...metadata });
      scan.remember(metadata.fingerprint);
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof Error ? failure.message : "Съёмка не удалась.",
        );
    } finally {
      lock.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  function openReview() {
    camera.stop();
    router.push(`/grading/${initial.id}/scan-review?pages=${pagesPerWork}`);
  }
  const latest = upload.pages.at(-1),
    latestLocal = latest ? upload.locals[latest.id] : null;
  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-6">
      <header className="space-y-2">
        <Link href={`/grading/${initial.id}`} className="studio-text-button">
          <ArrowLeft className="size-4" />К загрузке работ
        </Link>
        <h1 className="studio-title">Batch Scan</h1>
        <p className="text-sm text-muted-foreground">{upload.batch.title}</p>
      </header>
      <section className="space-y-4 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="font-semibold tabular-nums">
            Снято {upload.pages.length} · Загружено {upload.stored}
          </p>
          <div className="flex items-center gap-3">
            <span id="automatic-scan-label" className="text-sm">
              Снимать автоматически
            </span>
            <Switch
              aria-labelledby="automatic-scan-label"
              checked={automatic}
              onCheckedChange={setAutomatic}
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span>Ожидается листов · до {MAX_PAGES}</span>
            <Input
              type="number"
              min={Math.max(1, upload.pages.length)}
              max={MAX_PAGES}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-invalid={!validTarget}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span>Листов в одной работе</span>
            <Input
              type="number"
              min={1}
              max={10}
              value={pagesPerWork}
              onChange={(e) => {
                const value = Number(e.target.value);
                if (Number.isInteger(value) && value >= 1 && value <= 10)
                  setPagesPerWork(value);
              }}
            />
          </label>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Перед запуском авто уберите лист из кадра. Подложите работу, дождитесь
          снимка и замените лист. Камера не запускает проверку ИИ. Объединение
          листов можно исправить после съёмки.
        </p>
      </section>
      {!upload.editable && (
        <p role="alert" className="text-sm">
          Эта проверка уже запущена. Новые снимки добавить нельзя.
        </p>
      )}
      <section
        aria-label="Камера Batch Scan"
        className="overflow-hidden rounded-lg border bg-card"
      >
        <div className="relative flex h-[min(50svh,460px)] min-h-56 items-center justify-center bg-slate-950">
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
          {camera.status === "live" ? (
            <div
              className="pointer-events-none absolute inset-x-[8%] inset-y-[6%] rounded border-2 border-dashed border-white/60"
              aria-hidden
            />
          ) : (
            <p className="relative p-5 text-center text-sm text-slate-200">
              {camera.status === "requesting"
                ? "Разрешите доступ к камере."
                : "Расположите телефон над стопкой и откройте камеру."}
            </p>
          )}
        </div>
        <div className="space-y-2 p-4">
          <p role="status" className="text-sm font-medium">
            {camera.status === "live"
              ? automatic
                ? states[scan.state]
                : "Ручной режим. Нажмите «Снять лист»."
              : "Камера выключена"}
          </p>
          <p className="text-xs text-muted-foreground">
            Работа № {Math.floor(upload.pages.length / pagesPerWork) + 1} · лист{" "}
            {(upload.pages.length % pagesPerWork) + 1}/{pagesPerWork}. Рамка —
            ориентир; сохраняется полный кадр.
          </p>
        </div>
      </section>
      {(camera.error || scan.error || error || upload.error) && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive"
        >
          {camera.error || scan.error || error || upload.error} Снятые листы
          остаются в браузере для повтора.
        </p>
      )}
      {notice && (
        <p role="status" className="text-xs text-primary">
          {notice}
        </p>
      )}
      <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 rounded-lg border bg-card/95 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        {camera.status === "live" ? (
          <>
            <Button
              disabled={!canCapture || !camera.ready}
              onClick={() => void manual()}
            >
              {working ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              {automatic ? "Снять вручную" : "Снять лист"}
            </Button>
            <Button className={secondary} onClick={camera.stop}>
              <Pause className="size-4" />
              Остановить
            </Button>
            <Button
              className={secondary}
              disabled={working}
              onClick={() => {
                const next = facing === "environment" ? "user" : "environment";
                setFacing(next);
                void camera.start(next);
              }}
            >
              <SwitchCamera className="size-4" />
              Сменить камеру
            </Button>
          </>
        ) : (
          <Button
            disabled={
              !upload.editable ||
              !upload.restored ||
              camera.status === "requesting"
            }
            onClick={() => camera.start(facing)}
          >
            <Camera className="size-4" />
            {camera.status === "requesting"
              ? "Ожидаем разрешение…"
              : "Открыть камеру"}
          </Button>
        )}
        <label
          className={`relative inline-flex min-h-11 items-center gap-2 rounded border px-3 text-sm ${!canCapture ? "opacity-50" : "cursor-pointer"}`}
        >
          <Upload className="size-4" />
          Фото
          <input
            type="file"
            accept="image/jpeg,image/png"
            aria-label="Фото листа с устройства"
            className="absolute inset-0 w-full opacity-0"
            disabled={!canCapture}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void manual(file);
            }}
          />
        </label>
        <Button
          className={secondary}
          disabled={upload.busy || !upload.restored}
          onClick={() =>
            upload.run(async () => {
              await upload.refresh();
              await upload.upload(
                upload.pending.filter((id) => upload.locals[id]),
              );
            })
          }
        >
          <RefreshCw className="size-4" />
          Повторить загрузку
        </Button>
        <Button
          disabled={!upload.pages.length || working || !upload.editable}
          onClick={openReview}
        >
          <CameraOff className="size-4" />
          Завершить съёмку и проверить листы
        </Button>
      </div>
      {latest && (
        <section className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-[120px_minmax(0,1fr)]">
          <div className="flex h-36 items-center justify-center bg-secondary/30">
            <PagePreview
              src={
                latestLocal?.url ??
                `/grading/${initial.id}/pages/${latest.id}?preview=1&v=${latest.imageVersion}`
              }
              label="Последний снятый лист"
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-semibold">
              Последний лист · {upload.pages.length}
            </p>
            <p className="text-xs text-muted-foreground">
              {latest.status === "stored"
                ? "Загружен"
                : (upload.pageErrors[latest.id] ??
                  "Сохранён локально, ожидает загрузки")}
            </p>
            {(latest.quality ?? latestLocal?.metadata.quality)?.flags.map(
              (flag) => (
                <p key={flag} className="text-xs text-destructive">
                  {scanFlagLabels[flag]}
                </p>
              ),
            )}
            <p className="text-xs leading-5 text-muted-foreground">
              После съёмки нужно просмотреть все листы. Подозрительные снимки
              будут выделены в галерее.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
