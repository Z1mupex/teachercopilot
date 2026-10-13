import "server-only";

import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function adaptDifficulty(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(adaptDifficulty);
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const levels = isObject(child) ? child.enum : undefined;
    if (
      key === "difficulty" &&
      isObject(child) &&
      Array.isArray(levels) &&
      levels.length === 3 &&
      ["easy", "medium", "hard"].every((level) => levels.includes(level))
    ) {
      // Groq treats the repeated difficulty enum as a second discriminator
      // beside type and rejects the union. A pattern avoids that ambiguity;
      // the original Zod enum still validates every parsed provider response.
      delete child.enum;
      child.pattern = "^(easy|medium|hard)$";
    }
    adaptDifficulty(child);
  }
}

export function groqTextFormat<Schema extends z.ZodType>(
  schema: Schema,
  name: string,
) {
  const format = zodTextFormat(schema, name);
  adaptDifficulty(format.schema);
  return format;
}
