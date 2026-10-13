import type { QuestionInput } from "@/types/worksheets";
export function expectedAnswerText(question: QuestionInput) {
  if (question.type === "multiple_choice")
    return question.options
      .filter((o) => question.correct_option_ids.includes(o.id))
      .map((o) => o.text)
      .join("; ");
  if (question.type === "numeric")
    return `${question.expected_answer}${question.tolerance ? ` (погрешность ±${question.tolerance})` : ""}`;
  if (question.type === "open_response")
    return [question.expected_answer, question.rubric]
      .filter(Boolean)
      .join("\n\n");
  return question.expected_answer;
}
export function recognizedChoiceText(
  question: QuestionInput,
  ids: string[],
  text: string | null,
) {
  if (question.type !== "multiple_choice" || !ids.length)
    return text ?? "Ответ не распознан";
  return (
    question.options
      .filter((o) => ids.includes(o.id))
      .map((o) => o.text)
      .join("; ") ||
    text ||
    "Ответ не распознан"
  );
}
