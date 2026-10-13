import type { Metadata } from "next";

import { FeaturePlaceholder } from "@/components/shell/feature-placeholder";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Настройки — Teacher Copilot" };

export default async function Page() {
  await requireUser("/settings");
  return (
    <FeaturePlaceholder
      title="Настройки"
      description="Настройки вашего профиля и рабочего пространства."
    />
  );
}
