import "server-only";

import { AiRequestError } from "@/lib/ai/errors";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export type AiPurpose =
  | "worksheet_generation"
  | "question_regeneration"
  | "answer_key_parsing"
  | "grading_summary"
  | "grading_calibration"
  | "debate_topics"
  | "submission_grading";
export type AiRunMetadata = {
  request_id?: string;
  response_id?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  error_code?: string;
  question_count?: number;
  page_count?: number;
};

export async function reserveAiRun(
  model: string,
  purpose: AiPurpose,
  inputHash: string,
) {
  const supabase = await createClient({ writable: true });
  const { data, error } = await supabase.rpc("reserve_ai_run", {
    p_model: model,
    p_purpose: purpose,
    p_input_hash: inputHash,
  });
  if (error?.code === "PT429")
    throw new AiRequestError(
      error.message === "ai_request_in_progress" ? "busy" : "rate_limit",
    );
  if (error || !data) {
    console.error("AI run reservation failed", { operation: "reserve" });
    throw new AiRequestError("audit_failed");
  }
  return data;
}

export async function finishAiRun(
  teacherId: string,
  id: string,
  status: "completed" | "failed",
  durationMs: number,
  metadata: AiRunMetadata,
) {
  const supabase = await createClient({ writable: true });
  const { data, error } = await supabase
    .from("ai_runs")
    .update({
      status,
      duration_ms: Math.min(Math.max(Math.round(durationMs), 0), 2_147_483_647),
      output: metadata as Json,
    })
    .eq("id", id)
    .eq("teacher_id", teacherId)
    .eq("status", "running")
    .select("id")
    .maybeSingle();
  if (error || !data) {
    console.error("AI run completion failed", { operation: "finish" });
    throw new AiRequestError("audit_failed");
  }
}
