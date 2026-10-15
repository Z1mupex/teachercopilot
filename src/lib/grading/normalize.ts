import {
  MAX_EDGE,
  MAX_INPUT_BYTES,
  MAX_PAGES,
  MAX_UPLOAD_BYTES,
} from "@/lib/grading/validation";

export type NormalizedPage = { id: string; blob: Blob };
export async function canvasJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const quality of [0.88, 0.8, 0.7, 0.6]) {
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => {
          if (!blob)
            reject(new Error("Браузер не смог подготовить изображение."));
          else resolve(blob);
        },
        "image/jpeg",
        quality,
      ),
    );
    if (blob.size <= Math.min(MAX_UPLOAD_BYTES, 3 * 1024 * 1024)) return blob;
  }
  throw new Error("Страница слишком большая. Уменьшите исходное изображение.");
}
export async function rotateLocalPage(blob: Blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.height;
    canvas.height = bitmap.width;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas недоступен.");
    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(bitmap, 0, 0);
    return await canvasJpeg(canvas);
  } finally {
    bitmap.close();
  }
}

export async function normalizeFile(
  file: File,
  remaining: number,
  onPage: (page: NormalizedPage) => Promise<void>,
  onProgress: (text: string) => void,
) {
  if (file.size > MAX_INPUT_BYTES) throw new Error("Файл превышает 30 МБ.");
  if (remaining <= 0)
    throw new Error(`В проверке может быть не больше ${MAX_PAGES} страниц.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  if (isPdf) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const task = pdfjs.getDocument({
      data: bytes,
      stopAtErrors: true,
      cMapUrl: "/pdfjs/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/pdfjs/standard_fonts/",
      wasmUrl: "/pdfjs/wasm/",
      iccUrl: "/pdfjs/iccs/",
      useSystemFonts: true,
      enableXfa: false,
    });
    try {
      const pdf = await task.promise;
      if (pdf.numPages > remaining)
        throw new Error(
          `В PDF ${pdf.numPages} страниц; осталось мест: ${remaining}.`,
        );
      for (let number = 1; number <= pdf.numPages; number++) {
        onProgress(`Подготовка PDF: страница ${number} из ${pdf.numPages}`);
        const page = await pdf.getPage(number);
        const original = page.getViewport({ scale: 1 });
        const scale = Math.min(
          2,
          MAX_EDGE / Math.max(original.width, original.height),
        );
        const viewport = page.getViewport({ scale });
        if (
          !Number.isFinite(viewport.width) ||
          !Number.isFinite(viewport.height) ||
          viewport.width < 1 ||
          viewport.height < 1
        )
          throw new Error("Некорректный размер PDF-страницы.");
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, viewport, background: "rgb(255,255,255)" })
          .promise;
        await onPage({
          id: crypto.randomUUID(),
          blob: await canvasJpeg(canvas),
        });
        page.cleanup();
        canvas.width = 0;
        canvas.height = 0;
      }
    } finally {
      await task.destroy();
    }
    return;
  }
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes[0] === 0x89 && String.fromCharCode(...bytes.slice(1, 4)) === "PNG";
  if (!jpeg && !png) throw new Error("Поддерживаются только JPG, PNG и PDF.");
  const bitmap = await createImageBitmap(
    new Blob([bytes], { type: jpeg ? "image/jpeg" : "image/png" }),
  );
  try {
    if (bitmap.width * bitmap.height > 40_000_000)
      throw new Error("Изображение слишком большое: максимум 40 мегапикселей.");
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas недоступен.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    await onPage({ id: crypto.randomUUID(), blob: await canvasJpeg(canvas) });
  } finally {
    bitmap.close();
  }
}
