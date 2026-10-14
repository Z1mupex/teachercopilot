import { z } from "zod";

export const autonomyModeSchema = z.enum([
  "careful",
  "balanced",
  "fast",
  "custom",
]);
export const autonomySchema = z
  .object({
    mode: autonomyModeSchema.default("custom"),
    auto_confirm: z.boolean(),
    auto_confirm_ai: z.boolean(),
    auto_confirm_open: z.boolean().default(false),
    confidence_threshold: z.number().min(0.5).max(1),
    fraction_equivalence: z.boolean(),
    ignore_case: z.boolean(),
    typo_tolerance: z.boolean(),
    rounding_digits: z.number().int().min(0).max(8).nullable(),
  })
  .strict()
  .superRefine((rules, ctx) => {
    if (
      (!rules.auto_confirm &&
        (rules.auto_confirm_ai || rules.auto_confirm_open)) ||
      (!rules.auto_confirm_ai && rules.auto_confirm_open)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Принятие развёрнутых ответов требует включённого автопринятия оценок ИИ.",
      });
    }
    if (rules.mode !== "custom" && !matchesPreset(rules, rules.mode))
      ctx.addIssue({
        code: "custom",
        message: "Изменённые параметры нужно сохранить как «Свои правила».",
      });
  });
export type AutonomyRules = z.infer<typeof autonomySchema>;
export type AutonomyMode = z.infer<typeof autonomyModeSchema>;
export const legacyAutonomy: AutonomyRules = {
  mode: "custom",
  auto_confirm: true,
  auto_confirm_ai: false,
  auto_confirm_open: false,
  confidence_threshold: 0.95,
  fraction_equivalence: true,
  ignore_case: false,
  typo_tolerance: false,
  rounding_digits: null,
};
export const autonomyModes = {
  careful: {
    label: "Осторожный",
    description: "Совпадения с эталоном — автоматически. Оценки ИИ — учителю.",
    threshold: 0.95,
    ai: false,
    open: false,
  },
  balanced: {
    label: "Баланс",
    description:
      "Уверенные короткие ответы — автоматически. Развёрнутые — учителю.",
    threshold: 0.95,
    ai: true,
    open: false,
  },
  fast: {
    label: "Быстрый · полное доверие",
    description:
      "Также принимает уверенные развёрнутые ответы по подтверждённым критериям.",
    threshold: 0.9,
    ai: true,
    open: true,
  },
} as const;
export function matchesPreset(
  rules: Pick<
    AutonomyRules,
    | "auto_confirm"
    | "auto_confirm_ai"
    | "auto_confirm_open"
    | "confidence_threshold"
  >,
  mode: Exclude<AutonomyMode, "custom">,
) {
  const preset = autonomyModes[mode];
  return (
    rules.auto_confirm &&
    rules.auto_confirm_ai === preset.ai &&
    rules.auto_confirm_open === preset.open &&
    rules.confidence_threshold === preset.threshold
  );
}
export function applyAutonomyPreset(
  rules: AutonomyRules,
  mode: Exclude<AutonomyMode, "custom">,
): AutonomyRules {
  const preset = autonomyModes[mode];
  return {
    ...rules,
    mode,
    auto_confirm: true,
    auto_confirm_ai: preset.ai,
    auto_confirm_open: preset.open,
    confidence_threshold: preset.threshold,
  };
}
export function autonomyLabel(mode: AutonomyMode) {
  return mode === "custom" ? "Свои правила" : autonomyModes[mode].label;
}
export function parseStoredAutonomy(input: unknown): AutonomyRules {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const value = input as Record<string, unknown>;
    return autonomySchema.parse({
      ...value,
      ...(value.auto_confirm === false
        ? { auto_confirm_ai: false, auto_confirm_open: false }
        : value.auto_confirm_ai === false
          ? { auto_confirm_open: false }
          : {}),
    });
  }
  return autonomySchema.parse(input);
}

// Pure domain gate shared by row selection and server presentation. SQL independently
// enforces the same exclusions; no browser eligibility/totals are trusted on writes.
export function canBulkConfirm(answer: {
  status: string;
  proposedScore: number | null;
  text: string | null;
  choiceIds: string[];
  flags: string[];
  teacherUnreadable: boolean;
}) {
  return (
    ["needs_review", "auto_accepted"].includes(answer.status) &&
    answer.proposedScore !== null &&
    !answer.teacherUnreadable &&
    (!!answer.text?.trim() || answer.choiceIds.length > 0) &&
    answer.flags.every((flag) =>
      [
        "low_confidence",
        "ai_judgment",
        "open_response",
        "comparison_mismatch",
      ].includes(flag),
    )
  );
}
