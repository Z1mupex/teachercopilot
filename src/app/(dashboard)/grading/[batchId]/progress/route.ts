import { requireUser } from "@/lib/auth/session";
import { idSchema } from "@/lib/grading/validation";
import { getGradingProgress } from "@/lib/grading/workflow-repository";
import { privateHeaders, workflowResponse } from "@/lib/grading/workflow-http";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const user = await requireUser("/grading");
  try {
    const { batchId } = await params;
    idSchema.parse(batchId);
    const progress = await getGradingProgress(user.id, batchId);
    return Response.json(
      progress ? { progress } : { error: "Проверка недоступна." },
      { status: progress ? 200 : 404, headers: privateHeaders },
    );
  } catch (error) {
    return workflowResponse(error);
  }
}
