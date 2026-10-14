import type { QuestionInput } from "@/types/worksheets";
import type { GradedAnswer } from "@/lib/grading/score";
import type { AutonomyRules } from "@/lib/grading/autonomy";

export type SubmissionProgress = {
  id: string;
  number: number;
  studentName: string | null;
  status: string;
  variantId: string | null;
  leaseUntil: string | null;
  error: string | null;
  proposedScore: number | null;
  finalScore: number | null;
  maxScore: number | null;
  pageId: string | null;
};
export type GradingProgress = {
  observedAt: string;
  id: string;
  title: string;
  status: string;
  confirmed: boolean;
  processed: number;
  submissions: SubmissionProgress[];
  answers: number;
  needsReview: number;
  teacherReviewed: number;
  autonomy: { config: AutonomyRules | null; frozen: boolean; revision: string };
};
export type ReviewAnswer = {
  id: string;
  revision: string;
  submissionId: string;
  submissionNumber: number;
  studentName: string | null;
  pageId: string;
  questionNumber: number;
  question: QuestionInput;
  text: string | null;
  choiceIds: string[];
  flags: string[];
  crop: GradedAnswer["crop"];
  proposedScore: number | null;
  finalScore: number | null;
  confidence: number;
  explanation: string;
  status: string;
  teacherUnreadable: boolean;
};
export type ReviewSlice = {
  answers: ReviewAnswer[];
  count: number;
  page: number;
  progress: GradingProgress;
};
export type WorkReview = {
  progress: GradingProgress;
  submission: SubmissionProgress | null;
  answers: ReviewAnswer[];
  maximum: number | null;
};
