import type { QuestionInput } from "@/types/worksheets";

export type QuestionFieldError = { field: string; message: string };

export function questionControlId(question: QuestionInput, field: string) {
  const prefix = `question-${question.id}`;
  if (field.startsWith("options.")) {
    const index = Number(field.split(".")[1]);
    if (question.type === "multiple_choice" && question.options[index])
      return `${prefix}-option-${question.options[index].id}`;
  }
  const suffixes: Record<string, string> = {
    max_score: "score",
    expected_answer: "answer",
    correct_option_ids: "choices",
    options: "choices",
  };
  const suffix = suffixes[field] ?? field;
  return `${prefix}-${suffix}`;
}
