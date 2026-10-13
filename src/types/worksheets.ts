import type { z } from "zod";
import type {
  questionInputSchema,
  questionTypeSchema,
  worksheetInputSchema,
} from "@/lib/validation/worksheets";

export type QuestionInput = z.infer<typeof questionInputSchema>;
export type QuestionType = z.infer<typeof questionTypeSchema>;
export type WorksheetInput = z.infer<typeof worksheetInputSchema>;
export type WorksheetListItem = {
  id: string;
  title: string;
  subject: string | null;
  grade: number | null;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
};
export type WorksheetDetail = WorksheetInput & {
  id: string;
  updated_at: string;
  editable: boolean;
};
export type WorksheetMutationResult =
  | { id: string; updated_at: string }
  | { error: string; fieldErrors?: Record<string, string[]> };
