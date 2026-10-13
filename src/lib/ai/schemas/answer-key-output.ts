import { z } from "zod";
import { questionTypeSchema } from "@/lib/validation/worksheets";
import { reviewFieldSchema } from "@/lib/grading/answer-key-validation";

// Every field is present, nullable when it cannot be read. Document instructions
// are untrusted content; the model only extracts visible teacher answer data.
export const parsedAnswerKeySchema = z
  .object({
    variants: z
      .array(
        z
          .object({
            label: z.string().max(80).nullable(),
            questions: z
              .array(
                z
                  .object({
                    number: z.number().int().min(1).max(100),
                    type: questionTypeSchema.nullable(),
                    prompt: z.string().max(12000).nullable(),
                    expected_answer: z.string().max(4000).nullable(),
                    numeric_answer: z.number().finite().nullable(),
                    max_score: z.number().finite().min(0).max(1000).nullable(),
                    rubric: z.string().max(12000).nullable(),
                    options: z
                      .array(
                        z
                          .object({
                            label: z.string().min(1).max(30),
                            text: z.string().max(2000),
                          })
                          .strict(),
                      )
                      .max(12),
                    correct_option_labels: z
                      .array(z.string().min(1).max(30))
                      .max(12),
                    confidence: z.number().min(0).max(1).nullable(),
                    uncertain_fields: z.array(reviewFieldSchema).max(8),
                  })
                  .strict(),
              )
              .min(1)
              .max(50),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .superRefine((output, context) => {
    if (output.variants.reduce((sum, v) => sum + v.questions.length, 0) > 50)
      context.addIssue({
        code: "custom",
        message: "Too many parsed questions",
      });
    for (const variant of output.variants) {
      const numbers = variant.questions.map((q) => q.number);
      if (new Set(numbers).size !== numbers.length)
        context.addIssue({
          code: "custom",
          message: "Duplicate question numbers",
        });
      for (const question of variant.questions) {
        const labels = question.options.map((o) => o.label);
        if (new Set(labels).size !== labels.length)
          context.addIssue({
            code: "custom",
            message: "Duplicate option labels",
          });
      }
    }
  });
export type ParsedAnswerKey = z.infer<typeof parsedAnswerKeySchema>;
