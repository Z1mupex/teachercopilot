import { canvasJpeg } from "@/lib/grading/normalize";
import { MAX_EDGE } from "@/lib/grading/validation";
import {
  analyzeScan,
  grayPixels,
  perceptualHash,
} from "@/lib/grading/scan-analysis";

export const scanConstraints = (
  facing: "environment" | "user",
): MediaStreamConstraints => ({
  audio: false,
  video: {
    facingMode: { ideal: facing },
    width: { ideal: 2400 },
    height: { ideal: 3200 },
  },
});
export function stopCameraStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}
export function cameraFailure(error: unknown) {
  const name =
    error && typeof error === "object" && "name" in error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Доступ к камере запрещён. Разрешите камеру для этого сайта в настройках браузера или выберите готовое фото.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "Камера не найдена. Подключите камеру или выберите фото с устройства.";
  if (name === "NotReadableError" || name === "TrackStartError")
    return "Камера занята другим приложением или недоступна. Закройте другие приложения с камерой и повторите попытку.";
  if (name === "OverconstrainedError")
    return "Эта камера не поддерживает выбранные параметры. Попробуйте другую камеру или готовое фото.";
  return "Не удалось открыть камеру. Повторите попытку или выберите готовое фото.";
}
export function scanDimensions(width: number, height: number) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > 16000 ||
    height > 16000
  )
    throw new Error(
      "Камера ещё не передала кадр. Подождите и попробуйте снова.",
    );
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export async function captureScanFrame(video: HTMLVideoElement) {
  if (video.readyState < 2)
    throw new Error("Изображение с камеры ещё не готово.");
  const dimensions = scanDimensions(video.videoWidth, video.videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  try {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Браузер не поддерживает обработку снимка.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await canvasJpeg(canvas);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
export async function inspectScanBlob(blob: Blob) {
  const bitmap = await createImageBitmap(blob),
    canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 120;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas недоступен.");
    ctx.drawImage(bitmap, 0, 0, 160, 120);
    const gray = grayPixels(ctx.getImageData(0, 0, 160, 120).data);
    return {
      fingerprint: perceptualHash(gray, 160, 120),
      quality: analyzeScan(gray, 160, 120, bitmap.width, bitmap.height),
    };
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
