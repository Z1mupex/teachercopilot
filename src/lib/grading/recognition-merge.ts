import type { QuestionInput } from "@/types/worksheets";
import type { RecognizedAnswer } from "@/lib/grading/grading-validation";
export type LocatedRecognition = {
  answer: RecognizedAnswer;
  pageIds: string[];
};
export function mergeRecognition(
  questions: QuestionInput[],
  parts: LocatedRecognition[],
) {
  const allowed = new Map(questions.map((q) => [q.id, q])),
    byQuestion = new Map<string, LocatedRecognition>();
  const needsCombined = new Set<string>();
  for (const part of parts) {
    const question = allowed.get(part.answer.question_id);
    if (!question) throw new Error("Unknown recognized question");
    const nonempty =
      !!part.answer.text?.trim() || part.answer.choice_ids.length > 0;
    const old = byQuestion.get(question.id);
    if (!old) {
      byQuestion.set(question.id, part);
      continue;
    }
    const oldNonempty =
      !!old.answer.text?.trim() || old.answer.choice_ids.length > 0;
    if (!nonempty) continue;
    if (!oldNonempty) {
      byQuestion.set(question.id, part);
      continue;
    }
    const sameText =
      old.answer.text?.normalize("NFC").trim() ===
      part.answer.text?.normalize("NFC").trim();
    const sameChoices =
      [...old.answer.choice_ids].sort().join(",") ===
      [...part.answer.choice_ids].sort().join(",");
    const flags = new Set([...old.answer.flags, ...part.answer.flags]);
    if (
      (question.type === "numeric" || question.type === "multiple_choice") &&
      (!sameText || !sameChoices)
    )
      flags.add("ambiguous");
    if (
      !sameText &&
      (question.type === "open_response" || question.type === "short_answer")
    )
      needsCombined.add(question.id);
    const text = sameText
      ? old.answer.text
      : [old.answer.text, part.answer.text].filter(Boolean).join("\n\n");
    if (text && text.length > 12000)
      throw new Error("Incomplete combined transcription");
    byQuestion.set(question.id, {
      answer: {
        ...old.answer,
        text,
        confidence: Math.min(old.answer.confidence, part.answer.confidence),
        flags: [...flags],
      },
      pageIds: [...new Set([...old.pageIds, ...part.pageIds])],
    });
  }
  return { answers: [...byQuestion.values()], needsCombined };
}
