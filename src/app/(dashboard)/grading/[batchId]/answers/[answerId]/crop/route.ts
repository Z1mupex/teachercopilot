import sharp from "sharp";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getBatch, GradingError } from "@/lib/grading/repository";
import { cropSchema } from "@/lib/grading/grading-validation";
import { idSchema } from "@/lib/grading/validation";
import { privateHeaders, workflowResponse } from "@/lib/grading/workflow-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchId: string; answerId: string }> },
) {
  const user = await requireUser("/grading");
  try {
    const { batchId, answerId } = await params;
    idSchema.parse(batchId);
    idSchema.parse(answerId);
    if (!(await getBatch(user.id, batchId)))
      throw new GradingError("Работа недоступна.", 404);
    const client = await createClient();
    const { data: a, error } = await client
      .from("submission_answers")
      .select(
        "recognized_answer,submissions!inner(batch_id,submission_pages(storage_path))",
      )
      .eq("id", answerId)
      .eq("submissions.batch_id", batchId)
      .maybeSingle();
    if (error || !a) throw new GradingError("Ответ недоступен.", 404);
    const recognized = a.recognized_answer;
    const crop = cropSchema.parse(
      recognized && typeof recognized === "object" && !Array.isArray(recognized)
        ? recognized.crop
        : null,
    );
    const path = a.submissions.submission_pages[0]?.storage_path;
    if (!path) throw new GradingError("Оригинал недоступен.", 404);
    const { data: blob, error: downloadError } = await client.storage
      .from("submission-files")
      .download(path);
    if (downloadError || !blob || blob.size > 6 * 1024 * 1024)
      throw new GradingError("Оригинал недоступен.", 503);
    const bytes = Buffer.from(await blob.arrayBuffer()),
      metadata = await sharp(bytes, { limitInputPixels: 40000000 }).metadata();
    if (!metadata.width || !metadata.height)
      throw new GradingError("Неверное изображение.", 422);
    const left = Math.min(
        metadata.width - 1,
        Math.floor(crop.x * metadata.width),
      ),
      top = Math.min(metadata.height - 1, Math.floor(crop.y * metadata.height));
    const width = Math.max(
        1,
        Math.min(metadata.width - left, Math.ceil(crop.width * metadata.width)),
      ),
      height = Math.max(
        1,
        Math.min(
          metadata.height - top,
          Math.ceil(crop.height * metadata.height),
        ),
      );
    const image = await sharp(bytes, { limitInputPixels: 40000000 })
      .extract({ left, top, width, height })
      .jpeg({ quality: 90 })
      .toBuffer();
    return new Response(new Uint8Array(image), {
      headers: { ...privateHeaders, "Content-Type": "image/jpeg" },
    });
  } catch (error) {
    return workflowResponse(error);
  }
}
