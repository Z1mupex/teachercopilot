import "server-only";

import { createClient } from "@/lib/supabase/server";
import { throwDatabaseError } from "@/lib/database/errors";
import {
  defaultSettings,
  settingsSchema,
  gradingSettings,
  scaleSchema,
} from "@/lib/settings/schema";
import { z } from "zod";

export async function getTeacherSettings(teacherId: string) {
  const client = await createClient();
  const [saved, profile] = await Promise.all([
    client
      .from("teacher_settings")
      .select("document,revision")
      .eq("teacher_id", teacherId)
      .maybeSingle(),
    client
      .from("profiles")
      .select("full_name,school_name")
      .eq("id", teacherId)
      .single(),
  ]);
  for (const result of [saved, profile])
    if (result.error) throwDatabaseError("teacher-settings", result.error);
  if (!profile.data)
    throwDatabaseError("teacher-settings-profile", { code: "MissingProfile" });
  return {
    settings: saved.data
      ? settingsSchema.parse(saved.data.document)
      : {
          ...defaultSettings,
          full_name: profile.data.full_name || "Учитель",
          school_name: profile.data.school_name ?? "",
        },
    revision: saved.data?.revision ?? 0,
  };
}

export async function getBatchGradingSettings(
  teacherId: string,
  batchId: string,
) {
  const client = await createClient();
  const { data, error } = await client
    .from("grading_batches")
    .select("grading_preferences")
    .eq("id", batchId)
    .eq("teacher_id", teacherId)
    .single();
  if (error) throwDatabaseError("batch-preferences", error);
  if (!data?.grading_preferences) return gradingSettings(defaultSettings);
  return settingsSchema
    .pick({
      auto_confirm: true,
      auto_confirm_ai: true,
      confidence_threshold: true,
      fraction_equivalence: true,
      ignore_case: true,
      typo_tolerance: true,
      rounding_digits: true,
    })
    .parse(data.grading_preferences);
}

const conversionSchema = z.object({
  kind: z.enum(["fo", "control"]),
  scale: scaleSchema,
});
export async function getBatchConversion(teacherId: string, batchId: string) {
  const client = await createClient();
  const { data, error } = await client
    .from("grading_batches")
    .select("grade_conversion,updated_at")
    .eq("id", batchId)
    .eq("teacher_id", teacherId)
    .single();
  if (error || !data)
    throwDatabaseError("batch-conversion", error ?? { code: "MissingBatch" });
  const { settings } = await getTeacherSettings(teacherId);
  return {
    conversion: data.grade_conversion
      ? conversionSchema.parse(data.grade_conversion)
      : { kind: "fo" as const, scale: settings.fo_scale },
    revision: data.updated_at,
    foScale: settings.fo_scale,
    controlScale: settings.control_scale,
  };
}
