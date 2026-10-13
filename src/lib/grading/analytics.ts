import type { WorksheetInput } from "@/types/worksheets";

export const WEAK_QUESTION_THRESHOLD = 60;
export type AnalyticsQuestion = {
  id: string;
  variantId: string | null;
  variantLabel: string;
  number: number;
  prompt: string;
  topic: string;
  maxScore: number;
};
export type AnalyticsSubmission = {
  id: string;
  number: number;
  studentName: string | null;
  variantId: string | null;
  finalScore: number | null;
  maxScore: number | null;
};
export type AnalyticsAnswer = {
  submissionId: string;
  questionId: string;
  finalScore: number | null;
  reviewStatus: string;
};
export type AnswerState =
  "correct" | "partial" | "wrong" | "not_graded" | "not_applicable";

export function analyticsQuestions(
  document: WorksheetInput,
): AnalyticsQuestion[] {
  return [
    { id: null, label: "Вариант 1", questions: document.questions },
    ...(document.variants ?? []),
  ].flatMap((variant) =>
    variant.questions.map((q, i) => ({
      id: q.id,
      variantId: variant.id,
      variantLabel: variant.label,
      number: i + 1,
      prompt: q.prompt,
      topic: q.generation_context?.topic ?? q.prompt,
      maxScore: q.max_score,
    })),
  );
}

export function answerState(
  score: number | null,
  maximum: number,
): AnswerState {
  if (
    score === null ||
    !Number.isFinite(score) ||
    maximum <= 0 ||
    score < 0 ||
    score > maximum
  )
    return "not_graded";
  if (score === maximum) return "correct";
  return score === 0 ? "wrong" : "partial";
}

export function calculateAnalytics(
  questions: AnalyticsQuestion[],
  submissions: AnalyticsSubmission[],
  answers: AnalyticsAnswer[],
) {
  const questionMap = new Map(questions.map((q) => [q.id, q]));
  const submissionMap = new Map(submissions.map((s) => [s.id, s]));
  const cells = new Map<string, AnalyticsAnswer>();
  for (const answer of answers) {
    const question = questionMap.get(answer.questionId);
    const submission = submissionMap.get(answer.submissionId);
    if (!question || !submission || question.variantId !== submission.variantId)
      throw new Error("Результаты не соответствуют заданиям своего варианта.");
    const key = `${answer.submissionId}:${answer.questionId}`;
    if (cells.has(key))
      throw new Error("Обнаружены повторяющиеся результаты задания.");
    cells.set(key, answer);
  }
  const rows = submissions.map((s) => ({
    ...s,
    cells: questions.map((q) => {
      const answer = cells.get(`${s.id}:${q.id}`);
      const score =
        answer?.reviewStatus === "needs_review"
          ? null
          : (answer?.finalScore ?? null);
      return {
        questionId: q.id,
        score,
        maxScore: q.maxScore,
        state:
          q.variantId !== s.variantId
            ? ("not_applicable" as const)
            : answerState(score, q.maxScore),
      };
    }),
  }));
  const stats = questions.map((q, index) => {
    const applicable = rows.filter((s) => s.variantId === q.variantId);
    const graded = applicable
      .map((s) => s.cells[index])
      .filter((c) => c.state !== "not_graded");
    const count = (state: AnswerState) =>
      graded.filter((c) => c.state === state).length;
    const denominator = applicable.length;
    const averagePoints = graded.length
      ? graded.reduce((sum, c) => sum + c.score!, 0) / graded.length
      : null;
    const averagePercent =
      averagePoints === null ? null : (averagePoints / q.maxScore) * 100;
    return {
      ...q,
      expected: denominator,
      graded: graded.length,
      averagePoints,
      averagePercent,
      correct: count("correct"),
      partial: count("partial"),
      wrong: count("wrong"),
      correctPercent: denominator
        ? (count("correct") / denominator) * 100
        : null,
      partialPercent: denominator
        ? (count("partial") / denominator) * 100
        : null,
      wrongPercent: denominator ? (count("wrong") / denominator) * 100 : null,
      interventionCount: applicable.filter((s) =>
        ["teacher_confirmed", "teacher_changed"].includes(
          cells.get(`${s.id}:${q.id}`)?.reviewStatus ?? "",
        ),
      ).length,
      weak: averagePercent !== null && averagePercent < WEAK_QUESTION_THRESHOLD,
    };
  });
  const completed = submissions.filter(
    (s) =>
      s.finalScore !== null &&
      Number.isFinite(s.finalScore) &&
      s.maxScore !== null &&
      s.maxScore > 0 &&
      s.finalScore >= 0 &&
      s.finalScore <= s.maxScore &&
      rows
        .find((r) => r.id === s.id)!
        .cells.every((c) => c.state !== "not_graded"),
  );
  const scores = completed.map((s) => s.finalScore!).sort((a, b) => a - b);
  const middle = Math.floor(scores.length / 2);
  const distribution = [
    { label: "0–<25%", lower: 0, upper: 25 },
    { label: "25–<50%", lower: 25, upper: 50 },
    { label: "50–<75%", lower: 50, upper: 75 },
    { label: "75–100%", lower: 75, upper: 101 },
  ].map((bin) => ({
    ...bin,
    count: completed.filter((s) => {
      const value = (s.finalScore! / s.maxScore!) * 100;
      return value >= bin.lower && value < bin.upper;
    }).length,
  }));
  return {
    questions: stats,
    rows,
    weakQuestions: stats
      .filter((q) => q.weak)
      .sort(
        (a, b) => a.averagePercent! - b.averagePercent! || a.number - b.number,
      ),
    summary: {
      total: submissions.length,
      completed: completed.length,
      average: scores.length
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : null,
      median: scores.length
        ? (scores[middle] + scores[Math.floor((scores.length - 1) / 2)]) / 2
        : null,
      min: scores[0] ?? null,
      max: scores.at(-1) ?? null,
      averagePercent: completed.length
        ? completed.reduce(
            (sum, s) => sum + (s.finalScore! / s.maxScore!) * 100,
            0,
          ) / completed.length
        : null,
      distribution,
    },
  };
}
export type GradingAnalytics = ReturnType<typeof calculateAnalytics>;

