import "server-only";

import {
  aiEnvironmentSchema,
  environmentSchema,
  parseAiEnvironment,
  parseEnvironment,
} from "@/lib/validation/env";

// Missing configuration is a closed authentication state, never a development bypass.
export function isSupabaseConfigured() {
  return environmentSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  }).success;
}

export function getEnvironment() {
  return parseEnvironment({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function isAiConfigured() {
  return aiEnvironmentSchema.safeParse({
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL,
    GROQ_VISION_MODEL: process.env.GROQ_VISION_MODEL,
  }).success;
}

export function getAiEnvironment() {
  return parseAiEnvironment({
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL,
    GROQ_VISION_MODEL: process.env.GROQ_VISION_MODEL,
  });
}
