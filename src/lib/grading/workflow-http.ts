import "server-only";
import { z } from "zod";
import { GradingError } from "@/lib/grading/repository";
import { AiRequestError } from "@/lib/ai/errors";
import { gradingAiMessage } from "@/lib/grading/ai-errors";
export const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
export function assertSameOrigin(request: Request) {
  let same = false;
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    same =
      ["http:", "https:"].includes(origin.protocol) &&
      origin.host === request.headers.get("host") &&
      request.headers.get("sec-fetch-site") !== "cross-site";
  } catch {
    same = false;
  }
  if (!same) throw new GradingError("Недопустимый источник запроса.", 403);
}
export async function readWorkflowJson(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new GradingError("Нужен JSON.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new GradingError("Пустой запрос.", 400);
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 4096) {
        await reader.cancel();
        throw new GradingError("Запрос слишком большой.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
export function workflowResponse(error: unknown) {
  if (error instanceof GradingError)
    return Response.json(
      { error: error.message },
      { status: error.status, headers: privateHeaders },
    );
  if (error instanceof AiRequestError)
    return Response.json(
      { error: gradingAiMessage(error), code: error.code },
      {
        status:
          error.code === "rate_limit" || error.code === "busy" ? 429 : 503,
        headers: privateHeaders,
      },
    );
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return Response.json(
      { error: "Проверьте данные запроса." },
      { status: 422, headers: privateHeaders },
    );
  console.error("Grading workflow failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return Response.json(
    { error: "Не удалось выполнить запрос. Попробуйте позже." },
    { status: 503, headers: privateHeaders },
  );
}
