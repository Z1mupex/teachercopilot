import { requireUser } from "@/lib/auth/session";
import { getAnswerKey } from "@/lib/grading/answer-key-repository";
import { GradingError } from "@/lib/grading/repository";
import {
  idSchema,
  revisionSchema,
  MAX_UPLOAD_BYTES,
} from "@/lib/grading/validation";
import {
  answerSourceSchema,
  MAX_ANSWER_BODY,
  MAX_ANSWER_PAGES,
} from "@/lib/grading/answer-key-validation";
import { normalizedJpeg } from "@/lib/grading/page-storage";
import { parseAnswerKey } from "@/lib/ai/parse-answer-key";
import { AiRequestError } from "@/lib/ai/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const user = await requireUser("/grading");
  const { batchId } = await params;
  if (!idSchema.safeParse(batchId).success)
    return new Response(null, { status: 404, headers });
  try {
    let sameOrigin = false;
    try {
      const origin = new URL(request.headers.get("origin") ?? "");
      sameOrigin =
        ["http:", "https:"].includes(origin.protocol) &&
        origin.host === request.headers.get("host") &&
        request.headers.get("sec-fetch-site") !== "cross-site";
    } catch {
      sameOrigin = false;
    }
    if (!sameOrigin)
      throw new GradingError("Недопустимый источник запроса.", 403);
    const current = await getAnswerKey(user.id, batchId);
    if (!current) throw new GradingError("Проверка недоступна.", 404);
    if (!current.editable)
      throw new GradingError(
        "Сначала завершите загрузку страниц. Обрабатываемые проверки защищены от изменений.",
        409,
      );
    if (
      !request.headers.get("content-type")?.startsWith("multipart/form-data;")
    )
      throw new GradingError("Выберите изображения или PDF.", 415);
    // Bound the actual streamed body before parsing multipart, ignoring claimed size.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (!reader) throw new GradingError("Выберите документ.");
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_ANSWER_BODY) {
          await reader.cancel();
          throw new GradingError(
            "Подготовленные страницы превышают 12 МБ. Уменьшите файл.",
            413,
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const multipart = await new Response(
      new Uint8Array(Buffer.concat(chunks)),
      { headers: { "Content-Type": request.headers.get("content-type")! } },
    ).formData();
    const source = answerSourceSchema.safeParse(multipart.get("source"));
    const revision = revisionSchema.safeParse(multipart.get("revision"));
    if (
      !source.success ||
      !["photo", "file", "solved_teacher"].includes(source.data) ||
      !revision.success
    )
      throw new GradingError("Проверьте источник ответов.");
    if (revision.data !== current.revision)
      throw new GradingError(
        "Проверка изменена в другой вкладке. Обновите страницу.",
        409,
      );
    const files = multipart.getAll("pages");
    if (files.length < 1 || files.length > MAX_ANSWER_PAGES)
      throw new GradingError("Выберите документ с 1–3 страницами.");
    const images: Buffer[] = [];
    for (const file of files) {
      if (
        !(file instanceof File) ||
        file.type !== "image/jpeg" ||
        file.size > MAX_UPLOAD_BYTES
      )
        throw new GradingError(
          "Нужны подготовленные JPG-страницы до 6 МБ.",
          415,
        );
      images.push(
        (await normalizedJpeg(Buffer.from(await file.arrayBuffer()))).data,
      );
    }
    const data = await parseAnswerKey(
      user.id,
      current.document.title,
      source.data as "photo" | "file" | "solved_teacher",
      images,
    );
    return Response.json({ data, revision: current.revision }, { headers });
  } catch (error) {
    if (error instanceof AiRequestError)
      return Response.json(
        {
          error:
            error.code === "invalid_output"
              ? "Не удалось надёжно распознать ответы. Выберите более чёткий документ или введите ответы вручную."
              : error.message,
        },
        { status: 503, headers },
      );
    if (error instanceof GradingError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      );
    console.error("Answer key parsing failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      {
        error:
          "Не удалось распознать документ. Попробуйте ещё раз или введите ответы вручную.",
      },
      { status: 503, headers },
    );
  }
}
