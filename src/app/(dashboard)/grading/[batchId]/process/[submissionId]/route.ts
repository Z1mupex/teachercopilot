import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { idSchema } from "@/lib/grading/validation";
import { processInputSchema } from "@/lib/grading/grading-validation";
import { processSubmission } from "@/lib/grading/process-submission";
import {
  assertSameOrigin,
  privateHeaders,
  readWorkflowJson,
  workflowResponse,
} from "@/lib/grading/workflow-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function POST(
  request: Request,
  { params }: { params: Promise<{ batchId: string; submissionId: string }> },
) {
  const user = await requireUser("/grading");
  try {
    const { batchId, submissionId } = await params;
    idSchema.parse(batchId);
    idSchema.parse(submissionId);
    assertSameOrigin(request);
    const input = processInputSchema.parse(await readWorkflowJson(request));
    await processSubmission(user.id, batchId, submissionId, input.variant_id);
    for (const path of [
      "/grading",
      "/dashboard",
      `/grading/${batchId}/process`,
      `/grading/${batchId}/review`,
    ])
      revalidatePath(path);
    return Response.json({ ok: true }, { headers: privateHeaders });
  } catch (error) {
    return workflowResponse(error);
  }
}
