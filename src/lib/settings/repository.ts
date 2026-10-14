import "server-only";

import { createClient } from "@/lib/supabase/server";
import { throwDatabaseError } from "@/lib/database/errors";
import {
  defaultSettings,
  settingsSchema,
  scaleSchema,
} from "@/lib/settings/schema";
import { z } from "zod";
import {
  parseStoredAutonomy,
  legacyAutonomy,
  matchesPreset,
} from "@/lib/grading/autonomy";

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
  const document = saved.data?.document;
  const settings = document
    ? settingsSchema.parse({
        ...(document as Record<string, unknown>),
        auto_confirm_open:
          (document as Record<string, unknown>).auto_confirm_open ?? false,
      })
    : {
        ...defaultSettings,
        full_name: profile.data.full_name || "Учитель",
        school_name: profile.data.school_name ?? "",
      };
  if (!settings.auto_confirm) {
    settings.auto_confirm_ai = false;
    settings.auto_confirm_open = false;
  }
  if (!settings.auto_confirm_ai) settings.auto_confirm_open = false;
  // Preserve previously active comparison rules when upgrading the dormant preset.
  if (
    settings.ai_preset !== "custom" &&
    !matchesPreset(settings, settings.ai_preset)
  )
    settings.ai_preset = "custom";
  return {
    settings,
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
  if (!data?.grading_preferences) return legacyAutonomy;
  return parseStoredAutonomy(data.grading_preferences);
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
