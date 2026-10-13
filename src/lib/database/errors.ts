import "server-only";

export class DatabaseRequestError extends Error {}

export function throwDatabaseError(
  operation: string,
  error: { code?: string },
): never {
  console.error("Database request failed", { operation, code: error.code });
  throw new DatabaseRequestError("Не удалось выполнить запрос к базе данных.");
}
