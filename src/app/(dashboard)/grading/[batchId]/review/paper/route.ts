import { requireUser } from "@/lib/auth/session";
import { idSchema } from "@/lib/grading/validation";
import { getWorkReview } from "@/lib/grading/workflow-repository";
import { privateHeaders, workflowResponse } from "@/lib/grading/workflow-http";

export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const user = await requireUser("/grading");
  try {
    const { batchId } = await params;
    idSchema.parse(batchId);
    const submission = idSchema.parse(
      new URL(request.url).searchParams.get("submission"),
    );
    const result = await getWorkReview(user.id, batchId, submission);
    return Response.json(
      result ? { result } : { error: "Работа недоступна." },
      { status: result ? 200 : 404, headers: privateHeaders },
    );
  } catch (error) {
    return workflowResponse(error);
  }
}
