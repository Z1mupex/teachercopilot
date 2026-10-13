import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { getBatch, GradingError, ownedPage } from "@/lib/grading/repository";
import { storePage } from "@/lib/grading/page-storage";
import { idSchema, MAX_UPLOAD_BYTES } from "@/lib/grading/validation";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
type Context = { params: Promise<{ batchId: string; pageId: string }> };

function report(error: unknown) {
  if (error instanceof GradingError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers },
    );
  console.error("Grading page request failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return Response.json(
    { error: "Не удалось выполнить запрос. Попробуйте ещё раз." },
    { status: 503, headers },
  );
}

export async function GET(request: Request, { params }: Context) {
  const user = await requireUser("/grading");
  const { batchId, pageId } = await params;
  if (
    !idSchema.safeParse(batchId).success ||
    !idSchema.safeParse(pageId).success
  )
    return new Response(null, { status: 404, headers });
  try {
    const { client, page } = await ownedPage(user.id, batchId, pageId);
    if (page.upload_status !== "stored")
      throw new GradingError("Страница ещё не загружена.", 404);
    const { data, error } = await client.storage
      .from("submission-files")
      .download(page.storage_path);
    if (error || !data)
      throw new GradingError("Не удалось загрузить изображение.", 503);
    if (data.size > MAX_UPLOAD_BYTES)
      throw new GradingError("Страница превышает допустимый размер.", 413);
    if (new URL(request.url).searchParams.get("preview") === "1") {
      const preview = await sharp(Buffer.from(await data.arrayBuffer()), {
        limitInputPixels: 40_000_000,
      })
        .resize({
          width: 640,
          height: 640,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 75 })
        .toBuffer();
      return new Response(new Uint8Array(preview), {
        headers: { ...headers, "Content-Type": "image/jpeg" },
      });
    }
    return new Response(data, {
      headers: { ...headers, "Content-Type": "image/jpeg" },
    });
  } catch (error) {
    return report(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  const user = await requireUser("/grading");
  const { batchId, pageId } = await params;
  if (
    !idSchema.safeParse(batchId).success ||
    !idSchema.safeParse(pageId).success
  )
    return new Response(null, { status: 404, headers });
  // Cookie-authenticated binary mutations need CSRF protection outside Actions.
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try {
    const parsedOrigin = new URL(origin ?? "");
    // Next can use its internal hostname in request.url behind a proxy. Host
    // is the browser's destination; never trust a caller's forwarded-host.
    sameOrigin =
      ["http:", "https:"].includes(parsedOrigin.protocol) &&
      parsedOrigin.host === request.headers.get("host") &&
      request.headers.get("sec-fetch-site") !== "cross-site";
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin)
    return Response.json(
      { error: "Недопустимый источник запроса." },
      { status: 403, headers },
    );
  try {
    const rotation = new URL(request.url).searchParams.get("rotate") === "90";
    if (!rotation && request.headers.get("content-type") !== "image/jpeg")
      throw new GradingError("Нужен нормализованный JPG.", 415);
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > MAX_UPLOAD_BYTES) {
            await reader.cancel();
            throw new GradingError("Страница превышает 6 МБ.", 413);
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    await storePage(user.id, batchId, pageId, Buffer.concat(chunks), rotation);
    revalidatePath("/grading");
    revalidatePath(`/grading/${batchId}`);
    revalidatePath("/dashboard");
    return Response.json(
      { batch: await getBatch(user.id, batchId) },
      { headers },
    );
  } catch (error) {
    return report(error);
  }
}
