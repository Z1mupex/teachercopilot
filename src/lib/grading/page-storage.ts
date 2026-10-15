import "server-only";

import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { MAX_EDGE, MAX_UPLOAD_BYTES } from "@/lib/grading/validation";
import {
  assertEditable,
  deleteBlobs,
  GradingError,
  manageUpload,
  ownedPage,
} from "@/lib/grading/repository";
import {
  analyzeScan,
  perceptualHash,
  hashDistance,
} from "@/lib/grading/scan-analysis";

export async function normalizedJpeg(bytes: Buffer, rotate = 0) {
  if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES)
    throw new GradingError("Изображение должно быть не больше 6 МБ.", 413);
  try {
    const image = sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: "error",
    });
    const metadata = await image.metadata();
    if (
      metadata.format !== "jpeg" ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) > 1
    )
      throw new Error("JPEG required");
    const result = await image
      .rotate(rotate)
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "white" })
      .jpeg({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    if (result.data.length <= 3 * 1024 * 1024) return result;
    return await sharp(result.data)
      .jpeg({ quality: 75 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new GradingError(
      "Не удалось прочитать изображение. Выберите JPG, PNG или PDF заново.",
    );
  }
}

// New paths avoid replacement races and cached stale images. Database completion
// verifies the blob exists; failure cleans up only the new, unreferenced object.
export async function storePage(
  teacherId: string,
  batchId: string,
  pageId: string,
  bytes: Buffer,
  rotation = false,
  replacementVersion?: string,
  uploadToken?: string,
) {
  const { client, batch, page } = await ownedPage(teacherId, batchId, pageId);
  assertEditable(batch);
  if (uploadToken && page.storage_path.endsWith(`/${uploadToken}.jpg`)) return;
  if (
    replacementVersion &&
    page.storage_path.split("/").at(-1) !== replacementVersion
  )
    throw new GradingError(
      "Снимок изменён в другой вкладке. Обновите список перед заменой.",
      409,
    );
  if (!rotation && page.upload_status === "stored" && !replacementVersion)
    return;
  let input = bytes;
  if (rotation) {
    if (page.upload_status !== "stored")
      throw new GradingError("Сначала загрузите эту страницу.");
    const { data, error } = await client.storage
      .from("submission-files")
      .download(page.storage_path);
    if (error || !data)
      throw new GradingError(
        "Не удалось загрузить страницу для поворота.",
        503,
      );
    input = Buffer.from(await data.arrayBuffer());
  }
  const image = await normalizedJpeg(input, rotation ? 90 : 0);
  if (image.data.length > 3 * 1024 * 1024)
    throw new GradingError(
      "Снимок слишком большой. Уменьшите его разрешение.",
      413,
    );
  const [preview, analysis] = await Promise.all([
    sharp(image.data)
      .resize({
        width: 640,
        height: 640,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 75 })
      .toBuffer(),
    sharp(image.data)
      .resize(160, 120, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer(),
  ]);
  const quality = analyzeScan(
    analysis,
    160,
    120,
    image.info.width,
    image.info.height,
  );
  const fingerprint = perceptualHash(analysis, 160, 120);
  const hash = createHash("sha256").update(image.data).digest("hex");
  const siblings = await client
    .from("submission_pages")
    .select("id,content_hash,perceptual_hash,submissions!inner(batch_id)")
    .eq("submissions.batch_id", batchId)
    .neq("id", pageId);
  if (siblings.error)
    throw new GradingError("Не удалось проверить повторные снимки.", 503);
  if (
    siblings.data.some(
      (p) =>
        p.content_hash === hash ||
        (p.perceptual_hash &&
          hashDistance(p.perceptual_hash, fingerprint) <= 2),
    )
  )
    quality.flags.push("possible_duplicate");
  const path = `${teacherId}/${batchId}/${pageId}/${uploadToken ?? randomUUID()}.jpg`;
  const previewPath = `${teacherId}/${batchId}/${pageId}/${randomUUID()}.jpg`;
  const uploaded = await Promise.all([
    client.storage.from("submission-files").upload(path, image.data, {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "0",
    }),
    client.storage
      .from("submission-files")
      .upload(previewPath, preview, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "0",
      }),
  ]);
  if (uploaded.some((result) => result.error)) {
    await deleteBlobs([path, previewPath]);
    throw new GradingError(
      "Не удалось загрузить страницу. Повторите загрузку.",
      503,
    );
  }
  try {
    await manageUpload(batchId, batch.updated_at, "store", {
      id: pageId,
      path,
      width: image.info.width,
      height: image.info.height,
      preview_path: previewPath,
      hash,
      perceptual_hash: fingerprint,
      quality,
    });
  } catch (error) {
    // A connection can fail after COMMIT. Re-read before removing the new blob.
    let linked: boolean;
    try {
      linked =
        (await ownedPage(teacherId, batchId, pageId)).page.storage_path ===
        path;
    } catch (checkError) {
      if (checkError instanceof GradingError && checkError.status === 404)
        linked = false;
      else {
        console.error("Upload acknowledgement unavailable", {
          name: checkError instanceof Error ? checkError.name : "UnknownError",
        });
        throw error;
      }
    }
    if (!linked) {
      await deleteBlobs([path, previewPath]);
      throw error;
    }
  }
  if (page.upload_status === "stored" && page.storage_path !== path)
    await deleteBlobs([
      page.storage_path,
      ...(page.preview_storage_path ? [page.preview_storage_path] : []),
    ]);
}
