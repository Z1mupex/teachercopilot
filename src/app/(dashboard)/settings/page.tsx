import type { Metadata } from "next";

import { SettingsForm } from "@/components/settings/settings-form";
import { getTeacherSettings } from "@/lib/settings/repository";
import { listClasses } from "@/lib/classes/repository";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Настройки — Teacher Copilot" };

export default async function Page() {
  const user = await requireUser("/settings");
  const [saved, classes] = await Promise.all([
    getTeacherSettings(user.id),
    listClasses(user.id),
  ]);
  return (
    <SettingsForm
      initial={saved.settings}
      initialRevision={saved.revision}
      classes={classes}
    />
  );
}
