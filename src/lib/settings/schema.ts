import { z } from "zod";

export const scaleSchema = z
  .array(
    z.object({
      percent: z.number().min(0).max(100),
      grade: z.number().int().min(0).max(10),
    }),
  )
  .min(2)
  .max(11)
  .superRefine((scale, ctx) => {
    if (
      scale[0].percent !== 0 ||
      scale.some(
        (row, index) =>
          index > 0 &&
          (row.percent <= scale[index - 1].percent ||
            row.grade <= scale[index - 1].grade),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Начните с 0%. Проценты и оценки должны возрастать без повторов.",
      });
    }
  });

export const defaultFoScale = Array.from({ length: 11 }, (_, grade) => ({
  percent: grade === 0 ? 0 : grade * 10 - 5,
  grade,
}));
export const defaultControlScale = [
  { percent: 0, grade: 2 },
  { percent: 40, grade: 3 },
  { percent: 65, grade: 4 },
  { percent: 85, grade: 5 },
];
const tags = z
  .array(
    z
      .string()
      .trim()
      .min(1, "Введите значение.")
      .max(80, "Не более 80 символов в каждом значении."),
  )
  .max(30, "Не более 30 значений.")
  .refine(
    (values) => new Set(values).size === values.length,
    "Уберите повторяющиеся значения.",
  );
export const settingsSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(1, "Введите имя.")
      .max(80, "Не более 80 символов."),
    school_name: z
      .string()
      .trim()
      .max(160, "Название школы — не более 160 символов."),
    subjects: tags,
    teaching_classes: tags,
    ui_language: z.literal("ru"),
    signature: z.string().trim().max(500, "Подпись — не более 500 символов."),
    auto_confirm: z.boolean(),
    auto_confirm_ai: z.boolean(),
    confidence_threshold: z
      .number({ error: "Введите число от 0,50 до 1,00." })
      .min(0.5, "Порог уверенности должен быть от 0,50 до 1,00.")
      .max(1, "Порог уверенности должен быть от 0,50 до 1,00."),
    fraction_equivalence: z.boolean(),
    ignore_case: z.boolean(),
    typo_tolerance: z.boolean(),
    rounding_digits: z.number().int().min(0).max(8).nullable(),
    ai_preset: z.enum(["careful", "balanced", "fast"]),
    fo_scale: scaleSchema.refine(
      (rows) => rows.at(-1)?.grade === 10,
      "Шкала ФО должна заканчиваться оценкой 10.",
    ),
    control_scale: scaleSchema.refine(
      (rows) =>
        rows.every((r) => r.grade >= 1 && r.grade <= 5) &&
        rows.at(-1)?.grade === 5,
      "Для контрольных используйте оценки от 1 до 5.",
    ),
    library_worksheets: z.boolean(),
    library_ai: z.boolean(),
    default_folder: z
      .string()
      .trim()
      .min(1, "Введите значение.")
      .max(80, "Не более 80 символов в каждом значении."),
    default_tags: tags,
    retention_days: z
      .union([z.literal(7), z.literal(30), z.literal(90)])
      .nullable(),
    notify_completed: z.boolean(),
    notify_review: z.boolean(),
  })
  .strict();
export type TeacherSettings = z.infer<typeof settingsSchema>;
export type GradingSettings = Pick<
  TeacherSettings,
  | "auto_confirm"
  | "auto_confirm_ai"
  | "confidence_threshold"
  | "fraction_equivalence"
  | "ignore_case"
  | "typo_tolerance"
  | "rounding_digits"
>;
export const defaultSettings: TeacherSettings = {
  full_name: "Учитель",
  school_name: "",
  subjects: [],
  teaching_classes: [],
  ui_language: "ru",
  signature: "",
  auto_confirm: true,
  auto_confirm_ai: false,
  confidence_threshold: 0.95,
  fraction_equivalence: true,
  ignore_case: false,
  typo_tolerance: false,
  rounding_digits: null,
  ai_preset: "balanced",
  fo_scale: defaultFoScale,
  control_scale: defaultControlScale,
  library_worksheets: false,
  library_ai: false,
  default_folder: "Мои материалы",
  default_tags: [],
  retention_days: null,
  notify_completed: true,
  notify_review: true,
};

export function percentageGrade(
  score: number | null,
  max: number | null,
  scale: z.infer<typeof scaleSchema>,
): number | null {
  if (
    score === null ||
    max === null ||
    !Number.isFinite(score) ||
    !Number.isFinite(max) ||
    max <= 0
  )
    return null;
  const percent = Math.max(0, Math.min(100, (score / max) * 100));
  return scale.findLast((row) => percent + 1e-10 >= row.percent)?.grade ?? null;
}

export function gradingSettings(settings: TeacherSettings): GradingSettings {
  return {
    auto_confirm: settings.auto_confirm,
    auto_confirm_ai: settings.auto_confirm_ai,
    confidence_threshold: settings.confidence_threshold,
    fraction_equivalence: settings.fraction_equivalence,
    ignore_case: settings.ignore_case,
    typo_tolerance: settings.typo_tolerance,
    rounding_digits: settings.rounding_digits,
  };
}
