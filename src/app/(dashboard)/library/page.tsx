import type { Metadata } from "next";

import { FeaturePlaceholder } from "@/components/shell/feature-placeholder";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Библиотека — Teacher Copilot" };

export default async function Page() {
  await requireUser("/library");
  return (
    <FeaturePlaceholder
      title="Библиотека"
      description="Учебные материалы, задания и шаблоны в одном месте."
    />
  );
}
