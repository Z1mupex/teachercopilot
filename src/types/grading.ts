export type GradingPage = {
  id: string;
  status: "pending" | "stored";
  width: number | null;
  height: number | null;
  imageVersion: string;
};
export type GradingBatch = {
  id: string;
  title: string;
  status: string;
  revision: string;
  answerKeyConfirmedAt: string | null;
  className: string | null;
  worksheetTitle: string | null;
  pages: GradingPage[];
};
export type GradingResult =
  { batch: GradingBatch; error?: never } | { error: string; batch?: never };
