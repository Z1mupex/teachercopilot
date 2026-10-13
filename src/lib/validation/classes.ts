import { z } from "zod";

function optionalInteger(min: number, max: number, message: string) {
  return z.preprocess(
    (value) => {
      if (value === null || value === "") return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      if (!trimmed) return null;
      return /^\d+$/.test(trimmed) ? Number(trimmed) : value;
    },
    z
      .number({ error: message })
      .int(message)
      .min(min, message)
      .max(max, message)
      .nullable(),
  );
}

export const classIdSchema = z.uuid("Некорректный идентификатор класса.");
export const classInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Введите название класса.")
    .max(100, "Не более 100 символов."),
  grade: optionalInteger(1, 12, "Укажите целое число от 1 до 12."),
  subject: z
    .string()
    .trim()
    .max(120, "Не более 120 символов.")
    .nullable()
    .transform((value) => value || null),
  student_count: optionalInteger(
    0,
    2147483647,
    "Укажите неотрицательное целое число до 2147483647.",
  ),
});
export const deleteClassSchema = z.object({
  id: classIdSchema,
  confirmation: z.literal("delete", { error: "Подтвердите удаление класса." }),
});

export type ClassInput = z.infer<typeof classInputSchema>;
