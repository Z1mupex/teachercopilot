"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function GradingError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-2xl border bg-card px-6 py-12 text-center"
    >
      <h1 className="text-2xl font-semibold">Не удалось загрузить проверку</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Проверьте соединение. После восстановления обновите данные перед
        повтором обработки.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
        <Button onClick={retry}>Попробовать снова</Button>
        <Link href="/grading" className="text-sm text-primary">
          Все проверки
        </Link>
      </div>
    </div>
  );
}
