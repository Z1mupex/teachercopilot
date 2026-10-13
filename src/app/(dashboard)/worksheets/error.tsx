"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function WorksheetsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border bg-card px-6 py-12 text-center"
    >
      <h1 className="text-2xl font-semibold">
        Не удалось загрузить рабочие листы
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Проверьте соединение и попробуйте ещё раз.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        <Button onClick={reset}>Попробовать снова</Button>
        <Link
          href="/dashboard"
          className="rounded-lg text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          На панель
        </Link>
      </div>
    </div>
  );
}
