import type { QuestionInput } from "@/types/worksheets";
import { GRADING_POLICY, type GradingFlag } from "@/lib/grading/policy";
import type { RecognizedAnswer } from "@/lib/grading/grading-validation";

export function normalizeText(answer: string) {
  // Case is retained: e.g. Co/CO and German Sie/sie can differ semantically.
  return answer.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function normalizeNumber(answer: string): number | null {
  let text = answer.trim().replace(/−/gu, "-");
  if (text.length > 120) return null;
  const fractions: Record<string, string> = {
    "½": "1/2",
    "¼": "1/4",
    "¾": "3/4",
  };
  text = fractions[text] ?? text;
  const parts = text.split("/").map((part) => part.trim());
  if (
    parts.length > 2 ||
    parts.some((part) => !/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/u.test(part))
  )
    return null;
  const values = parts.map((part) => Number(part.replace(",", ".")));
  if (
    values.some((value) => !Number.isFinite(value)) ||
    (values.length === 2 && values[1] === 0)
  )
    return null;
  const value = values.length === 2 ? values[0] / values[1] : values[0];
  return Number.isFinite(value) ? value : null;
}

export type GradedAnswer = {
  question_id: string;
  text: string | null;
  choice_ids: string[];
  proposed_score: number;
  confidence: number;
  explanation: string;
  flags: GradingFlag[];
  crop: RecognizedAnswer["crop"];
  review_status: "auto_accepted" | "needs_review";
};

export function gradeRecognizedAnswer(
  question: QuestionInput,
  recognized?: RecognizedAnswer,
): GradedAnswer {
  const flags = new Set<GradingFlag>(recognized?.flags ?? ["missing"]);
  let confidence = recognized?.confidence ?? 0;
  const text = recognized?.text ?? null;
  let score = 0;
  let explanation = "Ответ не найден. Проверьте оригинал работы.";
  const empty = !text?.trim() && !recognized?.choice_ids.length;
  if (empty) flags.add("blank");
  if (flags.has("unreadable") || flags.has("ambiguous") || flags.has("blank"))
    confidence = Math.min(confidence, 0.5);
  if (!empty && !flags.has("unreadable")) {
    if (question.type === "multiple_choice") {
      const choices = recognized?.choice_ids ?? [];
      const allowed = new Set(question.options.map((option) => option.id));
      if (
        choices.length === 0 ||
        new Set(choices).size !== choices.length ||
        choices.some((id) => !allowed.has(id))
      ) {
        flags.add("conflicting_choices");
        confidence = Math.min(confidence, 0.5);
        explanation =
          "Выбранные варианты не удалось надёжно сопоставить с ключом.";
      } else {
        const correct = new Set(question.correct_option_ids);
        const matches =
          choices.length === correct.size &&
          choices.every((id) => correct.has(id));
        score = matches ? question.max_score : 0;
        explanation = matches
          ? "Набор выбранных вариантов совпадает с ключом."
          : "Набор выбранных вариантов отличается от ключа.";
      }
    } else if (question.type === "numeric") {
      const value = normalizeNumber(text ?? "");
      if (value === null) {
        flags.add("unsupported_number");
        confidence = Math.min(confidence, 0.5);
        explanation = "Числовой ответ требует ручного сопоставления.";
      } else {
        const tolerance = Math.max(
          question.tolerance,
          Number.EPSILON * Math.max(1, Math.abs(question.expected_answer)) * 4,
        );
        const matches = Math.abs(value - question.expected_answer) <= tolerance;
        score = matches ? question.max_score : 0;
        explanation = matches
          ? "Число совпадает с эталоном с учётом погрешности."
          : "Число находится вне допустимой погрешности.";
      }
    } else if (
      question.type === "short_answer" &&
      normalizeText(text ?? "") === normalizeText(question.expected_answer)
    ) {
      score = question.max_score;
      explanation = "Ответ совпадает с ключом после нормализации пробелов.";
    } else {
      flags.add("ai_judgment");
      if (question.type === "open_response") flags.add("open_response");
      confidence = Math.min(confidence, 0.9);
      score = recognized?.proposed_score ?? 0;
      explanation =
        recognized?.explanation ||
        "Оценку нужно подтвердить по критериям учителя.";
    }
  }
  if (score > question.max_score) {
    flags.add("ambiguous");
    confidence = Math.min(confidence, 0.5);
  }
  score = Math.min(
    question.max_score,
    Math.max(0, Math.round(score * 10000) / 10000),
  );
  if (confidence < GRADING_POLICY.highConfidence) flags.add("low_confidence");
  return {
    question_id: question.id,
    text,
    choice_ids: recognized?.choice_ids ?? [],
    proposed_score: score,
    confidence,
    explanation,
    flags: [...flags],
    crop: recognized?.crop ?? null,
    review_status:
      confidence >= GRADING_POLICY.highConfidence &&
      flags.size === 0 &&
      question.type !== "open_response"
        ? "auto_accepted"
        : "needs_review",
  };
}

export function gradeSubmission(
  questions: QuestionInput[],
  answers: RecognizedAnswer[],
) {
  const expected = new Set(questions.map((question) => question.id));
  const byId = new Map<string, RecognizedAnswer>();
  for (const answer of answers) {
    if (!expected.has(answer.question_id) || byId.has(answer.question_id))
      throw new Error("Invalid recognized question identities");
    byId.set(answer.question_id, answer);
  }
  return questions.map((question) =>
    gradeRecognizedAnswer(question, byId.get(question.id)),
  );
}
