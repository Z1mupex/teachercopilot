"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { runRetentionCleanup } from "@/actions/settings";

export function RetentionCleanup({ enabled }: { enabled: boolean }) {
  const [error, setError] = useState("");
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    runRetentionCleanup()
      .then((result) => {
        if (!active) return;
        if ("error" in result)
          setError(result.error ?? "Очистка не выполнена.");
        else if (result.removed > 0) router.refresh();
      })
      .catch(() => {
        if (active)
          setError(
            "Не удалось выполнить очистку изображений по сроку хранения.",
          );
      });
    return () => {
      active = false;
    };
  }, [enabled, router]);
  return error ? (
    <p role="alert" className="mb-5 rounded-md border p-3 text-sm">
      {error}{" "}
      <Link href="/settings" className="text-primary underline">
        Настройки данных
      </Link>
    </p>
  ) : null;
}
