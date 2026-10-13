import { createEmptyQuestion } from "@/lib/worksheets/domain";
import {
  answerKeySchema,
  type AnswerKeyInput,
  type ReviewField,
  type ReviewMark,
} from "@/lib/grading/answer-key-validation";
import type { ParsedAnswerKey } from "@/lib/ai/schemas/answer-key-output";

export function transformAnswerKey(
  output: ParsedAnswerKey,
  title: string,
  source: AnswerKeyInput["source"],
): AnswerKeyInput {
  const review: ReviewMark[] = [];
  const groups = output.variants.map((variant, variantIndex) => {
    const byNumber = new Map(variant.questions.map((q) => [q.number, q]));
    const last = Math.max(...byNumber.keys());
    const questions = Array.from({ length: last }, (_, index) => {
      const parsed = byNumber.get(index + 1);
      // An unreadable number must remain blank, never become a suggested zero.
      const missingNumber =
        parsed?.type === "numeric" && parsed.numeric_answer === null;
      const question = createEmptyQuestion(
        missingNumber ? "short_answer" : (parsed?.type ?? "short_answer"),
      );
      question.prompt = parsed?.prompt?.trim() || `Задание ${index + 1}`;
      const fields = new Set<ReviewField>(parsed?.uncertain_fields ?? []);
      if (!parsed) fields.add("missing");
      if (!parsed?.type) fields.add("type");
      if (missingNumber) {
        fields.add("type");
        fields.add("answer");
      }
      question.max_score = parsed?.max_score ?? 1;
      if (!parsed?.max_score) fields.add("score");
      if (parsed?.confidence === null || (parsed?.confidence ?? 0) < 0.85)
        fields.add("confidence");
      switch (question.type) {
        case "short_answer":
          question.expected_answer = parsed?.expected_answer ?? "";
          if (!question.expected_answer.trim()) fields.add("answer");
          break;
        case "numeric":
          question.expected_answer = parsed?.numeric_answer ?? 0;
          if (
            parsed?.numeric_answer === null ||
            parsed?.numeric_answer === undefined
          )
            fields.add("answer");
          question.tolerance = 0;
          break;
        case "open_response":
          question.expected_answer = parsed?.expected_answer ?? null;
          question.rubric = parsed?.rubric ?? null;
          if (!question.expected_answer?.trim() && !question.rubric?.trim())
            fields.add("rubric");
          break;
        case "multiple_choice": {
          let options = parsed?.options ?? [];
          const correct = parsed?.correct_option_labels ?? [];
          if (options.length < 2) {
            fields.add("options");
            const alphabet = correct.some((s) => /^[А-ЯЁ]$/u.test(s))
              ? "АБВГДЕЖЗИКЛМ"
              : "ABCDEFGHIJKL";
            const labels = [
              ...new Set([...alphabet.slice(0, 4), ...correct]),
            ].slice(0, 12);
            options = labels.map((label) => ({ label, text: label }));
          }
          question.options = options.map((o) => ({
            id: crypto.randomUUID(),
            text: o.text.trim() || o.label,
          }));
          question.correct_option_ids = options.flatMap((o, index) =>
            correct.includes(o.label) ? [question.options[index].id] : [],
          );
          if (
            question.correct_option_ids.length === 0 ||
            correct.some((label) => !options.some((o) => o.label === label))
          )
            fields.add("answer");
          break;
        }
      }
      if (fields.size)
        review.push({
          question_id: question.id,
          fields: [...fields],
          reviewed: false,
        });
      return question;
    });
    return {
      id: crypto.randomUUID(),
      label:
        variantIndex === 0
          ? "Вариант 1"
          : variant.label?.trim() || `Вариант ${variantIndex + 1}`,
      questions,
    };
  });
  return answerKeySchema.parse({
    document: {
      title,
      subject: null,
      grade: null,
      status: "draft",
      questions: groups[0].questions,
      variants: groups.slice(1),
    },
    source,
    review,
    confirmed: false,
  });
}
