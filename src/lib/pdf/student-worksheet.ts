import { z } from "zod";
import { questionTypeSchema } from "@/lib/validation/worksheets";

// This is a deliberately smaller student-facing model. No answer key, rubric,
// tolerance, correct-option selection, teacher data or student identity enters it.
const printableQuestionSchema = z
  .object({
    type: questionTypeSchema,
    prompt: z.string().trim().min(1).max(12000),
    max_score: z.number().finite().min(0).max(1000),
    options: z.array(z.string().trim().min(1).max(2000)).max(12),
  })
  .strict()
  .superRefine((question, context) => {
    if (question.type === "multiple_choice" && question.options.length < 2)
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Заполните варианты ответа перед печатью.",
      });
  });

export const printableWorksheetSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(200),
    subject: z.string().max(120).nullable(),
    grade: z.number().int().min(1).max(12).nullable(),
    variants: z
      .array(
        z
          .object({
            id: z.uuid().nullable(),
            label: z.string().trim().min(1).max(80),
            questions: z.array(printableQuestionSchema).min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .superRefine((document, context) => {
    if (
      document.variants.reduce(
        (sum, variant) => sum + variant.questions.length,
        0,
      ) > 300
    )
      context.addIssue({
        code: "custom",
        message: "Слишком много заданий для одного PDF.",
      });
  });

export type PrintableWorksheet = z.infer<typeof printableWorksheetSchema>;
export class WorksheetPrintError extends Error {}

export function studentQuestion(row: {
  type: string;
  prompt: string;
  max_score: number;
  metadata: unknown;
}): PrintableWorksheet["variants"][number]["questions"][number] {
  const metadata = row.metadata;
  const rawOptions =
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    "options" in metadata
      ? metadata.options
      : undefined;
  const parsed = printableQuestionSchema.safeParse({
    type: row.type,
    prompt: row.prompt,
    max_score: row.max_score,
    options:
      row.type === "multiple_choice" && Array.isArray(rawOptions)
        ? rawOptions.map((option: unknown) =>
            option && typeof option === "object" && "text" in option
              ? option.text
              : null,
          )
        : [],
  });
  if (!parsed.success)
    throw new WorksheetPrintError(
      "Заполните условия и варианты ответа во всех вариантах перед скачиванием PDF.",
    );
  return parsed.data;
}
