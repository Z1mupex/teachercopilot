import { z } from "zod";

const errorSchema = z.object({
  error: z.string().max(1000),
  code: z.string().max(100).optional(),
});

export async function gradingRequest<T>(
  url: string,
  body?: unknown,
): Promise<T> {
  const timeout = AbortSignal.timeout(120_000);
  try {
    const response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      credentials: "same-origin",
      signal: timeout,
      ...(body === undefined
        ? {}
        : body instanceof FormData
          ? { body }
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
    });
    if (response.redirected || response.status === 401)
      throw new GradingClientError(
        "Сессия завершилась. Войдите снова и обновите проверку.",
        401,
      );
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new GradingClientError(
        "Сервер вернул неожиданный ответ. Обновите проверку перед повтором.",
        503,
      );
    const result: unknown = await response.json();
    if (!response.ok) {
      const parsed = errorSchema.safeParse(result);
      throw new GradingClientError(
        parsed.success ? parsed.data.error : "Не удалось выполнить запрос.",
        response.status,
        parsed.success ? parsed.data.code : undefined,
      );
    }
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new GradingClientError(
        "Не удалось прочитать ответ сервера. Обновите проверку.",
        503,
      );
    return result as T;
  } catch (error) {
    if (error instanceof GradingClientError) throw error;
    throw new GradingClientError(
      timeout.aborted
        ? "Сервер не ответил вовремя. Обновите проверку: запрос мог завершиться."
        : "Связь с сервером прервалась. Обновите проверку перед повтором.",
      503,
    );
  }
}
export class GradingClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}
