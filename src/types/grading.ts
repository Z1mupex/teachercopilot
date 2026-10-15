import type { ScanQuality } from "@/lib/grading/scan-analysis";
export type GradingPage = {
  id: string;
  status: "pending" | "stored";
  width: number | null;
  height: number | null;
  imageVersion: string;
  submissionId: string;
  pageIndex: number;
  reviewed: boolean;
  quality: ScanQuality | null;
  contentHash: string | null;
  perceptualHash: string | null;
};
export type GradingBatch = {
  id: string;
  title: string;
  status: string;
  revision: string;
  answerKeyConfirmedAt: string | null;
  className: string | null;
  worksheetTitle: string | null;
  scanReviewRequired: boolean;
  pages: GradingPage[];
};
export type GradingResult =
  { batch: GradingBatch; error?: never } | { error: string; batch?: never };
