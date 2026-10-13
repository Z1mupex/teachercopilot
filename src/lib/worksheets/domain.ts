import { questionInputSchema } from "@/lib/validation/worksheets";
import type { Database, Json } from "@/types/database";
import type { QuestionInput, QuestionType } from "@/types/worksheets";

export function createEmptyQuestion(type: QuestionType): QuestionInput {
  const base = {
    id: crypto.randomUUID(),
    prompt: "",
    max_score: 1,
    difficulty: null,
    generation_context: null,
  };
  switch (type) {
    case "multiple_choice":
      return {
        ...base,
        type,
        options: Array.from({ length: 4 }, () => ({
          id: crypto.randomUUID(),
          text: "",
        })),
        correct_option_ids: [],
      };
    case "short_answer":
      return { ...base, type, expected_answer: "" };
    case "numeric":
      return { ...base, type, expected_answer: 0, tolerance: 0 };
    case "open_response":
      return { ...base, type, expected_answer: null, rubric: null };
  }
}

export function duplicateQuestion(question: QuestionInput): QuestionInput {
  const copy = structuredClone(question);
  copy.id = crypto.randomUUID();
  if (copy.type === "multiple_choice") {
    const ids = new Map(
      copy.options.map((option) => [option.id, crypto.randomUUID()]),
    );
    copy.options = copy.options.map((option) => ({
      ...option,
      id: ids.get(option.id)!,
    }));
    copy.correct_option_ids = copy.correct_option_ids.map((id) => ids.get(id)!);
  }
  return copy;
}

export function questionToRows(
  question: QuestionInput,
  worksheetId: string,
  orderIndex: number,
) {
  const metadata: Record<string, Json> = {
    editor_version: 1,
    difficulty: question.difficulty,
    generation_context: question.generation_context,
  };
  if (question.type === "multiple_choice") metadata.options = question.options;
  if (question.type === "numeric") metadata.tolerance = question.tolerance;
  const expected_answer: Json =
    question.type === "multiple_choice"
      ? question.correct_option_ids
      : question.expected_answer;
  return {
    question: {
      id: question.id,
      worksheet_id: worksheetId,
      variant_id: null,
      order_index: orderIndex,
      type: question.type,
      prompt: question.prompt,
      max_score: question.max_score,
      metadata,
    },
    answerKey: {
      question_id: question.id,
      expected_answer,
      rubric: question.type === "open_response" ? question.rubric : null,
    },
  };
}

export function questionFromRows(
  question: Database["public"]["Tables"]["questions"]["Row"],
  answerKey: Database["public"]["Tables"]["answer_keys"]["Row"] | undefined,
): QuestionInput {
  const metadata = question.metadata;
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata) ||
    metadata.editor_version !== 1 ||
    !answerKey
  )
    throw new Error("UnsupportedWorksheetQuestion");
  const base = {
    id: question.id,
    prompt: question.prompt,
    max_score: question.max_score,
    difficulty: metadata.difficulty,
    generation_context: metadata.generation_context,
  };
  switch (question.type) {
    case "multiple_choice":
      return questionInputSchema.parse({
        ...base,
        type: question.type,
        options: metadata.options,
        correct_option_ids: answerKey.expected_answer,
      });
    case "short_answer":
      return questionInputSchema.parse({
        ...base,
        type: question.type,
        expected_answer: answerKey.expected_answer,
      });
    case "numeric":
      return questionInputSchema.parse({
        ...base,
        type: question.type,
        expected_answer: answerKey.expected_answer,
        tolerance: metadata.tolerance,
      });
    case "open_response":
      return questionInputSchema.parse({
        ...base,
        type: question.type,
        expected_answer: answerKey.expected_answer,
        rubric: answerKey.rubric,
      });
    default:
      throw new Error("UnsupportedWorksheetQuestion");
  }
}
