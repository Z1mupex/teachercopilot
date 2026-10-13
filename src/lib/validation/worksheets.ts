import { z } from "zod";

export const questionTypeSchema = z.enum([
  "multiple_choice",
  "short_answer",
  "numeric",
  "open_response",
]);

const questionBase = {
  id: z.uuid(),
  prompt: z.string().max(12000, "Текст задания слишком длинный."),
  max_score: z.number().finite().min(0).max(1000),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable(),
  generation_context: z
    .object({
      topic: z.string().trim().min(1).max(500),
      approximate_duration: z.number().int().min(1).max(240),
    })
    .strict()
    .nullable(),
};

export const questionInputSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        ...questionBase,
        type: z.literal("multiple_choice"),
        options: z
          .array(
            z.object({ id: z.uuid(), text: z.string().max(2000) }).strict(),
          )
          .max(12),
        correct_option_ids: z.array(z.uuid()).max(12),
      })
      .strict(),
    z
      .object({
        ...questionBase,
        type: z.literal("short_answer"),
        expected_answer: z.string().max(4000),
      })
      .strict(),
    z
      .object({
        ...questionBase,
        type: z.literal("numeric"),
        expected_answer: z.number().finite(),
        tolerance: z.number().finite().min(0).max(1000000),
      })
      .strict(),
    z
      .object({
        ...questionBase,
        type: z.literal("open_response"),
        expected_answer: z.string().max(12000).nullable(),
        rubric: z.string().max(12000).nullable(),
      })
      .strict(),
  ])
  .superRefine((question, context) => {
    if (question.type !== "multiple_choice") return;
    const ids = question.options.map((option) => option.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["options"],
        message: "Варианты ответа должны иметь разные идентификаторы.",
      });
    if (
      new Set(question.correct_option_ids).size !==
      question.correct_option_ids.length
    )
      context.addIssue({
        code: "custom",
        path: ["correct_option_ids"],
        message: "Правильные ответы не должны повторяться.",
      });
    if (question.correct_option_ids.some((id) => !ids.includes(id)))
      context.addIssue({
        code: "custom",
        path: ["correct_option_ids"],
        message: "Выберите правильные ответы из существующих вариантов.",
      });
  });

export const readyQuestionSchema = questionInputSchema.superRefine(
  (question, context) => {
    if (!question.prompt.trim())
      context.addIssue({
        code: "custom",
        path: ["prompt"],
        message: "Добавьте текст задания.",
      });
    if (question.type === "multiple_choice") {
      if (question.options.length < 2)
        context.addIssue({
          code: "custom",
          path: ["options"],
          message: "Добавьте хотя бы два варианта ответа.",
        });
      question.options.forEach((option, index) => {
        if (!option.text.trim())
          context.addIssue({
            code: "custom",
            path: ["options", index, "text"],
            message: "Заполните вариант ответа.",
          });
      });
      if (!question.correct_option_ids.length)
        context.addIssue({
          code: "custom",
          path: ["correct_option_ids"],
          message: "Отметьте хотя бы один правильный ответ.",
        });
    }
    if (question.type === "short_answer" && !question.expected_answer.trim())
      context.addIssue({
        code: "custom",
        path: ["expected_answer"],
        message: "Укажите правильный ответ.",
      });
  },
);

export const worksheetSchema = z
  .object({
    title: z.string().trim().min(1, "Укажите название работы.").max(200),
    subject: z.string().max(120).nullable(),
    grade: z.number().int().min(1).max(12).nullable(),
    status: z.enum(["draft", "ready"]),
    questions: z.array(questionInputSchema).max(100),
    // The existing null-variant questions remain the base (Variant 1).
    variants: z
      .array(
        z
          .object({
            id: z.uuid(),
            label: z
              .string()
              .trim()
              .min(1, "Укажите название варианта.")
              .max(80),
            questions: z.array(questionInputSchema).max(100),
          })
          .strict(),
      )
      .max(9)
      .optional(),
  })
  .strict();

export const worksheetInputSchema = worksheetSchema.superRefine(
  (worksheet, context) => {
    const variants = worksheet.variants ?? [];
    const variantIds = variants.map((variant) => variant.id);
    const labels = [
      "Вариант 1",
      ...variants.map((variant) => variant.label),
    ].map((label) => label.trim().toLocaleLowerCase("ru-RU"));
    if (
      new Set(variantIds).size !== variantIds.length ||
      new Set(labels).size !== labels.length
    )
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Идентификаторы и названия вариантов должны быть разными.",
      });
    const groups = [
      { questions: worksheet.questions, path: ["questions"] },
      ...variants.map((variant, index) => ({
        questions: variant.questions,
        path: ["variants", index, "questions"],
      })),
    ];
    const allQuestions = groups.flatMap((group) => group.questions);
    if (allQuestions.length > 300)
      context.addIssue({
        code: "custom",
        path: ["variants"],
        message: "Во всех вариантах допускается не более 300 заданий.",
      });
    const ids = allQuestions.map((question) => question.id);
    if (new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Задания должны иметь разные идентификаторы.",
      });
    if (worksheet.status !== "ready") return;
    for (const group of groups) {
      if (!group.questions.length)
        context.addIssue({
          code: "custom",
          path: group.path,
          message: "Добавьте хотя бы одно задание в каждый вариант.",
        });
      group.questions.forEach((question, index) => {
        const parsed = readyQuestionSchema.safeParse(question);
        if (!parsed.success)
          parsed.error.issues.forEach((issue) =>
            context.addIssue({
              code: "custom",
              path: [...group.path, index, ...issue.path],
              message: `${group.path[0] === "variants" ? `Вариант ${Number(group.path[1]) + 2}: ` : "Вариант 1: "}${issue.message}`,
            }),
          );
      });
    }
  },
);

export const worksheetIdSchema = z.uuid();
export const saveWorksheetSchema = z
  .object({
    id: z.uuid().optional(),
    expected_updated_at: z.iso.datetime({ offset: true }).optional(),
    document: worksheetInputSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.id && !input.expected_updated_at)
      context.addIssue({
        code: "custom",
        path: ["expected_updated_at"],
        message: "Обновите страницу перед сохранением.",
      });
  });
