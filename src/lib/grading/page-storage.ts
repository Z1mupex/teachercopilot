import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { MAX_EDGE, MAX_UPLOAD_BYTES } from "@/lib/grading/validation";
import {
  assertEditable,
  deleteBlob,
  GradingError,
  manageUpload,
  ownedPage,
} from "@/lib/grading/repository";

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
    return await image
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
) {
  const { client, batch, page } = await ownedPage(teacherId, batchId, pageId);
  assertEditable(batch);
  if (!rotation && page.upload_status === "stored") return;
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
  const path = `${teacherId}/${batchId}/${pageId}/${randomUUID()}.jpg`;
  const { error } = await client.storage
    .from("submission-files")
    .upload(path, image.data, {
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: "0",
    });
  if (error)
    throw new GradingError(
      "Не удалось загрузить страницу. Повторите загрузку.",
      503,
    );
  try {
    await manageUpload(batchId, batch.updated_at, "store", {
      id: pageId,
      path,
      width: image.info.width,
      height: image.info.height,
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
      await deleteBlob(path);
      throw error;
    }
  }
  if (page.upload_status === "stored" && page.storage_path !== path)
    await deleteBlob(page.storage_path);
}
