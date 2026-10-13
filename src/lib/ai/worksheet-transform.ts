import { randomUUID } from "node:crypto";

import { AiRequestError } from "@/lib/ai/errors";
import {
  aiQuestionOutputSchema,
  aiWorksheetOutputSchema,
  type AiQuestionOutput,
} from "@/lib/ai/schemas/worksheet-output";
import type {
  GenerateWorksheetInput,
  RegenerateQuestionInput,
} from "@/lib/validation/ai-worksheets";
import {
  readyQuestionSchema,
  worksheetInputSchema,
} from "@/lib/validation/worksheets";
import type { QuestionInput, WorksheetInput } from "@/types/worksheets";

const difficulties = ["easy", "medium", "hard"] as const;

// Largest-remainder allocation keeps the exact requested question count, even
// when percentages do not divide evenly (for example, 30/50/20 with 8 tasks).
export function allocateDifficultyCounts(input: GenerateWorksheetInput) {
  const quotas = difficulties.map((difficulty, index) => {
    const exact =
      (input.difficulty_distribution[difficulty] * input.question_count) / 100;
    return {
      difficulty,
      index,
      count: Math.floor(exact),
      remainder: exact % 1,
    };
  });
  const missing =
    input.question_count - quotas.reduce((sum, item) => sum + item.count, 0);
  const ordered = [...quotas].sort(
    (a, b) => b.remainder - a.remainder || a.index - b.index,
  );
  for (let index = 0; index < missing; index += 1) ordered[index].count += 1;
  return {
    easy: quotas[0].count,
    medium: quotas[1].count,
    hard: quotas[2].count,
  };
}

function normalizeText(text: string) {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

function toQuestion(
  output: AiQuestionOutput,
  generation_context: NonNullable<QuestionInput["generation_context"]>,
  id: string = randomUUID(),
): QuestionInput {
  const base = {
    id,
    prompt: output.prompt.trim(),
    max_score: output.max_score,
    difficulty: output.difficulty,
    generation_context,
  };
  let question: QuestionInput;
  switch (output.type) {
    case "multiple_choice": {
      const options = output.options.map((text) => ({
        id: randomUUID(),
        text: text.trim(),
      }));
      if (
        new Set(options.map((option) => normalizeText(option.text))).size !==
          options.length ||
        new Set(output.correct_option_indexes).size !==
          output.correct_option_indexes.length ||
        output.correct_option_indexes.some((index) => index >= options.length)
      )
        throw new AiRequestError("invalid_output");
      question = {
        ...base,
        type: "multiple_choice",
        options,
        correct_option_ids: output.correct_option_indexes.map(
          (index) => options[index].id,
        ),
      };
      break;
    }
    case "short_answer":
      question = {
        ...base,
        type: "short_answer",
        expected_answer: output.expected_answer.trim(),
      };
      break;
    case "numeric":
      question = {
        ...base,
        type: "numeric",
        expected_answer: output.expected_answer,
        tolerance: output.tolerance,
      };
      break;
    case "open_response":
      if (!output.expected_answer?.trim() && !output.rubric?.trim())
        throw new AiRequestError("invalid_output");
      question = {
        ...base,
        type: "open_response",
        expected_answer: output.expected_answer?.trim() || null,
        rubric: output.rubric?.trim() || null,
      };
  }
  const parsed = readyQuestionSchema.safeParse(question);
  if (!parsed.success) throw new AiRequestError("invalid_output");
  return parsed.data;
}

export function transformGeneratedWorksheet(
  output: unknown,
  input: GenerateWorksheetInput,
): WorksheetInput {
  const parsed = aiWorksheetOutputSchema.safeParse(output);
  if (!parsed.success) throw new AiRequestError("invalid_output");
  const suggestion = parsed.data;
  if (
    suggestion.questions.length !== input.question_count ||
    suggestion.grade !== input.grade ||
    normalizeText(suggestion.subject) !== normalizeText(input.subject) ||
    suggestion.questions.some(
      (question) => !input.allowed_types.includes(question.type),
    )
  )
    throw new AiRequestError("invalid_output");
  const expectedCounts = allocateDifficultyCounts(input);
  for (const difficulty of difficulties)
    if (
      suggestion.questions.filter(
        (question) => question.difficulty === difficulty,
      ).length !== expectedCounts[difficulty]
    )
      throw new AiRequestError("invalid_output");
  const worksheet = worksheetInputSchema.safeParse({
    title: suggestion.title,
    subject: input.subject,
    grade: input.grade,
    status: "draft",
    questions: suggestion.questions.map((question) =>
      toQuestion(question, {
        topic: input.topic,
        approximate_duration: input.approximate_duration,
      }),
    ),
  });
  if (!worksheet.success) throw new AiRequestError("invalid_output");
  return worksheet.data;
}

export function transformRegeneratedQuestion(
  output: unknown,
  input: RegenerateQuestionInput,
): QuestionInput {
  const parsed = aiQuestionOutputSchema.safeParse(output);
  if (!parsed.success) throw new AiRequestError("invalid_output");
  if (
    parsed.data.type !== input.question.type ||
    parsed.data.difficulty !== input.question.difficulty ||
    parsed.data.max_score !== input.question.max_score
  )
    throw new AiRequestError("invalid_output");
  return toQuestion(
    parsed.data,
    input.question.generation_context,
    input.question.id,
  );
}
