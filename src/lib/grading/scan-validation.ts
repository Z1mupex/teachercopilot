import { z } from "zod";
import { idSchema, MAX_PAGES, revisionSchema } from "@/lib/grading/validation";
export const MAX_WORK_PAGES = 10;
export const scanQualitySchema = z
  .object({
    sharpness: z.number().finite().min(0).max(1040400),
    brightness: z.number().finite().min(0).max(255),
    flags: z
      .array(
        z.enum([
          "blur",
          "dark",
          "glare",
          "cut_edges",
          "low_resolution",
          "possible_duplicate",
        ]),
      )
      .max(6),
  })
  .strict();
export const scanReviewSchema = z
  .object({
    batch: idSchema,
    revision: revisionSchema,
    groups: z
      .array(
        z
          .object({
            id: idSchema,
            pages: z.array(idSchema).min(1).max(MAX_WORK_PAGES),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_PAGES),
    reviews: z
      .array(
        z.object({ id: idSchema, version: z.string().min(1).max(80) }).strict(),
      )
      .min(1)
      .max(MAX_PAGES),
    confirmed: z.literal(true),
  })
  .strict()
  .superRefine((input, ctx) => {
    const ids = input.groups.flatMap((group) => group.pages);
    if (
      ids.length > MAX_PAGES ||
      new Set(ids).size !== ids.length ||
      new Set(input.groups.map((g) => g.id)).size !== input.groups.length ||
      new Set(input.reviews.map((r) => r.id)).size !== input.reviews.length ||
      ids.length !== input.reviews.length ||
      input.reviews.some((r) => !ids.includes(r.id))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Каждый лист должен входить ровно в одну работу и быть просмотрен.",
      });
  });
