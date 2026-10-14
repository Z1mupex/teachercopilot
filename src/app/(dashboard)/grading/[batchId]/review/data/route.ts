import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { idSchema } from "@/lib/grading/validation";
import {
  reviewInputSchema,
  bulkReviewSchema,
} from "@/lib/grading/grading-validation";
import {
  getReviewSlice,
  workflowError,
} from "@/lib/grading/workflow-repository";
import {
  assertSameOrigin,
  privateHeaders,
  readWorkflowJson,
  workflowResponse,
} from "@/lib/grading/workflow-http";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ batchId: string }> };
export async function GET(request: Request, { params }: Context) {
  const user = await requireUser("/grading");
  try {
    const { batchId } = await params;
    idSchema.parse(batchId);
    const url = new URL(request.url);
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(250)
      .parse(url.searchParams.get("page") ?? 0);
    const result = await getReviewSlice(
      user.id,
      batchId,
      url.searchParams.get("all") === "true",
      page,
    );
    return Response.json(
      result ? { result } : { error: "Проверка недоступна." },
      { status: result ? 200 : 404, headers: privateHeaders },
    );
  } catch (error) {
    return workflowResponse(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  await requireUser("/grading");
  try {
    const { batchId } = await params;
    idSchema.parse(batchId);
    assertSameOrigin(request);
    const input = z
      .union([
        reviewInputSchema,
        bulkReviewSchema,
        z.object({ command: z.literal("finalize") }).strict(),
      ])
      .parse(await readWorkflowJson(request));
    const client = await createClient({ writable: true });
    const { error } =
      input.command === "finalize"
        ? await client.rpc("finalize_grading_batch", { p_batch: batchId })
        : input.command === "confirm_many"
          ? await client.rpc("review_grading_answers", {
              p_batch: batchId,
              p_submission: input.submission_id,
              p_answers: input.answers,
              p_whole_paper: input.whole_paper,
            })
          : await client.rpc("review_grading_answer", {
              p_batch: batchId,
              p_answer: input.answer_id,
              p_revision: input.revision,
              p_command: input.command,
              ...(input.command === "score" ? { p_score: input.score } : {}),
            });
    if (error) workflowError(error);
    for (const path of [
      "/grading",
      "/dashboard",
      `/grading/${batchId}/review`,
      `/grading/${batchId}/results`,
    ])
      revalidatePath(path);
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch (error) {
    return workflowResponse(error);
  }
}
