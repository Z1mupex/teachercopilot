import type { QuestionType } from "@/types/worksheets";

export const questionTypeLabels: Record<QuestionType, string> = {
  multiple_choice: "Выбор ответа",
  short_answer: "Короткий ответ",
  numeric: "Числовой ответ",
  open_response: "Развёрнутый ответ",
};

export const questionTypes = Object.keys(questionTypeLabels) as QuestionType[];
export const difficultyLabels = {
  easy: "Базовая",
  medium: "Средняя",
  hard: "Повышенная",
};

export const textAreaClass =
  "min-h-24 w-full resize-y rounded-xl border bg-card px-4 py-3 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 aria-invalid:border-destructive disabled:opacity-50";
export const selectClass =
  "h-12 w-full rounded-xl border bg-card px-3 text-sm outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/15 disabled:opacity-50";
export const secondaryButtonClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none";
