import "server-only";

import { createHash } from "node:crypto";
import OpenAI from "openai";
import { z } from "zod";

import { getAiClient } from "@/lib/ai/client";
import { AiRequestError } from "@/lib/ai/errors";
import { groqTextFormat } from "@/lib/ai/schemas/groq-text-format";
import {
  generationPrompt,
  regenerationPrompt,
  worksheetSystemPrompt,
} from "@/lib/ai/prompts/worksheet";
import {
  finishAiRun,
  reserveAiRun,
  type AiPurpose,
  type AiRunMetadata,
} from "@/lib/ai/runs";
import {
  aiRegenerationOutputSchema,
  aiWorksheetOutputSchema,
} from "@/lib/ai/schemas/worksheet-output";
import {
  allocateDifficultyCounts,
  transformGeneratedWorksheet,
  transformRegeneratedQuestion,
} from "@/lib/ai/worksheet-transform";
import type {
  GenerateWorksheetInput,
  RegenerateQuestionInput,
} from "@/lib/validation/ai-worksheets";
import type { QuestionInput, WorksheetInput } from "@/types/worksheets";

import {
  safeIdentifier,
  safeTokenCount,
  requestError,
} from "@/lib/ai/request-errors";

export async function runStructuredRequest<Schema extends z.ZodType, Result>({
  teacherId,
  purpose,
  prompt,
  schema,
  schemaName,
  maxOutputTokens,
  convert,
  systemPrompt = worksheetSystemPrompt,
}: {
  teacherId: string;
  purpose: AiPurpose;
  prompt: string;
  schema: Schema;
  schemaName: string;
  maxOutputTokens: number;
  convert: (value: z.output<Schema>) => Result;
  systemPrompt?: string;
}): Promise<Result> {
  // Configuration is checked before reserving a run; missing keys cannot create
  // provider calls or fake generated content.
  const { client, model } = getAiClient();
  const started = Date.now();
  const inputHash = createHash("sha256").update(prompt).digest("hex");
  const runId = await reserveAiRun(model, purpose, inputHash);
  let result: Result | undefined;
  let failure: AiRequestError | undefined;
  const metadata: AiRunMetadata = {};
  try {
    const response = await client.responses.parse({
      model,
      // Groq does not support the store parameter; requests are stateless.
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_output_tokens: maxOutputTokens,
      text: { format: groqTextFormat(schema, schemaName) },
    });
    metadata.request_id = safeIdentifier(response._request_id);
    metadata.response_id = safeIdentifier(response.id);
    metadata.input_tokens = safeTokenCount(response.usage?.input_tokens);
    metadata.output_tokens = safeTokenCount(response.usage?.output_tokens);
    metadata.total_tokens = safeTokenCount(response.usage?.total_tokens);
    if (
      response.output.some(
        (item) =>
          item.type === "message" &&
          item.content.some((content) => content.type === "refusal"),
      )
    )
      throw new AiRequestError("refused");
    if (response.status === "incomplete")
      throw new AiRequestError("incomplete");
    if (response.status !== "completed") throw new AiRequestError("provider");
    const parsed = schema.safeParse(response.output_parsed);
    if (!parsed.success) throw new AiRequestError("invalid_output");
    result = convert(parsed.data);
    if (
      purpose === "worksheet_generation" &&
      parsed.data &&
      typeof parsed.data === "object" &&
      "questions" in parsed.data &&
      Array.isArray(parsed.data.questions)
    )
      metadata.question_count = parsed.data.questions.length;
    else if (purpose === "question_regeneration") metadata.question_count = 1;
  } catch (error) {
    failure = requestError(error);
    metadata.error_code = failure.code;
    if (error instanceof OpenAI.APIError)
      metadata.request_id = safeIdentifier(error.requestID);
  }
  // No prompts, raw provider responses, answer text, student data or secrets are
  // recorded. A failed audit write is a visible failure, never silently ignored.
  await finishAiRun(
    teacherId,
    runId,
    failure ? "failed" : "completed",
    Date.now() - started,
    metadata,
  );
  if (failure) throw failure;
  if (result === undefined) throw new AiRequestError("invalid_output");
  return result;
}

export async function generateWorksheetSuggestion(
  teacherId: string,
  input: GenerateWorksheetInput,
): Promise<WorksheetInput> {
  return runStructuredRequest({
    teacherId,
    purpose: "worksheet_generation",
    prompt: generationPrompt(input, allocateDifficultyCounts(input)),
    schema: aiWorksheetOutputSchema,
    schemaName: "worksheet_suggestion",
    // Bound output for Groq's free-tier token limits; incomplete output fails
    // visibly instead of inserting a partial worksheet.
    maxOutputTokens: 6_000,
    convert: (output) => transformGeneratedWorksheet(output, input),
  });
}

export async function regenerateQuestionSuggestion(
  teacherId: string,
  input: RegenerateQuestionInput,
): Promise<QuestionInput> {
  return runStructuredRequest({
    teacherId,
    purpose: "question_regeneration",
    prompt: regenerationPrompt(input),
    schema: aiRegenerationOutputSchema,
    schemaName: "question_suggestion",
    maxOutputTokens: 2_000,
    convert: (output) => transformRegeneratedQuestion(output.question, input),
  });
}
