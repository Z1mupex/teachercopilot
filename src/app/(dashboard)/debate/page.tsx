import type { Metadata } from "next";

import { DebateArena } from "@/components/debate/debate-arena";
import { requireUser } from "@/lib/auth/session";
import { isAiConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Debate Arena — Teacher Copilot" };

export default async function Page() {
  await requireUser("/debate");
  return <DebateArena aiAvailable={isAiConfigured()} />;
}