export function followUpPrefill(
  analytics: GradingAnalytics,
  subject: string | null,
  grade: number | null,
) {
  const weak = analytics.weakQuestions.slice(0, 10);
  if (!weak.length) return null;
  return {
    subject: subject ?? "",
    grade: grade ?? undefined,
    topic: [...new Set(weak.map((q) => q.topic))].join("; ").slice(0, 200),
    teacherInstructions: (
      "Подготовьте новые тренировочные задания по затруднениям. Не копируйте исходные задания дословно.\n" +
      weak
        .map(
          (q) =>
            `${q.variantLabel}, № ${q.number}: ${q.prompt.slice(0, 150)} (средний результат ${Math.round(q.averagePercent!)}%).`,
        )
        .join("\n")
    ).slice(0, 2000),
  };
}

export function aggregateForAi(analytics: GradingAnalytics) {
  return {
    completionCount: analytics.summary.completed,
    totalCount: analytics.summary.total,
    averagePercent: analytics.summary.averagePercent,
    distribution: analytics.summary.distribution.map(({ label, count }) => ({
      label,
      count,
    })),
    questionCount: analytics.questions.filter((q) => q.expected > 0).length,
    questions: analytics.questions
      .filter((q) => q.expected > 0)
      .sort((a, b) => (a.averagePercent ?? 101) - (b.averagePercent ?? 101))
      .slice(0, 20)
      .map((q) => ({
        variant: q.variantLabel,
        number: q.number,
        topic: q.topic.slice(0, 160),
        count: q.expected,
        averagePercent: q.averagePercent,
        correct: q.correct,
        partial: q.partial,
        wrong: q.wrong,
        notGraded: q.expected - q.graded,
        teacherInterventions: q.interventionCount,
      })),
  };
}
