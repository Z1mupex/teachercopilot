import { z } from "zod";

export const MAX_PAGES = 100;
export const MAX_EDGE = 2400;
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
export const MAX_INPUT_BYTES = 30 * 1024 * 1024;
export const idSchema = z.uuid();
export const revisionSchema = z.string().datetime({ offset: true });
export const batchInputSchema = z
  .object({
    title: z.string().trim().min(1, "Укажите название проверки.").max(160),
    class_id: z
      .union([z.uuid(), z.literal("")])
      .transform((value) => value || null),
    worksheet_id: z
      .union([z.uuid(), z.literal("")])
      .transform((value) => value || null),
  })
  .strict();
export const layoutSchema = z.discriminatedUnion("command", [
  z
    .object({
      command: z.literal("append"),
      ids: z.array(idSchema).min(1).max(MAX_PAGES),
      source: z.literal("batch_scan").optional(),
    })
    .strict(),
  z
    .object({
      command: z.literal("reorder"),
      ids: z.array(idSchema).max(MAX_PAGES),
    })
    .strict(),
  z.object({ command: z.literal("remove"), id: idSchema }).strict(),
  z.object({ command: z.literal("finish") }).strict(),
]);

export type BatchInput = z.infer<typeof batchInputSchema>;
export type LayoutCommand = z.infer<typeof layoutSchema>;
