import type { ReactNode } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { getTeacherSettings } from "@/lib/settings/repository";
import { requireUser } from "@/lib/auth/session";

// Never prerender or share authenticated responses, including builds without credentials.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireUser();
  const { settings } = await getTeacherSettings(user.id);
  return (
    <AppShell
      displayName={settings.full_name}
      email={user.email}
      retentionEnabled={settings.retention_days !== null}
    >
      {children}
    </AppShell>
  );
}
