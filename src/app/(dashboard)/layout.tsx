import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { getDisplayName } from "@/lib/auth/profile";
import { requireUser } from "@/lib/auth/session";

// Never prerender or share authenticated responses, including builds without credentials.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  return (
    <AppShell displayName={getDisplayName(user)} email={user.email}>
      {children}
    </AppShell>
  );
}
