import "server-only";

import OpenAI from "openai";

import { AiRequestError } from "@/lib/ai/errors";
import { getAiEnvironment, isAiConfigured } from "@/lib/env";

export const AI_REQUEST_TIMEOUT_MS = 45_000;

export function getAiClient() {
  if (!isAiConfigured()) throw new AiRequestError("not_configured");
  const environment = getAiEnvironment();
  return {
    model: environment.GROQ_MODEL,
    visionModel: environment.GROQ_VISION_MODEL,
    client: new OpenAI({
      apiKey: environment.GROQ_API_KEY,
      // Groq supports the SDK's Responses API and strict Structured Outputs.
      // Keep this origin fixed: environment overrides cannot redirect the key.
      baseURL: "https://api.groq.com/openai/v1",
      timeout: AI_REQUEST_TIMEOUT_MS,
      // Generation is not idempotent. Retry explicitly instead of spending quota
      // twice after an ambiguous provider/network acknowledgement.
      maxRetries: 0,
      // Keep prompt/response bodies out of SDK logs even if OPENAI_LOG=debug.
      logLevel: "off",
    }),
  };
}
