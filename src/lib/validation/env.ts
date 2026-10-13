import { z } from "zod";

export const environmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .trim()
    .startsWith("sb_publishable_")
    .min(16),
});

export type Environment = z.infer<typeof environmentSchema>;

// AI configuration is independent: manual worksheets remain available without it.
export const aiEnvironmentSchema = z.object({
  GROQ_API_KEY: z.string().trim().startsWith("gsk_").min(20),
  GROQ_MODEL: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._:/-]+$/)
    .default("openai/gpt-oss-120b"),
  GROQ_VISION_MODEL: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._:/-]+$/)
    .default("qwen/qwen3.8-27b"),
});

export type AiEnvironment = z.infer<typeof aiEnvironmentSchema>;

export function parseAiEnvironment(
  input: Record<string, unknown>,
): AiEnvironment {
  const result = aiEnvironmentSchema.safeParse(input);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Invalid environment variables: ${fields.join(", ")}. Configure .env.local using .env.example.`,
    );
  }
  return result.data;
}

export function parseEnvironment(input: Record<string, unknown>): Environment {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Invalid environment variables: ${fields.join(", ")}. Configure .env.local using .env.example.`,
    );
  }

  return result.data;
}
