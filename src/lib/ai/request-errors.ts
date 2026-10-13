import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { AiRequestError } from "@/lib/ai/errors";

export function safeIdentifier(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value)
    ? value
    : undefined;
}

export function safeTokenCount(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 2_147_483_647)
    : undefined;
}

export function requestError(error: unknown): AiRequestError {
  if (error instanceof AiRequestError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError)
    return new AiRequestError("timeout");
  if (error instanceof OpenAI.APIConnectionError)
    return new AiRequestError("network");
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      if (error.code === "credit_balance_exhausted")
        return new AiRequestError("credits_exhausted");
      if (
        error.code === "insufficient_quota" ||
        error.code === "organization_spend_limit_exceeded" ||
        error.code === "project_spend_limit_exceeded" ||
        error.code === "organization_usage_limit_exceeded" ||
        error.type === "insufficient_quota"
      )
        return new AiRequestError("billing");
      return new AiRequestError("rate_limit");
    }
    if ([400, 401, 403, 404, 422].includes(error.status ?? 0))
      return new AiRequestError("provider_configuration");
    return new AiRequestError("provider");
  }
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return new AiRequestError("invalid_output");
  return new AiRequestError("provider");
}
