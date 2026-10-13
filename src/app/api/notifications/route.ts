import { requireUser } from "@/lib/auth/session";
import { getNotifications } from "@/lib/settings/notifications";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET() {
  const user = await requireUser();
  try {
    return Response.json(await getNotifications(user.id), { headers });
  } catch (error) {
    console.error("Notifications lookup failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Не удалось загрузить уведомления." },
      { status: 503, headers },
    );
  }
}
