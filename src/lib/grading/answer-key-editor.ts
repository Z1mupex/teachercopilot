import type { z } from "zod";
import type {
  AnswerKeyInput,
  ReviewMark,
} from "@/lib/grading/answer-key-validation";
import { questionControlId } from "@/lib/worksheets/editor-validation";
import type { QuestionInput } from "@/types/worksheets";

export type AnswerKeyIssue = {
  message: string;
  groupIndex: number;
  questionId?: string;
  field: string;
  targetId: string;
};

export function locateAnswerKeyIssues(
  input: AnswerKeyInput,
  issues: z.core.$ZodIssue[],
): AnswerKeyIssue[] {
  const groups = [
    { id: "base", questions: input.document.questions },
    ...(input.document.variants ?? []),
  ];
  return issues.map((issue) => {
    const path = issue.path;
    let groupIndex =
      path[0] === "document" &&
      path[1] === "variants" &&
      typeof path[2] === "number"
        ? path[2] + 1
        : 0;
    let questionIndex =
      path[1] === "questions"
        ? path[2]
        : path[3] === "questions"
          ? path[4]
          : undefined;
    let field = path.slice(path[1] === "questions" ? 3 : 5).join(".");
    if (path[0] === "review") {
      const mark = input.review.find((review) => !review.reviewed);
      groupIndex = Math.max(
        0,
        groups.findIndex((group) =>
          group.questions.some((q) => q.id === mark?.question_id),
        ),
      );
      questionIndex = groups[groupIndex].questions.findIndex(
        (q) => q.id === mark?.question_id,
      );
      field = "review";
    }
    const question =
      typeof questionIndex === "number"
        ? groups[groupIndex]?.questions[questionIndex]
        : undefined;
    return {
      message: issue.message,
      groupIndex,
      questionId: question?.id,
      field,
      targetId: question
        ? questionControlId(question, field)
        : path.at(-1) === "label"
          ? `answer-key-variant-${groups[groupIndex]?.id}`
          : "answer-key-variants",
    };
  });
}

export type RemovedAnswerQuestion = {
  groupId: string;
  position: number;
  question: QuestionInput;
  review?: ReviewMark;
};

// Restore only the removed question, preserving edits made after removal.
export function restoreAnswerQuestion(
  input: AnswerKeyInput,
  removed: RemovedAnswerQuestion,
): AnswerKeyInput | null {
  const groups = [
    { id: "base", questions: input.document.questions },
    ...(input.document.variants ?? []),
  ];
  const group = groups.find((candidate) => candidate.id === removed.groupId);
  const questions = groups.flatMap((candidate) => candidate.questions);
  if (
    !group ||
    group.questions.length >= 100 ||
    questions.length >= 300 ||
    questions.some((q) => q.id === removed.question.id)
  )
    return null;
  const restored = [...group.questions];
  restored.splice(
    Math.min(removed.position, restored.length),
    0,
    removed.question,
  );
  return {
    ...input,
    document: {
      ...input.document,
      questions:
        removed.groupId === "base" ? restored : input.document.questions,
      variants: input.document.variants?.map((variant) =>
        variant.id === removed.groupId
          ? { ...variant, questions: restored }
          : variant,
      ),
    },
    review: removed.review ? [...input.review, removed.review] : input.review,
  };
}
