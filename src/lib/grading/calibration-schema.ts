import { z } from "zod";
export const calibrationRuleSchema = z
  .object({
    question_id: z.uuid().nullable(),
    instruction: z.string().trim().min(1).max(600),
  })
  .strict();
export const calibrationProfileSchema = z
  .object({
    summary: z.string().trim().min(1).max(800),
    rules: z.array(calibrationRuleSchema).min(1).max(20),
  })
  .strict();
export type CalibrationProfile = z.infer<typeof calibrationProfileSchema>;
export type CalibrationState = {
  enabled: boolean;
  samples: string[];
  profile: CalibrationProfile | null;
  revision: string;
};
export function suggestedCalibrationSamples(ids: string[], count = 5) {
  const amount = Math.min(ids.length, count);
  return Array.from(
    { length: amount },
    (_, index) =>
      ids[
        amount === 1 ? 0 : Math.round((index * (ids.length - 1)) / (amount - 1))
      ],
  );
}
export function calibrationInstructions(
  profile: CalibrationProfile | null,
  questionId: string,
) {
  return (
    profile?.rules
      .filter(
        (rule) => rule.question_id === null || rule.question_id === questionId,
      )
      .map((rule) => rule.instruction) ?? []
  );
}
