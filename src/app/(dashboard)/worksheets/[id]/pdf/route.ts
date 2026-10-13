import { requireUser } from "@/lib/auth/session";
import { getPrintableWorksheet } from "@/lib/pdf/repository";
import { WorksheetPrintError } from "@/lib/pdf/student-worksheet";
import { renderWorksheetPdf } from "@/lib/pdf/worksheet-document";
import { worksheetIdSchema } from "@/lib/validation/worksheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser("/worksheets");
  const parsed = worksheetIdSchema.safeParse((await params).id);
  if (!parsed.success)
    return Response.json(
      { error: "Работа не найдена." },
      { status: 404, headers: privateHeaders },
    );
  try {
    const worksheet = await getPrintableWorksheet(user.id, parsed.data);
    if (!worksheet)
      return Response.json(
        { error: "Работа не найдена." },
        { status: 404, headers: privateHeaders },
      );
    const pdf = await renderWorksheetPdf(worksheet);
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="worksheet-${worksheet.id}.pdf"; filename*=UTF-8''${encodeURIComponent(`${worksheet.title}.pdf`)}`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof WorksheetPrintError)
      return Response.json(
        { error: error.message },
        { status: 422, headers: privateHeaders },
      );
    console.error("Worksheet PDF failed", { operation: "render" });
    return Response.json(
      { error: "Не удалось создать PDF. Попробуйте ещё раз." },
      { status: 500, headers: privateHeaders },
    );
  }
}
